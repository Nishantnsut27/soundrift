import CryptoKit
import Foundation

/// Manual downloads survive sliding-window eviction and are readable while locked.
final class OfflineFiles: NSObject, URLSessionDownloadDelegate {
    static let shared = OfflineFiles()
    private let directory: URL
    private let maxFile: Int64 = 24 * 1024 * 1024
    private var jobs: [Int: (track: [String: Any], completion: (Error?) -> Void)] = [:]
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20; config.timeoutIntervalForResource = 120
        return URLSession(configuration: config, delegate: self, delegateQueue: .main)
    }()
    private override init() {
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("soundrift-downloads", isDirectory: true)
        super.init()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var excluded = directory; var values = URLResourceValues(); values.isExcludedFromBackup = true; try? excluded.setResourceValues(values)
    }
    private func identity(_ track: [String: Any]) -> String { (track["provider"] as? String ?? "default") + ":" + (track["id"] as? String ?? "") }
    func file(_ track: [String: Any]) -> URL {
        let name = SHA256.hash(data: Data(identity(track).utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(name + ".audio")
    }
    func contains(_ track: [String: Any]) -> Bool { ((try? file(track).resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) > 0 }
    func list() -> [[String: Any]] {
        guard let data = UserDefaults.standard.data(forKey: "soundrift-offline"),
              let records = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return records.filter { record in guard let track = record["track"] as? [String: Any] else { return false }; return contains(track) }
    }
    private func persist(_ records: [[String: Any]]) throws { UserDefaults.standard.set(try JSONSerialization.data(withJSONObject: records), forKey: "soundrift-offline") }
    private func problem(_ message: String) -> Error { NSError(domain: "SoundriftOffline", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    func save(_ track: [String: Any], completion: @escaping (Error?) -> Void) {
        if contains(track) { completion(nil); return }
        guard !jobs.values.contains(where: { identity($0.track) == identity(track) }) else { completion(problem("This song is already downloading.")); return }
        let address = track["audio"] as? String ?? track["audiodownload"] as? String ?? ""
        guard let url = URL(string: address), ["http", "https"].contains(url.scheme ?? "") else { completion(problem("This song has no audio source.")); return }
        let task = session.downloadTask(with: url); jobs[task.taskIdentifier] = (track, completion); task.resume()
    }
    func remove(_ track: [String: Any]?) throws {
        let selectedJobs = jobs.filter { track == nil || identity($0.value.track) == identity(track!) }
        for (id, job) in selectedJobs { jobs.removeValue(forKey: id); job.completion(problem("Download cancelled.")) }
        session.getAllTasks { tasks in for task in tasks where selectedJobs[task.taskIdentifier] != nil { task.cancel() } }
        var remaining: [[String: Any]] = []
        for record in list() {
            guard let saved = record["track"] as? [String: Any] else { continue }
            if track == nil || identity(saved) == identity(track!) { try FileManager.default.removeItem(at: file(saved)) }
            else { remaining.append(record) }
        }
        try persist(remaining)
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if totalBytesWritten > maxFile || totalBytesExpectedToWrite > maxFile { downloadTask.cancel() }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let job = jobs.removeValue(forKey: downloadTask.taskIdentifier) else { return }
        do {
            guard let response = downloadTask.response as? HTTPURLResponse, response.statusCode == 200,
                  let type = response.mimeType, type.hasPrefix("audio/") || type == "application/ogg" else { throw problem("The audio source could not be downloaded.") }
            let size = Int64((try location.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0)
            guard size > 0, size <= maxFile, response.expectedContentLength < 0 || size == response.expectedContentLength else { throw problem("Incomplete audio download.") }
            var records = list()
            let used = records.reduce(Int64(0)) { $0 + ($1["size"] as? Int64 ?? 0) }
            guard used + size <= maxFile * 20 else { throw problem("Offline storage is full.") }
            let destination = file(job.track)
            try FileManager.default.moveItem(at: location, to: destination)
            do {
                try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
                records.append(["track": job.track, "size": size, "savedAt": Date().timeIntervalSince1970 * 1000]); try persist(records)
            } catch { try? FileManager.default.removeItem(at: destination); throw error }
            job.completion(nil)
        } catch { job.completion(error) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let job = jobs.removeValue(forKey: task.taskIdentifier) { job.completion(error ?? problem("Audio download did not complete.")) }
    }
}
