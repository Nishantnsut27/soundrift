package tech.soundrift.playback;

import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Media, queue advancement, downloads, retries, and recommendation requests all
 * live in the service. Closing/suspending the WebView does not own this lifecycle. */
@UnstableApi
public class PlaybackService extends MediaSessionService {
    static PlaybackService instance;
    private static final long MAX_FILE = 24L * 1024 * 1024, MAX_CACHE = 320L * 1024 * 1024;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService downloads = Executors.newSingleThreadExecutor(), api = Executors.newSingleThreadExecutor();
    private final Map<String, Integer> failures = new HashMap<>();
    private final Map<String, Long> retryAt = new HashMap<>();
    private volatile Set<String> keep = Collections.emptySet();
    private volatile boolean destroyed = false;
    private ExoPlayer player;
    private MediaSession session;
    private File directory;
    private JSObject config = new JSObject();
    private JSONArray tracks = new JSONArray();
    private boolean applying, downloading, recommending, recovering, wasOnline = true;
    private volatile boolean storageLimited;
    private String error, lastEntry = "", recommendationKey = "";
    private int recoveryAttempts, recoveryGeneration;
    private long recommendationRetryAt, lastProgressAt;
    private long lastPosition = -1;
    private long lastPersistAt = -5000, persistedRevision = -1;
    private String persistedEntry = "";
    private boolean persistedPlaying;

    @Override public void onCreate() {
        super.onCreate(); instance = this;
        directory = new File(getNoBackupFilesDir(), "soundrift-audio");
        directory.mkdirs();
        File[] interrupted = directory.listFiles();
        if (interrupted != null) for (File file : interrupted) if (file.getName().endsWith(".partial")) file.delete();
        ResolvingDataSource.Factory source = new ResolvingDataSource.Factory(new DefaultDataSource.Factory(this), spec -> {
            File saved = OfflineFiles.forCacheKey(this, spec.key == null ? "" : spec.key);
            if (saved.length() > 0) return spec.withUri(Uri.fromFile(saved));
            File local = fileFor(spec.key == null ? "" : spec.key);
            return local.isFile() && local.length() > 0 ? spec.withUri(Uri.fromFile(local)) : spec;
        });
        player = new ExoPlayer.Builder(this).setMediaSourceFactory(new DefaultMediaSourceFactory(source)).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.setWakeMode(C.WAKE_MODE_NETWORK);
        session = new MediaSession.Builder(this, player).build();
        player.addListener(new Player.Listener() {
            @Override public void onEvents(@NonNull Player ignored, @NonNull Player.Events events) {
                if (!applying) { maintain(); publish(); }
            }
            @Override public void onMediaItemTransition(@Nullable MediaItem item, int reason) {
                String id = item == null ? "" : item.mediaId;
                if (!id.equals(lastEntry)) { recoveryAttempts = 0; recoveryGeneration++; recovering = false; error = null; lastEntry = id; }
                lastProgressAt = SystemClock.elapsedRealtime();
            }
            @Override public void onPlayerError(@NonNull PlaybackException problem) { recover(); }
        });
        main.post(tick);
    }

