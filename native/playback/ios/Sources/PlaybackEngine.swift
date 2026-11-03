import AVFoundation
import CryptoKit
import Foundation
import MediaPlayer
import Network

/// AVQueuePlayer and this host-process object own playback even when WebKit is suspended.
final class PlaybackEngine: NSObject, URLSessionDownloadDelegate {
    static let shared = PlaybackEngine()
    var onState: (([String: Any]) -> Void)?
    private let player = AVQueuePlayer()
    private var config: [String: Any] = [:]
    private var queue: [[String: Any]] = []
    private var index = 0
    private var playing = false
    private var applying = false
    private var interruptedIntent = false
    private var errorMessage: String?
    private var itemIndexes: [ObjectIdentifier: Int] = [:]
    private var itemObservers: [ObjectIdentifier: NSKeyValueObservation] = [:]
    private var observations: [NSKeyValueObservation] = []
    private var timer: Timer?
    private var task: URLSessionDownloadTask?
    private var taskKey = ""
    private var taskEntry: [String: Any] = [:]
    private var taskWasRefreshed = false
    private var desired = Set<String>()
    private var failures: [String: Int] = [:]
    private var retryAt: [String: Date] = [:]
    private var recoveryAttempts = 0
    private var recoveryGeneration = 0
    private var seekGeneration = 0
    private var pendingPosition: Double?
    private var ended = false
    private var recovering = false
    private var lastEntry = ""
    private var refreshedDownloads = Set<String>()
    private var refreshingDownload = false
    private var lastProgress = Date()
    private var lastPosition = -1.0
    private var lastPersist = Date.distantPast
    private var constrained = false
    private var online = true
    private var storageLimited = false
    private var recommending = false
    private var recommendationKey = ""
    private var recommendationRetryAt = Date.distantPast
    private let monitor = NWPathMonitor()
    private let directory: URL
    private static let maxFile: Int64 = 24 * 1024 * 1024
    private static let maxCache: Int64 = 320 * 1024 * 1024
    private lazy var downloads: URLSession = {
        let options = URLSessionConfiguration.default
        options.timeoutIntervalForRequest = 20
        options.timeoutIntervalForResource = 120
        options.allowsConstrainedNetworkAccess = false
        options.httpMaximumConnectionsPerHost = 1
        return URLSession(configuration: options, delegate: self, delegateQueue: .main)
    }()
    private let api: URLSession = {
        let options = URLSessionConfiguration.default
        options.timeoutIntervalForRequest = 20
        options.timeoutIntervalForResource = 25
        return URLSession(configuration: options)
    }()

