package tech.soundrift.playback;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import androidx.media3.common.util.UnstableApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;

@CapacitorPlugin(name = "SoundriftPlayback")
@UnstableApi
public class SoundriftPlaybackPlugin extends Plugin {
    static WeakReference<SoundriftPlaybackPlugin> observer = new WeakReference<>(null);
    static JSObject latestCommand;
    private boolean foreground = true;

    @Override public void load() { observer = new WeakReference<>(this); }
    @Override protected void handleOnPause() { foreground = false; }
    @Override protected void handleOnResume() {
        foreground = true;
        if (PlaybackService.instance != null) emit(PlaybackService.instance.snapshot());
    }
    @Override protected void handleOnDestroy() { if (observer.get() == this) observer.clear(); }
    static void emit(JSObject state) {
        SoundriftPlaybackPlugin plugin = observer.get();
        if (plugin != null && plugin.foreground) plugin.notifyListeners("state", state);
    }
    @PluginMethod public void configure(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                latestCommand = call.getData();
                if (PlaybackService.instance != null) PlaybackService.instance.configure(call.getData());
                else if (call.getData().optBoolean("playing")) {
                    Intent intent = new Intent(getContext(), PlaybackService.class).putExtra("snapshot", call.getData().toString());
                    ContextCompat.startForegroundService(getContext(), intent);
                } else getContext().getSharedPreferences("soundrift-playback", 0).edit().putString("snapshot", call.getData().toString()).apply();
                call.resolve();
            } catch (Exception error) { call.reject("Could not configure audio playback", error); }
        });
    }
    @PluginMethod public void getState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                JSObject state = PlaybackService.instance != null ? PlaybackService.instance.snapshot()
                    : new JSObject(getContext().getSharedPreferences("soundrift-playback", 0).getString("snapshot", "{\"queue\":[],\"revision\":0}"));
                if (PlaybackService.instance == null) state.put("playing", false);
                call.resolve(state);
            } catch (Exception error) { call.reject("Could not restore playback", error); }
        });
    }
    @PluginMethod public void seek(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (PlaybackService.instance != null) PlaybackService.instance.seek(call.getData().optDouble("position", 0));
            call.resolve();
        });
    }
    @PluginMethod public void retry(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (PlaybackService.instance != null) { PlaybackService.instance.retry(); call.resolve(); }
            else {
                try {
                    JSObject saved = new JSObject(getContext().getSharedPreferences("soundrift-playback", 0).getString("snapshot", "{}"));
                    saved.put("playing", true);
                    ContextCompat.startForegroundService(getContext(), new Intent(getContext(), PlaybackService.class).putExtra("snapshot", saved.toString()));
                    call.resolve();
                } catch (Exception error) { call.reject("Could not restart playback", error); }
            }
        });
    }
    @PluginMethod public void offlineList(PluginCall call) {
        OfflineFiles.io.execute(() -> { JSObject result = new JSObject(); result.put("records", OfflineFiles.list(getContext())); call.resolve(result); });
    }
    @PluginMethod public void offlineSave(PluginCall call) {
        OfflineFiles.io.execute(() -> {
            try { OfflineFiles.save(getContext(), call.getData().optJSONObject("track")); call.resolve(); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }
    @PluginMethod public void offlineRemove(PluginCall call) {
        OfflineFiles.io.execute(() -> {
            try { OfflineFiles.remove(getContext(), call.getData().getJSONObject("track")); call.resolve(); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }
    @PluginMethod public void offlineClear(PluginCall call) {
        OfflineFiles.io.execute(() -> {
            try { OfflineFiles.remove(getContext(), null); call.resolve(); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }
}