    @Override public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra("snapshot")) {
            try {
                JSObject next = new JSObject(intent.getStringExtra("snapshot"));
                JSObject latest = SoundriftPlaybackPlugin.latestCommand;
                if (latest != null && latest.optLong("revision") > next.optLong("revision")) next = latest;
                configure(next);
                if (!next.optBoolean("playing")) { stopSelf(); return START_NOT_STICKY; }
            } catch (Exception ignored) { stopSelf(); return START_NOT_STICKY; }
        }
        return super.onStartCommand(intent, flags, startId);
    }
    @Nullable @Override public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controller) { return session; }

    void configure(JSObject next) {
        if (next.optLong("revision") <= config.optLong("revision")) return;
        applying = true;
        try {
            recoveryGeneration++; recovering = false;
            String previousId = player.getCurrentMediaItem() == null ? "" : player.getCurrentMediaItem().mediaId;
            long previousPosition = player.getCurrentPosition();
            JSONArray requested = next.optJSONArray("queue"); if (requested == null) requested = new JSONArray();
            JSONObject requestedTrack = requested.optJSONObject(next.optInt("currentIndex", -1));
            String requestedId = requestedTrack == null ? "" : requestedTrack.optString("queueEntryId");
            config = next;
            if (next.optBoolean("queueChanged", true) || tracks.length() == 0) tracks = requested;
            int index = Math.max(0, Math.min(next.optInt("currentIndex"), tracks.length() - 1));
            boolean preserveCurrent = !next.optBoolean("select") && indexOf(previousId) >= 0;
            int selected = indexOf(preserveCurrent ? previousId : requestedId);
            if (selected >= 0) index = selected;
            String selectedId = tracks.length() > 0 ? track(index).optString("queueEntryId") : "";
            // Playback may have advanced since WebKit sent this seek. Never seek the successor.
            boolean applySeek = next.has("seekPosition") && requestedId.equals(selectedId);
            // Reconcile edits in place so adding/reordering upcoming songs does not reload the current one.
            Set<String> desiredIds = new HashSet<>();
            for (int i = 0; i < tracks.length(); i++) desiredIds.add(track(i).optString("queueEntryId"));
            for (int i = player.getMediaItemCount() - 1; i >= 0; i--) if (!desiredIds.contains(player.getMediaItemAt(i).mediaId)) player.removeMediaItem(i);
            for (int i = 0; i < tracks.length(); i++) {
                MediaItem desired = mediaItem(track(i));
                int found = -1;
                for (int j = i; j < player.getMediaItemCount(); j++) if (player.getMediaItemAt(j).mediaId.equals(desired.mediaId)) { found = j; break; }
                if (found < 0) player.addMediaItem(i, desired);
                else {
                    if (found != i) player.moveMediaItem(found, i);
                    MediaItem old = player.getMediaItemAt(i);
                    if (old.localConfiguration != null && !old.localConfiguration.uri.equals(desired.localConfiguration.uri)) player.replaceMediaItem(i, desired);
                }
            }
            if (tracks.length() == 0) { player.stop(); player.clearMediaItems(); error = null; }
            else {
                boolean ended = player.getPlaybackState() == Player.STATE_ENDED && next.optBoolean("playing");
                if (next.optBoolean("retry")) {
                    recoveryAttempts = 0; error = null; player.stop(); player.replaceMediaItem(index, mediaItem(track(index)));
                }
                if (!selectedId.equals(previousId) || applySeek || next.optBoolean("retry") || ended) {
                    double position = applySeek ? next.optDouble("seekPosition") : ended ? 0
                        : preserveCurrent ? previousPosition / 1000.0 : next.optDouble("position");
                    player.seekTo(index, (long) (Math.max(0, position) * 1000));
                }
                player.setRepeatMode("one".equals(next.optString("repeatMode")) ? Player.REPEAT_MODE_ONE : "all".equals(next.optString("repeatMode")) ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF);
                player.setVolume((float) Math.max(0, Math.min(1, next.optDouble("volume", 0.8))));
                if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
                player.setPlayWhenReady(next.optBoolean("playing"));
            }
            failures.clear(); retryAt.clear(); storageLimited = false;
        } finally { applying = false; }
        maintain(); publish();
        if (tracks.length() == 0) stopSelf();
    }

    private JSONObject track(int index) { JSONObject value = tracks.optJSONObject(index); return value == null ? new JSONObject() : value; }
    private int indexOf(String entryId) {
        if (entryId.isEmpty()) return -1;
        for (int i = 0; i < tracks.length(); i++) if (entryId.equals(track(i).optString("queueEntryId"))) return i;
        return -1;
    }
    private MediaItem mediaItem(JSONObject track) {
        String source = track.optString("audio", track.optString("audiodownload"));
        if (source.isEmpty()) source = track.optString("audiodownload");
        return new MediaItem.Builder().setMediaId(track.optString("queueEntryId")).setUri(source).setCustomCacheKey(track.optString("cacheKey"))
            .setMediaMetadata(new MediaMetadata.Builder().setTitle(track.optString("name")).setArtist(track.optString("artist_name"))
                .setAlbumTitle(track.optString("album_name")).setArtworkUri(Uri.parse(track.optString("image"))).build()).build();
    }
    private File fileFor(String key) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
            StringBuilder name = new StringBuilder(); for (byte b : digest) name.append(String.format("%02x", b));
            return new File(directory, name + ".audio");
        } catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }
    private int preparationTarget() {
        JSONObject context = config.optJSONObject("context");
        String kind = context == null ? "single" : context.optString("kind");
        int maximum = "playlist".equals(kind) || "album".equals(kind) ? 8 : 4;
        // Also clamp configurations persisted by an older app version.
        return Math.min(maximum, Math.max(1, config.optInt("target", maximum)));
    }
    private List<Integer> upcoming() {
        List<Integer> result = new ArrayList<>();
        int index = player.getCurrentMediaItemIndex(), count = tracks.length(), target = preparationTarget();
        if (count == 0) return result;
        for (int i = 0; i < target; i++) {
            if (!"one".equals(config.optString("repeatMode"))) index++;
            if (index >= count) { if (!"all".equals(config.optString("repeatMode"))) break; index = 0; }
            result.add(index);
            if ("one".equals(config.optString("repeatMode")) || count == 1) break;
        }
        return result;
    }
    private boolean dataSaver() {
        ConnectivityManager network = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        return network != null && network.isActiveNetworkMetered() && network.getRestrictBackgroundStatus() == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED;
    }
    private boolean online() {
        ConnectivityManager network = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        return network != null && network.getActiveNetwork() != null;
    }
    private void maintain() {
        if (destroyed || applying || tracks.length() == 0) return;
        Set<String> protectedKeys = new HashSet<>();
        int current = player.getCurrentMediaItemIndex();
        for (int i : upcoming()) protectedKeys.add(track(i).optString("cacheKey"));
        for (int i = Math.max(0, current - 2); i <= current; i++) protectedKeys.add(track(i).optString("cacheKey"));
        keep = Collections.unmodifiableSet(new HashSet<>(protectedKeys));
        failures.keySet().retainAll(keep); retryAt.keySet().retainAll(keep);
        recommend();
        if (downloading || !player.getPlayWhenReady() || !online() || dataSaver() || player.getPlaybackState() == Player.STATE_BUFFERING) return;
        boolean localCurrent = fileFor(track(current).optString("cacheKey")).isFile() || OfflineFiles.file(this, track(current)).length() > 0;
        long duration = player.getDuration();
        if (!localCurrent && player.getTotalBufferedDuration() < 20_000 && (duration == C.TIME_UNSET || player.getBufferedPosition() < duration - 250)) return;
        for (int i : upcoming()) {
            JSONObject entry = track(i); String key = entry.optString("cacheKey");
            if (key.isEmpty() || fileFor(key).isFile() || OfflineFiles.file(this, entry).length() > 0 || retryAt.getOrDefault(key, 0L) > SystemClock.elapsedRealtime()) continue;
            downloading = true;
            String apiBase = config.optString("apiBase");
            String serializedEntry = entry.toString();
            downloads.execute(() -> {
                boolean ok = false;
                try { prune(); download(new JSONObject(serializedEntry), apiBase); ok = true; } catch (Exception ignored) { }
                final boolean success = ok;
                main.post(() -> {
                    downloading = false;
                    if (destroyed) return;
                    if (success) { failures.remove(key); retryAt.remove(key); }
                    else if (keep.contains(key)) {
                        int attempts = failures.getOrDefault(key, 0) + 1; failures.put(key, attempts);
                        retryAt.put(key, attempts > 2 ? Long.MAX_VALUE : SystemClock.elapsedRealtime() + (attempts == 1 ? 2000 : 10_000));
                    }
                    maintain(); publish();
                });
            });
            break;
        }
    }
    private void prune() {
        Set<String> names = new HashSet<>(); for (String key : keep) names.add(fileFor(key).getName());
        File[] files = directory.listFiles(); if (files == null) return;
        for (File file : files) if (file.getName().endsWith(".audio") && !names.contains(file.getName())) file.delete();
    }
    private long cacheBytes() {
        long bytes = 0; File[] files = directory.listFiles();
        if (files != null) for (File file : files) if (file.getName().endsWith(".audio")) bytes += file.length();
        return bytes;
    }
    private void download(JSONObject entry, String apiBase) throws Exception {
        String key = entry.optString("cacheKey"), source = entry.optString("audio");
        if (source.isEmpty()) source = entry.optString("audiodownload");
        HttpURLConnection connection = connection(source);
        File temporary = new File(directory, fileFor(key).getName() + ".partial");
        try {
            int status = connection.getResponseCode();
            if (status == 401 || status == 403 || status == 404 || status == 410) {
                connection.disconnect();
                JSONObject fresh = json(apiBase + "/api/music/song/" + Uri.encode(entry.optString("id")) + "?refresh=1").optJSONObject("data");
                if (fresh == null || !audioKey(fresh).equals(key)) throw new Exception("Refresh failed");
                connection = connection(fresh.optString("audio")); status = connection.getResponseCode();
            }
            String type = connection.getContentType();
            long length = connection.getContentLengthLong();
            if (status != 200 || type == null || !(type.startsWith("audio/") || type.startsWith("application/ogg")) || length > MAX_FILE) throw new Exception("Invalid audio");
            if (directory.getUsableSpace() < Math.max(0, length) + 10 * 1024 * 1024 || cacheBytes() + Math.max(0, length) > MAX_CACHE) { storageLimited = true; throw new Exception("Storage full"); }
            long total = 0, began = SystemClock.elapsedRealtime();
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[64 * 1024]; int read;
                while ((read = input.read(buffer)) != -1) {
                    if (destroyed || !keep.contains(key) || SystemClock.elapsedRealtime() - began > 120_000) throw new Exception("Cancelled");
                    total += read; if (total > MAX_FILE) throw new Exception("Oversized audio");
                    if (cacheBytes() + total > MAX_CACHE || directory.getUsableSpace() < read + 10 * 1024 * 1024) { storageLimited = true; throw new Exception("Storage full"); }
                    output.write(buffer, 0, read);
                }
            }
            if (total == 0 || length > 0 && total != length || !temporary.renameTo(fileFor(key))) throw new Exception("Incomplete audio");
        } finally { connection.disconnect(); temporary.delete(); }
    }
    private HttpURLConnection connection(String address) throws Exception {
        URL url = new URL(address);
        if (!url.getProtocol().equals("https") && !url.getProtocol().equals("http")) throw new Exception("Invalid source");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(15_000); connection.setReadTimeout(20_000); return connection;
    }
    private JSONObject json(String address) throws Exception {
        HttpURLConnection connection = connection(address);
        try (InputStream input = connection.getInputStream()) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            long began = SystemClock.elapsedRealtime();
            byte[] buffer = new byte[8192]; int read;
            while ((read = input.read(buffer)) != -1) {
                if (bytes.size() + read > 2 * 1024 * 1024 || SystemClock.elapsedRealtime() - began > 30_000) throw new Exception("Invalid API response");
                bytes.write(buffer, 0, read);
            }
            return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        } finally { connection.disconnect(); }
    }
    private void recommend() {
        int current = player.getCurrentMediaItemIndex();
        if (!config.optBoolean("autoplay") || !player.getPlayWhenReady() || "one".equals(config.optString("repeatMode"))
            || tracks.length() - current - 1 > 8 || recommending || SystemClock.elapsedRealtime() < recommendationRetryAt) return;
        JSONObject source = track(current);
        String requestKey = source.optString("id") + ":" + tracks.length();
        if (requestKey.equals(recommendationKey)) return;
        recommendationKey = requestKey; recommending = true;
        long revision = config.optLong("revision"); String base = config.optString("apiBase");
        api.execute(() -> {
            JSONArray suggestions;
            try { suggestions = json(base + "/api/music/suggestions/" + Uri.encode(source.optString("id")) + "?limit=30").optJSONArray("data"); }
            catch (Exception ignored) { suggestions = null; }
            final JSONArray results = suggestions;
            main.post(() -> {
                recommending = false;
                if (destroyed || revision != config.optLong("revision")) { recommendationKey = ""; return; }
                int added = 0; Set<String> known = new HashSet<>();
                for (int i = 0; i < tracks.length(); i++) known.add(track(i).optString("provider") + ":" + track(i).optString("id"));
                if (results != null) for (int i = 0; i < results.length() && added < 10; i++) {
                    JSONObject item = results.optJSONObject(i);
                    if (item == null || item.optString("audio").isEmpty() || !known.add(item.optString("provider") + ":" + item.optString("id"))) continue;
                    try {
                        item.put("queueEntryId", "native:" + java.util.UUID.randomUUID()); item.put("cacheKey", audioKey(item));
                        tracks.put(item); player.addMediaItem(mediaItem(item)); added++;
                    } catch (Exception ignored) { }
                }
                if (added == 0) { recommendationKey = ""; recommendationRetryAt = SystemClock.elapsedRealtime() + 30_000; }
                publish(); maintain();
            });
        });
    }
    private String audioKey(JSONObject item) {
        Uri uri = Uri.parse(item.optString("audio").isEmpty() ? item.optString("audiodownload") : item.optString("audio"));
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("_(\\d{2,3})\\.\\w+$").matcher(uri.getPath() == null ? "" : uri.getPath());
        String quality = match.find() ? match.group(1) : uri.getQueryParameter("format");
        return item.optString("provider", "default") + ":" + item.optString("id") + ":" + (quality == null ? "default" : quality);
    }
    private void recover() {
        if (destroyed || recovering || !player.getPlayWhenReady()) return;
        JSONObject entry = track(player.getCurrentMediaItemIndex());
        if (++recoveryAttempts == 1) {
            // Recreate the source so a complete file downloaded during a stall is used.
            restartCurrent(entry);
        } else if (recoveryAttempts == 2) {
            fileFor(entry.optString("cacheKey")).delete();
            String alternate = entry.optString("audiodownload");
            if (!alternate.isEmpty() && !alternate.equals(entry.optString("audio"))) {
                try { entry.put("audio", alternate); entry.put("cacheKey", audioKey(entry)); } catch (Exception ignored) { }
                restartCurrent(entry);
            } else recover();
        } else if (recoveryAttempts == 3) {
            recovering = true;
            int requestGeneration = ++recoveryGeneration;
            long generation = config.optLong("revision"); String id = entry.optString("queueEntryId"), base = config.optString("apiBase");
            api.execute(() -> {
                JSONObject fresh;
                try { fresh = json(base + "/api/music/song/" + Uri.encode(entry.optString("id")) + "?refresh=1").optJSONObject("data"); }
                catch (Exception ignored) { fresh = null; }
                final JSONObject refreshed = fresh;
                main.post(() -> {
                    if (requestGeneration != recoveryGeneration) return;
                    recovering = false;
                    if (destroyed || generation != config.optLong("revision") || !id.equals(track(player.getCurrentMediaItemIndex()).optString("queueEntryId")) || !player.getPlayWhenReady()) return;
                    if (refreshed != null && refreshed.optString("id").equals(entry.optString("id")) && refreshed.optString("provider").equals(entry.optString("provider")) && !refreshed.optString("audio").isEmpty()) {
                        try { entry.put("audio", refreshed.optString("audio")); entry.put("cacheKey", audioKey(entry)); } catch (Exception ignored) { }
                        restartCurrent(entry);
                    } else recover();
                });
            });
        } else { error = "This song could not be loaded. Tap Retry to continue."; player.pause(); publish(); }
    }
    private void restartCurrent(JSONObject entry) {
        int index = player.getCurrentMediaItemIndex(); long position = player.getCurrentPosition();
        applying = true;
        try { player.stop(); player.replaceMediaItem(index, mediaItem(entry)); player.seekTo(index, position); player.prepare(); player.play(); }
        finally { applying = false; }
        lastProgressAt = SystemClock.elapsedRealtime();
    }
    void seek(double seconds) { player.seekTo((long) (Math.max(0, seconds) * 1000)); publish(); }
    void retry() { error = null; recoveryAttempts = 0; failures.clear(); retryAt.clear(); player.prepare(); player.play(); maintain(); publish(); }
    JSObject snapshot() {
        JSObject result;
        try { result = new JSObject(config.toString()); } catch (Exception ignored) { result = new JSObject(); }
        result.put("queue", tracks); result.put("currentIndex", tracks.length() == 0 ? -1 : player.getCurrentMediaItemIndex());
        result.put("position", player.getCurrentPosition() / 1000.0);
        result.put("duration", player.getDuration() == C.TIME_UNSET ? 0 : player.getDuration() / 1000.0);
        result.put("playing", player.getPlayWhenReady() && player.getPlaybackState() != Player.STATE_ENDED);
        result.put("buffering", player.getPlaybackState() == Player.STATE_BUFFERING); result.put("error", error == null ? JSONObject.NULL : error);
        List<Integer> upcoming = upcoming(); int ready = 0, consecutive = 0; boolean gap = false;
        for (int index : upcoming) {
            boolean available = fileFor(track(index).optString("cacheKey")).isFile() || OfflineFiles.file(this, track(index)).length() > 0;
            if (available) ready++; else gap = true;
            if (!gap) consecutive++;
        }
        JSObject buffer = new JSObject(); buffer.put("target", preparationTarget()); buffer.put("total", upcoming.size());
        buffer.put("ready", ready); buffer.put("contiguousReady", consecutive); buffer.put("downloading", downloading);
        buffer.put("failed", failures.size()); buffer.put("bytes", cacheBytes());
        buffer.put("limited", !online() ? "offline" : dataSaver() ? "data-saver" : storageLimited ? "storage" : JSONObject.NULL);
        result.put("buffer", buffer); return result;
    }
    private void publish() {
        if (destroyed || applying) return;
        JSObject state = snapshot();
        long now = SystemClock.elapsedRealtime();
        String entry = track(player.getCurrentMediaItemIndex()).optString("queueEntryId");
        boolean playing = state.optBoolean("playing");
        if (now - lastPersistAt >= 5000 || config.optLong("revision") != persistedRevision || !entry.equals(persistedEntry) || playing != persistedPlaying) {
            lastPersistAt = now; persistedRevision = config.optLong("revision"); persistedEntry = entry; persistedPlaying = playing;
            getSharedPreferences("soundrift-playback", 0).edit().putString("snapshot", state.toString()).apply();
        }
        SoundriftPlaybackPlugin.emit(state);
    }
    private final Runnable tick = new Runnable() { @Override public void run() {
        if (destroyed) return;
        long position = player.getCurrentPosition(), now = SystemClock.elapsedRealtime();
        boolean connected = online();
        if (!wasOnline && connected) { failures.clear(); retryAt.clear(); storageLimited = false; }
        wasOnline = connected;
        if (position != lastPosition) { lastPosition = position; lastProgressAt = now; }
        if (player.getPlayWhenReady() && player.getPlaybackState() == Player.STATE_BUFFERING && now - lastProgressAt > 20_000) { lastProgressAt = now; recover(); }
        maintain(); publish(); main.postDelayed(this, 1000);
    } };
    @Override public void onDestroy() {
        lastPersistAt = -5000;
        publish(); destroyed = true; instance = null; keep = Collections.emptySet(); main.removeCallbacksAndMessages(null);
        downloads.shutdownNow(); api.shutdownNow();
        if (session != null) session.release(); if (player != null) player.release(); super.onDestroy();
    }
}