    private override init() {
        directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("soundrift-audio", isDirectory: true)
        super.init()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        if let saved = UserDefaults.standard.data(forKey: "soundrift-playback"),
           let value = try? JSONSerialization.jsonObject(with: saved) as? [String: Any] {
            config = value; queue = value["queue"] as? [[String: Any]] ?? []
            index = min(max(0, value["currentIndex"] as? Int ?? 0), max(0, queue.count - 1))
            ended = value["ended"] as? Bool ?? false
        }
        player.automaticallyWaitsToMinimizeStalling = true
        observations.append(player.observe(\.currentItem, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.currentChanged() }
        })
        observations.append(player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.publish() }
        })
        NotificationCenter.default.addObserver(self, selector: #selector(interruption), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged), name: AVAudioSession.routeChangeNotification, object: nil)
        configureRemoteCommands()
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                let reconnected = !self.online && path.status == .satisfied
                self.online = path.status == .satisfied; self.constrained = path.isConstrained
                if reconnected { self.failures.removeAll(); self.retryAt.removeAll(); self.refreshedDownloads.removeAll() }
                self.maintain()
            }
        }
        monitor.start(queue: DispatchQueue(label: "tech.soundrift.network"))
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
    }
    private var revision: Double { config["revision"] as? Double ?? 0 }
    private var repeatMode: String { config["repeatMode"] as? String ?? "none" }
    private var target: Int {
        let kind = (config["context"] as? [String: Any])?["kind"] as? String
        let maximum = kind == "playlist" || kind == "album" ? 8 : 4
        // Also clamp configurations persisted by an older app version.
        return min(maximum, max(1, config["target"] as? Int ?? maximum))
    }
    private func text(_ track: [String: Any], _ field: String) -> String { track[field] as? String ?? "" }
    private func key(_ track: [String: Any]) -> String { text(track, "cacheKey") }
    private func currentTrack() -> [String: Any] { queue.indices.contains(index) ? queue[index] : [:] }
    private func file(_ key: String) -> URL {
        let hash = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(hash + ".audio")
    }
    private func cached(_ track: [String: Any]) -> Bool { OfflineFiles.shared.contains(track) || !key(track).isEmpty && FileManager.default.fileExists(atPath: file(key(track)).path) }
    private func source(_ track: [String: Any]) -> URL? {
        if OfflineFiles.shared.contains(track) { return OfflineFiles.shared.file(track) }
        if cached(track) { return file(key(track)) }
        return URL(string: text(track, "audio").isEmpty ? text(track, "audiodownload") : text(track, "audio"))
    }
    private func upcoming() -> [Int] {
        guard !queue.isEmpty else { return [] }
        var cursor = index; var result: [Int] = []
        for _ in 0..<target {
            if repeatMode != "one" { cursor += 1 }
            if cursor >= queue.count { if repeatMode != "all" { break }; cursor = 0 }
            result.append(cursor)
            if repeatMode == "one" || queue.count == 1 { break }
        }
        return result
    }

    func configure(_ next: [String: Any]) throws {
        guard (next["revision"] as? Double ?? 0) > revision else { return }
        if let current = player.currentItem, let actual = itemIndexes[ObjectIdentifier(current)] { index = actual }
        let oldId = text(currentTrack(), "queueEntryId")
        let oldSource = text(currentTrack(), "audio")
        let oldPosition = position()
        let restartEnded = ended && next["playing"] as? Bool == true
        recoveryGeneration += 1; recovering = false
        let requested = next["queue"] as? [[String: Any]] ?? []
        let requestedIndex = next["currentIndex"] as? Int ?? -1
        let requestedId = requested.indices.contains(requestedIndex) ? text(requested[requestedIndex], "queueEntryId") : ""
        config = next
        if next["queueChanged"] as? Bool != false || queue.isEmpty { queue = requested }
        let existingIndex = queue.firstIndex { text($0, "queueEntryId") == oldId }
        let preserveCurrent = next["select"] as? Bool != true && existingIndex != nil
        index = (preserveCurrent ? existingIndex : queue.firstIndex { text($0, "queueEntryId") == requestedId }) ?? 0
        // A delayed WebKit command must not seek a song that advanced natively.
        let seekPosition = requestedId == text(currentTrack(), "queueEntryId") ? next["seekPosition"] as? Double : nil
        playing = next["playing"] as? Bool ?? false
        interruptedIntent = false; errorMessage = nil; recoveryAttempts = 0
        player.volume = Float(min(1, max(0, next["volume"] as? Double ?? 0.8)))
        failures.removeAll(); retryAt.removeAll(); refreshedDownloads.removeAll(); storageLimited = false
        if playing { try activateSession() }
        if queue.isEmpty {
            desired.removeAll(); task?.cancel()
            playing = false; player.pause(); player.removeAllItems(); itemObservers.removeAll(); itemIndexes.removeAll()
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } else if oldId != text(currentTrack(), "queueEntryId") || oldSource != text(currentTrack(), "audio") || player.currentItem == nil || next["retry"] as? Bool == true {
            rebuild(position: seekPosition ?? (restartEnded ? 0 : preserveCurrent ? oldPosition : next["position"] as? Double ?? 0))
        } else {
            if let item = player.currentItem { itemIndexes[ObjectIdentifier(item)] = index }
            syncFuture()
            if let target = seekPosition { seek(target) }
            if playing { player.play() } else { player.pause() }
        }
        maintain(); publish(force: true)
    }
    private func activateSession() throws {
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try AVAudioSession.sharedInstance().setActive(true)
    }
    private func makeItem(_ index: Int) -> AVPlayerItem? {
        guard queue.indices.contains(index), let url = source(queue[index]) else { return nil }
        let item = AVPlayerItem(url: url); item.preferredForwardBufferDuration = 20
        let id = ObjectIdentifier(item); itemIndexes[id] = index
        itemObservers[id] = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self, item === self.player.currentItem, item.status == .failed else { return }
                self.recover()
            }
        }
        return item
    }
    private func rebuild(position: Double) {
        applying = true; ended = false; player.pause(); player.removeAllItems(); itemObservers.removeAll(); itemIndexes.removeAll()
        if let item = makeItem(index) { player.insert(item, after: nil) }
        applying = false; syncFuture(); seek(position)
        if playing { player.play() }; lastProgress = Date()
    }
    private func syncFuture() {
        guard let current = player.currentItem else { return }
        let next = upcoming()
        let existing = Array(player.items().dropFirst())
        var matched = 0
        for (item, position) in zip(existing, next) {
            guard itemIndexes[ObjectIdentifier(item)] == position && (item.asset as? AVURLAsset)?.url == source(queue[position]) else { break }
            matched += 1
        }
        if matched == existing.count && matched == next.count { return }
        applying = true
        for item in existing.dropFirst(matched) { player.remove(item); itemObservers.removeValue(forKey: ObjectIdentifier(item)); itemIndexes.removeValue(forKey: ObjectIdentifier(item)) }
        var previous = matched > 0 ? existing[matched - 1] : current
        for position in next.dropFirst(matched) {
            if let item = makeItem(position), player.canInsert(item, after: previous) { player.insert(item, after: previous); previous = item }
        }
        let live = Set(player.items().map(ObjectIdentifier.init))
        itemIndexes = itemIndexes.filter { live.contains($0.key) }; itemObservers = itemObservers.filter { live.contains($0.key) }
        applying = false
    }
    private func currentChanged() {
        guard !applying else { return }
        if let item = player.currentItem, let position = itemIndexes[ObjectIdentifier(item)] {
            index = position
            let entry = text(currentTrack(), "queueEntryId")
            if entry != lastEntry { lastEntry = entry; recoveryAttempts = 0; recoveryGeneration += 1; recovering = false; storageLimited = false; errorMessage = nil }
            lastProgress = Date()
            syncFuture(); maintain()
            if item.status == .failed { recover() }
        } else if player.currentItem == nil {
            if playing { ended = true; config["position"] = currentTrack()["duration"] ?? lastPosition }
            playing = false
        }
        publish(force: true)
    }
    func seek(_ seconds: Double) {
        guard seconds.isFinite else { return }
        let target = max(0, seconds)
        config["position"] = target; pendingPosition = target; seekGeneration += 1
        let generation = seekGeneration
        if player.currentItem != nil {
            player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                DispatchQueue.main.async {
                    guard let self, self.seekGeneration == generation else { return }; self.pendingPosition = nil; self.publish()
                }
            }
        } else { pendingPosition = nil }
        lastProgress = Date(); publish()
    }
    func retry() {
        recoveryGeneration += 1; recovering = false
        errorMessage = nil; recoveryAttempts = 0; failures.removeAll(); retryAt.removeAll(); playing = !queue.isEmpty
        do { if playing { try activateSession(); rebuild(position: ended ? 0 : position()) } }
        catch { playing = false; errorMessage = "Audio playback could not start." }
        maintain(); publish()
    }
    private func recover() {
        guard playing, !recovering else { return }
        recoveryAttempts += 1
        if recoveryAttempts == 1 {
            rebuild(position: position())
        } else if recoveryAttempts == 2 {
            try? FileManager.default.removeItem(at: file(key(currentTrack())))
            let alternate = text(currentTrack(), "audiodownload")
            if !alternate.isEmpty && alternate != text(currentTrack(), "audio") {
                queue[index]["audio"] = alternate; queue[index]["cacheKey"] = audioKey(queue[index]); rebuild(position: position())
            } else { recover() }
        } else if recoveryAttempts == 3, let url = songURL(currentTrack()) {
            recovering = true
            recoveryGeneration += 1; let requestGeneration = recoveryGeneration
            let generation = revision, entry = text(currentTrack(), "queueEntryId")
            api.dataTask(with: url) { [weak self] data, _, _ in
                let body = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                let fresh = body?["data"] as? [String: Any]
                DispatchQueue.main.async {
                    guard let self, self.recoveryGeneration == requestGeneration else { return }; self.recovering = false
                    guard self.revision == generation, self.playing, self.text(self.currentTrack(), "queueEntryId") == entry else { return }
                    if let fresh, self.text(fresh, "provider") == self.text(self.currentTrack(), "provider"), self.text(fresh, "id") == self.text(self.currentTrack(), "id"), !self.text(fresh, "audio").isEmpty {
                        self.queue[self.index]["audio"] = self.text(fresh, "audio")
                        self.queue[self.index]["cacheKey"] = self.audioKey(self.queue[self.index]); self.rebuild(position: self.position())
                    } else { self.recover() }
                }
            }.resume()
        } else { playing = false; player.pause(); errorMessage = "This song could not be loaded. Tap Retry to continue."; publish(force: true) }
    }
    private func position() -> Double {
        if let pendingPosition { return pendingPosition }
        guard player.currentItem != nil else { return max(0, config["position"] as? Double ?? 0) }
        let seconds = player.currentTime().seconds
        return seconds.isFinite ? seconds : config["position"] as? Double ?? 0
    }

    private func maintain() {
        guard !queue.isEmpty, !applying else { return }
        desired = Set(upcoming().map { key(queue[$0]) })
        for position in max(0, index - 2)...index where queue.indices.contains(position) { desired.insert(key(queue[position])) }
        failures = failures.filter { desired.contains($0.key) }; retryAt = retryAt.filter { desired.contains($0.key) }
        refreshedDownloads.formIntersection(desired)
        if task != nil && !desired.contains(taskKey) { task?.cancel() }
        recommend()
        guard task == nil, !refreshingDownload, !storageLimited, playing, online, !constrained, let current = player.currentItem, current.status == .readyToPlay else { return }
        if !cached(currentTrack()) {
            let sufficient = current.loadedTimeRanges.contains { value in
                let range = value.timeRangeValue, end = CMTimeRangeGetEnd(range).seconds
                return range.start.seconds <= position() && (end - position() >= 20 || current.duration.seconds.isFinite && end >= current.duration.seconds - 0.25)
            }
            if !sufficient { return }
        }
        for position in upcoming() {
            let entry = queue[position], cacheKey = key(entry)
            if cached(entry) || cacheKey.isEmpty || (retryAt[cacheKey] ?? .distantPast) > Date() { continue }
            startDownload(entry); break
        }
    }
    private func cacheBytes() -> Int64 {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        return files.reduce(0) { total, url in total + Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    }
    private func prune() {
        let names = Set(desired.map { file($0).lastPathComponent })
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        for url in files where url.pathExtension == "audio" && !names.contains(url.lastPathComponent) { try? FileManager.default.removeItem(at: url) }
    }
    private func startDownload(_ entry: [String: Any], refreshedURL: URL? = nil) {
        guard let url = refreshedURL ?? source(entry), ["https", "http"].contains(url.scheme ?? "") else { return }
        prune(); taskKey = key(entry); taskEntry = entry; taskWasRefreshed = refreshedURL != nil
        task = downloads.downloadTask(with: url)
        task?.resume(); publish()
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if totalBytesWritten > Self.maxFile || totalBytesExpectedToWrite > Self.maxFile { downloadTask.cancel() }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard task?.taskIdentifier == downloadTask.taskIdentifier else { return }
        var saved = false
        if desired.contains(taskKey), let http = downloadTask.response as? HTTPURLResponse, http.statusCode == 200,
           let type = http.mimeType, type.hasPrefix("audio/") || type == "application/ogg" {
            let size = Int64((try? location.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
            storageLimited = cacheBytes() + size > Self.maxCache
            if size > 0 && size <= Self.maxFile && (http.expectedContentLength < 0 || http.expectedContentLength == size) && !storageLimited {
                let destination = file(taskKey)
                do {
                    if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
                    try FileManager.default.moveItem(at: location, to: destination)
                    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
                    saved = true
                } catch { storageLimited = true; try? FileManager.default.removeItem(at: destination) }
            }
        }
        finishDownload(downloadTask, saved: saved)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        // didFinishDownloadingTo already consumes a successful task. A late
        // completion for it must never clear the next download's state.
        if self.task?.taskIdentifier == task.taskIdentifier { finishDownload(task, saved: false) }
    }
    private func finishDownload(_ completed: URLSessionTask, saved: Bool) {
        let cacheKey = taskKey, entry = taskEntry, wasRefreshed = taskWasRefreshed
        task = nil; taskKey = ""; taskEntry = [:]
        if saved { failures.removeValue(forKey: cacheKey); retryAt.removeValue(forKey: cacheKey); syncFuture() }
        else if desired.contains(cacheKey) {
            let attempts = (failures[cacheKey] ?? 0) + 1; failures[cacheKey] = attempts
            retryAt[cacheKey] = attempts > 2 ? .distantFuture : Date().addingTimeInterval(attempts == 1 ? 2 : 10)
            if !wasRefreshed, !refreshedDownloads.contains(cacheKey), let status = (completed.response as? HTTPURLResponse)?.statusCode, [401,403,404,410].contains(status) {
                refreshDownload(entry); return
            }
        }
        maintain(); publish()
    }
    private func songURL(_ entry: [String: Any]) -> URL? {
        guard let base = config["apiBase"] as? String else { return nil }
        guard let url = URL(string: base)?.appendingPathComponent("api/music/song").appendingPathComponent(text(entry, "id")),
              var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        components.queryItems = [URLQueryItem(name: "refresh", value: "1")]; return components.url
    }
    func refreshFiles() { storageLimited = false; syncFuture(); maintain(); publish() }
    private func refreshDownload(_ entry: [String: Any]) {
        guard let url = songURL(entry) else { maintain(); return }
        refreshedDownloads.insert(key(entry)); refreshingDownload = true
        let generation = revision
        api.dataTask(with: url) { [weak self] data, _, _ in
            let body = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let fresh = body?["data"] as? [String: Any]
            DispatchQueue.main.async {
                guard let self else { return }; self.refreshingDownload = false
                guard self.revision == generation, self.task == nil, self.desired.contains(self.key(entry)),
                      let fresh, self.audioKey(fresh) == self.key(entry),
                      let source = URL(string: self.text(fresh, "audio")) else { self.maintain(); return }
                self.startDownload(entry, refreshedURL: source)
            }
        }.resume()
    }
    private func recommend() {
        guard config["autoplay"] as? Bool == true, playing, repeatMode != "one", queue.count - index - 1 <= 8,
              !recommending, recommendationRetryAt <= Date(), let base = config["apiBase"] as? String else { return }
        let requestKey = text(currentTrack(), "id") + ":" + String(queue.count)
        guard requestKey != recommendationKey, let url = URL(string: base + "/api/music/suggestions/" + text(currentTrack(), "id") + "?limit=30") else { return }
        recommendationKey = requestKey; recommending = true; let generation = revision
        api.dataTask(with: url) { [weak self] data, _, _ in
            let body = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let suggestions = body?["data"] as? [[String: Any]] ?? []
            DispatchQueue.main.async {
                guard let self else { return }; self.recommending = false
                guard self.revision == generation else { self.recommendationKey = ""; return }
                var known = Set(self.queue.map { self.text($0, "provider") + ":" + self.text($0, "id") }); var added = 0
                for var track in suggestions where added < 10 {
                    guard !self.text(track, "audio").isEmpty, known.insert(self.text(track, "provider") + ":" + self.text(track, "id")).inserted else { continue }
                    track["queueEntryId"] = "native:" + UUID().uuidString; track["cacheKey"] = self.audioKey(track)
                    self.queue.append(track); added += 1
                }
                if added == 0 { self.recommendationKey = ""; self.recommendationRetryAt = Date().addingTimeInterval(30) }
                self.syncFuture(); self.maintain(); self.publish()
            }
        }.resume()
    }
    private func audioKey(_ track: [String: Any]) -> String {
        let address = text(track, "audio").isEmpty ? text(track, "audiodownload") : text(track, "audio")
        let url = URL(string: address); let path = url?.path ?? ""
        let regex = try? NSRegularExpression(pattern: "_(\\d{2,3})\\.\\w+$")
        var quality = "default"
        if let match = regex?.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)), let range = Range(match.range(at: 1), in: path) { quality = String(path[range]) }
        else if let format = URLComponents(string: address)?.queryItems?.first(where: { $0.name == "format" })?.value { quality = format }
        return (text(track, "provider").isEmpty ? "default" : text(track, "provider")) + ":" + text(track, "id") + ":" + quality
    }

    private func pause() { playing = false; interruptedIntent = false; player.pause(); publish(force: true) }
    private func resume() {
        guard !queue.isEmpty else { return }
        if player.currentItem == nil || player.currentItem?.status == .failed || ended { retry(); return }
        do { try activateSession(); playing = true; player.play() }
        catch { playing = false; player.pause(); errorMessage = "Audio playback could not start." }
        maintain(); publish(force: true)
    }
    private func skip(_ offset: Int) {
        guard !queue.isEmpty else { return }
        let next = index + offset
        if queue.indices.contains(next) { index = next }
        else if repeatMode != "none" { index = next < 0 ? queue.count - 1 : 0 }
        else { if offset > 0 { pause() }; return }
        playing = true; rebuild(position: 0); maintain(); publish(force: true)
    }
    private func configureRemoteCommands() {
        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.addTarget { [weak self] _ in DispatchQueue.main.async { self?.resume() }; return .success }
        commands.pauseCommand.addTarget { [weak self] _ in DispatchQueue.main.async { self?.pause() }; return .success }
        commands.nextTrackCommand.addTarget { [weak self] _ in DispatchQueue.main.async { self?.skip(1) }; return .success }
        commands.previousTrackCommand.addTarget { [weak self] _ in DispatchQueue.main.async { self?.skip(-1) }; return .success }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            DispatchQueue.main.async { self?.seek(event.positionTime) }; return .success
        }
    }
    @objc private func interruption(_ note: Notification) {
        if !Thread.isMainThread { DispatchQueue.main.async { self.interruption(note) }; return }
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .began { interruptedIntent = playing; playing = false; player.pause() }
        else {
            let options = AVAudioSession.InterruptionOptions(rawValue: note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
            if interruptedIntent && options.contains(.shouldResume) { playing = true; try? activateSession(); player.play() }
            interruptedIntent = false
        }
        publish(force: true)
    }
    @objc private func routeChanged(_ note: Notification) {
        if !Thread.isMainThread { DispatchQueue.main.async { self.routeChanged(note) }; return }
        if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { pause() }
    }
    func snapshot() -> [String: Any] {
        var result = config
        result["queue"] = queue; result["currentIndex"] = queue.isEmpty ? -1 : index; result["position"] = position()
        result["playing"] = playing; result["buffering"] = playing && player.timeControlStatus == .waitingToPlayAtSpecifiedRate
        result["ended"] = ended
        result["error"] = errorMessage as Any? ?? NSNull()
        let duration = player.currentItem?.duration.seconds ?? 0; result["duration"] = duration.isFinite ? duration : 0
        let available = upcoming().map { cached(queue[$0]) }
        result["buffer"] = ["target": target, "total": available.count, "ready": available.filter { $0 }.count,
            "contiguousReady": available.prefix { $0 }.count, "downloading": task != nil, "failed": failures.count, "bytes": cacheBytes(),
            "limited": !online ? "offline" as Any : constrained ? "data-saver" as Any : storageLimited ? "storage" as Any : NSNull()] as [String: Any]
        return result
    }
    private func publish(force: Bool = false) {
        guard !applying else { return }
        let state = snapshot(); onState?(state)
        if force || Date().timeIntervalSince(lastPersist) >= 5 {
            lastPersist = Date()
            if let data = try? JSONSerialization.data(withJSONObject: state) { UserDefaults.standard.set(data, forKey: "soundrift-playback") }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = queue.isEmpty ? nil : [
            MPMediaItemPropertyTitle: text(currentTrack(), "name"), MPMediaItemPropertyArtist: text(currentTrack(), "artist_name"),
            MPMediaItemPropertyAlbumTitle: text(currentTrack(), "album_name"), MPNowPlayingInfoPropertyElapsedPlaybackTime: position(),
            MPMediaItemPropertyPlaybackDuration: state["duration"] ?? 0, MPNowPlayingInfoPropertyPlaybackRate: playing ? 1 : 0]
    }
    private func tick() {
        guard !queue.isEmpty else { return }
        let position = position()
        if abs(position - lastPosition) > 0.05 { lastPosition = position; lastProgress = Date() }
        if playing && player.timeControlStatus == .waitingToPlayAtSpecifiedRate && Date().timeIntervalSince(lastProgress) > 20 { lastProgress = Date(); recover() }
        maintain(); publish()
    }
}
