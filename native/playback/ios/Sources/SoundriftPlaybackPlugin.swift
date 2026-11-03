import Capacitor
import Foundation
import UIKit

@objc(SoundriftPlaybackPlugin)
public class SoundriftPlaybackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SoundriftPlaybackPlugin"
    public let jsName = "SoundriftPlayback"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "retry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "offlineList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "offlineSave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "offlineRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "offlineClear", returnType: CAPPluginReturnPromise)
    ]
    public override func load() {
        DispatchQueue.main.async { [weak self] in
            PlaybackEngine.shared.onState = { [weak self] state in
                guard UIApplication.shared.applicationState == .active else { return }
                self?.notifyListeners("state", data: state)
            }
        }
    }
    @objc func configure(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do { try PlaybackEngine.shared.configure(call.options as? [String: Any] ?? [:]); call.resolve() }
            catch { call.reject("Could not configure native playback", nil, error) }
        }
    }
    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(PlaybackEngine.shared.snapshot()) }
    }
    @objc func seek(_ call: CAPPluginCall) {
        DispatchQueue.main.async { PlaybackEngine.shared.seek(call.getDouble("position") ?? 0); call.resolve() }
    }
    @objc func retry(_ call: CAPPluginCall) {
        DispatchQueue.main.async { PlaybackEngine.shared.retry(); call.resolve() }
    }
    @objc func offlineList(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["records": OfflineFiles.shared.list()]) }
    }
    @objc func offlineSave(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let track = call.getObject("track") else { call.reject("Missing track"); return }
            OfflineFiles.shared.save(track) { error in
                if let error { call.reject(error.localizedDescription, nil, error) }
                else { PlaybackEngine.shared.refreshFiles(); call.resolve() }
            }
        }
    }
    @objc func offlineRemove(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let track = call.getObject("track") else { call.reject("Missing track"); return }
            do { try OfflineFiles.shared.remove(track); PlaybackEngine.shared.refreshFiles(); call.resolve() }
            catch { call.reject(error.localizedDescription, nil, error) }
        }
    }
    @objc func offlineClear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do { try OfflineFiles.shared.remove(nil); PlaybackEngine.shared.refreshFiles(); call.resolve() }
            catch { call.reject(error.localizedDescription, nil, error) }
        }
    }
}
