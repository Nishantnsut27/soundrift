package tech.soundrift.playback;

import android.content.Context;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** User downloads are kept separately from the disposable sliding buffer. */
final class OfflineFiles {
    static final ExecutorService io = Executors.newSingleThreadExecutor();
    private static final long MAX_FILE = 24L * 1024 * 1024, MAX_TOTAL = MAX_FILE * 20;
    private static File directory(Context context) {
        File directory = new File(context.getNoBackupFilesDir(), "soundrift-downloads"); directory.mkdirs(); return directory;
    }
    private static String identity(JSONObject track) {
        return hash(track.optString("provider", "default") + ":" + track.optString("id"));
    }
    private static String hash(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder name = new StringBuilder(); for (byte b : hash) name.append(String.format("%02x", b)); return name.toString();
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
    static File file(Context context, JSONObject track) { return new File(directory(context), identity(track) + ".audio"); }
    static File forCacheKey(Context context, String key) {
        int delimiter = key.lastIndexOf(':');
        return new File(directory(context), hash(delimiter < 0 ? key : key.substring(0, delimiter)) + ".audio");
    }
    static JSONArray list(Context context) {
        JSONArray records;
        try { records = new JSONArray(context.getSharedPreferences("soundrift-offline", 0).getString("records", "[]")); }
        catch (Exception ignored) { records = new JSONArray(); }
        JSONArray valid = new JSONArray();
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.optJSONObject(i);
            if (record != null && record.optJSONObject("track") != null && file(context, record.optJSONObject("track")).length() > 0) valid.put(record);
        }
        return valid;
    }
    static void save(Context context, JSONObject track) throws Exception {
        if (track == null || track.optString("id").isEmpty()) throw new Exception("Missing track");
        if (file(context, track).length() > 0) return;
        String address = track.optString("audio"); if (address.isEmpty()) address = track.optString("audiodownload");
        URL url = new URL(address);
        if (!url.getProtocol().equals("https") && !url.getProtocol().equals("http")) throw new Exception("Invalid audio source");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(15_000); connection.setReadTimeout(20_000);
        File temporary = new File(directory(context), identity(track) + ".partial");
        try {
            String type = connection.getContentType(); long expected = connection.getContentLengthLong();
            if (connection.getResponseCode() != 200 || type == null || !(type.startsWith("audio/") || type.startsWith("application/ogg")) || expected > MAX_FILE) throw new Exception("The audio source could not be downloaded");
            long existing = 0; JSONArray records = list(context);
            for (int i = 0; i < records.length(); i++) existing += records.optJSONObject(i).optLong("size");
            long total = 0, started = android.os.SystemClock.elapsedRealtime();
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[64 * 1024]; int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_FILE || total + existing > MAX_TOTAL || directory(context).getUsableSpace() < read + 10 * 1024 * 1024) throw new Exception("Offline storage is full or this song is too large");
                    if (android.os.SystemClock.elapsedRealtime() - started > 120_000) throw new Exception("Offline save timed out");
                    output.write(buffer, 0, read);
                }
            }
            if (total == 0 || expected > 0 && total != expected || !temporary.renameTo(file(context, track))) throw new Exception("Incomplete audio download");
            JSONObject record = new JSONObject(); record.put("track", track); record.put("size", total); record.put("savedAt", System.currentTimeMillis()); records.put(record);
            if (!context.getSharedPreferences("soundrift-offline", 0).edit().putString("records", records.toString()).commit()) { file(context, track).delete(); throw new Exception("Could not save download metadata"); }
        } finally { temporary.delete(); connection.disconnect(); }
    }
    static void remove(Context context, JSONObject track) throws Exception {
        JSONArray remaining = new JSONArray(), records = list(context);
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.optJSONObject(i);
            if (track == null || identity(record.optJSONObject("track")).equals(identity(track))) {
                File file = file(context, record.optJSONObject("track"));
                if (file.exists() && !file.delete()) throw new Exception("Could not remove download");
            } else remaining.put(record);
        }
        context.getSharedPreferences("soundrift-offline", 0).edit().putString("records", remaining.toString()).commit();
    }
}
