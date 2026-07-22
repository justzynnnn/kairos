import AVFoundation
import Capacitor
import Foundation
import Speech
import UIKit

#if canImport(FoundationModels)
import FoundationModels
#endif

private actor PlannerContextVault {
    private var schedule = "No schedule context is available."
    private var preferences = "No preferences are available."

    func update(schedule: String, preferences: String) {
        self.schedule = String(schedule.prefix(32_000))
        self.preferences = String(preferences.prefix(8_000))
    }

    func scheduleText() -> String { schedule }
    func preferencesText() -> String { preferences }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
private struct ScheduleLookupArguments {
    @Guide(description: "ISO 8601 start of the range to inspect.")
    var startAt: String
    @Guide(description: "ISO 8601 end of the range to inspect.")
    var endAt: String
}

@available(iOS 26.0, *)
private struct ScheduleLookupTool: Tool {
    let vault: PlannerContextVault
    let name = "read_schedule"
    let description = "Read the user's local schedule. Use this before proposing a time or resolving a reference to an existing item."

    func call(arguments: ScheduleLookupArguments) async throws -> String {
        await vault.scheduleText()
    }
}

@available(iOS 26.0, *)
@Generable
private struct PreferenceLookupArguments {
    @Guide(description: "The scheduling category to inspect, or all.")
    var category: String
}

@available(iOS 26.0, *)
private struct PreferenceLookupTool: Tool {
    let vault: PlannerContextVault
    let name = "read_preferences"
    let description = "Read local timezone, active hours, and explicit scheduling preferences."

    func call(arguments: PreferenceLookupArguments) async throws -> String {
        await vault.preferencesText()
    }
}

@available(iOS 26.0, *)
@Generable
private struct NativeSchedulingAction {
    @Guide(description: "The scheduling action type.", .anyOf(["event", "task", "deadline", "preparation"]))
    var kind: String
    @Guide(description: "A short user-visible title without a date or time.")
    var title: String
    @Guide(description: "A concise category such as Work, Health, Class, Errand, or Personal.")
    var category: String
    @Guide(description: "A location stated by the user, otherwise an empty string.")
    var locationLabel: String
    @Guide(description: "ISO 8601 start with offset, otherwise an empty string.")
    var startAt: String
    @Guide(description: "ISO 8601 end with offset, otherwise an empty string.")
    var endAt: String
    @Guide(description: "ISO 8601 deadline with offset, otherwise an empty string.")
    var dueAt: String
    @Guide(description: "Duration in minutes, or zero when unknown.", .range(0...720))
    var durationMinutes: Int
    @Guide(description: "Total preparation effort in minutes, or zero.", .range(0...2400))
    var totalEffortMinutes: Int
    @Guide(description: "Preparation session length in minutes, or zero.", .range(0...480))
    var sessionLengthMinutes: Int
    @Guide(description: "Preparation block count, or zero.", .range(0...20))
    var blockCount: Int
    @Guide(description: "Title this should follow, otherwise an empty string.")
    var afterTitle: String
    @Guide(description: "Related deadline title, otherwise an empty string.")
    var relatedDeadlineTitle: String
    @Guide(description: "How movable the item is.", .anyOf(["fixed", "protected", "flexible"]))
    var flexibility: String
    var canShorten: Bool
    var canSplit: Bool
    var canSkip: Bool
    @Guide(description: "Priority from one to five.", .range(1...5))
    var priority: Int
    @Guide(description: "Reminder lead time in minutes.", .range(0...10080))
    var reminderMinutes: Int
    @Guide(description: "Visible, nonessential assumptions.", .maximumCount(8))
    var assumptions: [String]
}

@available(iOS 26.0, *)
@Generable
private struct NativePlannerResponse {
    @Guide(description: "A concise summary of the requested plan.")
    var summary: String
    var ambiguity: Bool
    @Guide(description: "The follow-up type.", .anyOf(["none", "clarify", "deadline_preparation"]))
    var followUpKind: String
    @Guide(description: "One essential question when ambiguity is true, otherwise an empty string.")
    var essentialQuestion: String
    @Guide(description: "Visible assumptions applying to the whole request.", .maximumCount(12))
    var assumptions: [String]
    @Guide(description: "Every action in the user's compound command.", .count(1...20))
    var actions: [NativeSchedulingAction]
}

@available(iOS 26.0, *)
@Generable
private struct FreeWindowArguments {
    @Guide(description: "ISO 8601 start of the search range.")
    var startAt: String
    @Guide(description: "ISO 8601 end of the search range.")
    var endAt: String
    @Guide(description: "Required free duration in minutes.", .range(5...720))
    var durationMinutes: Int
}

@available(iOS 26.0, *)
private struct FreeWindowTool: Tool {
    let vault: PlannerContextVault
    let name = "find_free_window"
    let description = "Deterministically find the first free window in the locally cached schedule. The result is read-only and still requires final Kairos validation."

    func call(arguments: FreeWindowArguments) async throws -> String {
        let formatter = ISO8601DateFormatter()
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func parse(_ value: String) -> Date? {
            fractionalFormatter.date(from: value) ?? formatter.date(from: value)
        }
        guard let rangeStart = parse(arguments.startAt),
              let rangeEnd = parse(arguments.endAt),
              rangeEnd > rangeStart else {
            return "No result: invalid ISO 8601 range."
        }
        let data = Data((await vault.scheduleText()).utf8)
        let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
        let busy = rows.compactMap { row -> (Date, Date)? in
            guard let startText = row["startAt"] as? String,
                  let endText = row["endAt"] as? String,
                  let start = parse(startText),
                  let end = parse(endText),
                  end > rangeStart, start < rangeEnd else { return nil }
            return (max(start, rangeStart), min(end, rangeEnd))
        }.sorted { $0.0 < $1.0 }
        let required = TimeInterval(arguments.durationMinutes * 60)
        var cursor = rangeStart
        for interval in busy {
            if interval.0.timeIntervalSince(cursor) >= required {
                return "Free from \(formatter.string(from: cursor)) to \(formatter.string(from: cursor.addingTimeInterval(required)))."
            }
            if interval.1 > cursor { cursor = interval.1 }
        }
        if rangeEnd.timeIntervalSince(cursor) >= required {
            return "Free from \(formatter.string(from: cursor)) to \(formatter.string(from: cursor.addingTimeInterval(required)))."
        }
        return "No free window of \(arguments.durationMinutes) minutes exists in that range."
    }
}
#endif

@available(iOS 26.0, *)
private final class ModernSpeechSession {
    private let analyzer: SpeechAnalyzer
    private let transcriber: SpeechTranscriber
    private let engine = AVAudioEngine()
    private var continuation: AsyncStream<AnalyzerInput>.Continuation?
    private var analysisTask: Task<Void, Never>?
    private var resultTask: Task<Void, Never>?
    private let onResult: @Sendable (String, Bool) -> Void
    let localeIdentifier: String

    init(locale: Locale, onResult: @escaping @Sendable (String, Bool) -> Void) {
        self.localeIdentifier = locale.identifier
        self.onResult = onResult
        transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        analyzer = SpeechAnalyzer(
            modules: [transcriber],
            options: .init(priority: .userInitiated, modelRetention: .lingering)
        )
    }

    func start() async throws {
        let modules: [any SpeechModule] = [transcriber]
        if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
            try await request.downloadAndInstall()
        }
        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        try await analyzer.prepareToAnalyze(in: format)
        let stream = AsyncStream<AnalyzerInput> { continuation in
            self.continuation = continuation
        }
        resultTask = Task { [transcriber, onResult] in
            do {
                for try await result in transcriber.results {
                    onResult(String(result.text.characters), result.isFinal)
                }
            } catch {
                onResult("", true)
            }
        }
        analysisTask = Task { [analyzer] in
            do {
                try await analyzer.start(inputSequence: stream)
            } catch {
                await analyzer.cancelAndFinishNow()
            }
        }
        inputNode.installTap(onBus: 0, bufferSize: 1_024, format: format) { [weak self] buffer, _ in
            self?.continuation?.yield(AnalyzerInput(buffer: buffer))
        }
        try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: [.duckOthers])
        try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        engine.prepare()
        try engine.start()
    }

    func stop(cancelled: Bool) async {
        if engine.isRunning {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
        }
        continuation?.finish()
        continuation = nil
        if cancelled {
            await analyzer.cancelAndFinishNow()
        } else {
            try? await analyzer.finalizeAndFinishThroughEndOfInput()
        }
        analysisTask?.cancel()
        resultTask?.cancel()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

@objc(KairosIntelligencePlugin)
final class KairosIntelligencePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "KairosIntelligencePlugin"
    let jsName = "KairosIntelligence"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateContext", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preparePlanner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "interpret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTranscription", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTranscription", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelTranscription", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearHistory", returnType: CAPPluginReturnPromise)
    ]

    private let vault = PlannerContextVault()
    private var legacyRecognizer: SFSpeechRecognizer?
    private var legacyRequest: SFSpeechAudioBufferRecognitionRequest?
    private var legacyTask: SFSpeechRecognitionTask?
    private var legacyEngine: AVAudioEngine?
    private var modernSpeech: AnyObject?
    private var transcriptSequence = 0
    private var transcriptSessionId: String?
    private var backgroundReleaseWorkItem: DispatchWorkItem?

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private var plannerSession: LanguageModelSession? {
        get { objc_getAssociatedObject(self, &AssociatedKeys.planner) as? LanguageModelSession }
        set { objc_setAssociatedObject(self, &AssociatedKeys.planner, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC) }
    }
    #endif

    private enum AssociatedKeys {
        static var planner: UInt8 = 0
    }

    override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(releaseForMemoryPressure),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(scheduleBackgroundRelease),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(cancelBackgroundRelease),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
    }

    @objc private func releaseForMemoryPressure() {
        resetPlanner()
    }

    @objc private func scheduleBackgroundRelease() {
        backgroundReleaseWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in self?.resetPlanner() }
        backgroundReleaseWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 300, execute: workItem)
    }

    @objc private func cancelBackgroundRelease() {
        backgroundReleaseWorkItem?.cancel()
        backgroundReleaseWorkItem = nil
    }

    @objc func capabilities(_ call: CAPPluginCall) {
        Task {
            let speechStatus = SFSpeechRecognizer.authorizationStatus()
            var locales = [String]()
            var selectedLocale = preferredLegacyLocale().identifier
            var modernSpeechAvailable = false
            if #available(iOS 26.0, *) {
                modernSpeechAvailable = SpeechTranscriber.isAvailable
                locales = await SpeechTranscriber.supportedLocales.map(\.identifier)
                selectedLocale = preferredLocale(from: await SpeechTranscriber.supportedLocales).identifier
            } else {
                locales = SFSpeechRecognizer.supportedLocales().map(\.identifier).sorted()
            }
            var modelState = "unsupported"
            var modelReason: String? = "Requires iOS 26 and a compatible Apple Intelligence device."
            #if canImport(FoundationModels)
            if #available(iOS 26.0, *) {
                switch SystemLanguageModel.default.availability {
                case .available:
                    modelState = "available"
                    modelReason = nil
                case .unavailable(.deviceNotEligible):
                    modelState = "unavailable"
                    modelReason = "This device does not support Apple Intelligence."
                case .unavailable(.appleIntelligenceNotEnabled):
                    modelState = "unavailable"
                    modelReason = "Apple Intelligence is turned off."
                case .unavailable(.modelNotReady):
                    modelState = "downloading"
                    modelReason = "The on-device model is not ready yet."
                @unknown default:
                    modelState = "unavailable"
                    modelReason = "Apple Intelligence is temporarily unavailable."
                }
            }
            #endif
            call.resolve([
                "foundationModel": ["state": modelState, "reason": modelReason as Any],
                "speech": [
                    "state": speechState(speechStatus),
                    "modern": modernSpeechAvailable,
                    "supportedLocales": locales,
                    "selectedLocale": selectedLocale
                ]
            ])
        }
    }

    @objc func updateContext(_ call: CAPPluginCall) {
        let schedule = call.getString("schedule") ?? "No schedule context is available."
        let preferences = call.getString("preferences") ?? "No preferences are available."
        Task {
            await vault.update(schedule: schedule, preferences: preferences)
            call.resolve()
        }
    }

    @objc func preparePlanner(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            guard SystemLanguageModel.default.isAvailable else {
                call.reject("Apple Intelligence is unavailable.")
                return
            }
            let session = planner()
            session.prewarm()
            call.resolve(["ready": true])
            return
        }
        #endif
        call.reject("Apple Intelligence requires iOS 26.")
    }

    @objc func interpret(_ call: CAPPluginCall) {
        guard let command = call.getString("command")?.trimmingCharacters(in: .whitespacesAndNewlines),
              command.count >= 2, command.count <= 2_000 else {
            call.reject("Enter a scheduling command under 2,000 characters.")
            return
        }
        let timezone = call.getString("timezone") ?? TimeZone.current.identifier
        let contextVersion = call.getInt("contextVersion") ?? 0
        let history = (call.getArray("history", String.self) ?? []).suffix(8)
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            guard SystemLanguageModel.default.isAvailable else {
                call.reject("Apple Intelligence is unavailable.", "MODEL_UNAVAILABLE")
                return
            }
            Task {
                do {
                    let formatter = ISO8601DateFormatter()
                    let prompt = [
                        "Current instant: " + formatter.string(from: Date()),
                        "User timezone: " + timezone,
                        history.isEmpty ? "" : "Recent conversation:\n" + history.joined(separator: "\n"),
                        "User request: " + command,
                        "Use the read-only tools before selecting times. Return a clarification if a material detail is missing. Do not claim to save anything."
                    ].filter { !$0.isEmpty }.joined(separator: "\n\n")
                    let response = try await planner().respond(
                        to: prompt,
                        generating: NativePlannerResponse.self
                    )
                    let value = response.content
                    call.resolve([
                        "kind": value.ambiguity ? "clarification" : "proposal",
                        "summary": value.summary,
                        "question": value.essentialQuestion,
                        "followUpKind": value.followUpKind,
                        "assumptions": value.assumptions,
                        "actions": value.actions.map(actionDictionary),
                        "contextVersion": contextVersion,
                        "provider": "apple-intelligence"
                    ])
                } catch {
                    resetPlanner()
                    call.reject("The on-device model could not produce a safe plan.", "MODEL_RESPONSE_INVALID")
                }
            }
            return
        }
        #endif
        call.reject("Apple Intelligence requires iOS 26.", "MODEL_UNSUPPORTED")
    }

    @objc func startTranscription(_ call: CAPPluginCall) {
        guard transcriptSessionId == nil else {
            call.reject("A transcription is already active.")
            return
        }
        requestSpeechPermission { [weak self] granted in
            guard let self else { return }
            guard granted else {
                call.reject("Microphone or speech recognition permission was denied.", "SPEECH_PERMISSION_DENIED")
                return
            }
            Task { @MainActor in
                do {
                    let sessionId = UUID().uuidString
                    self.transcriptSessionId = sessionId
                    self.transcriptSequence = 0
                    let requestedLocale = call.getString("locale")
                    if #available(iOS 26.0, *), SpeechTranscriber.isAvailable {
                        let supported = await SpeechTranscriber.supportedLocales
                        let locale = requestedLocale.flatMap { requested in
                            supported.first(where: { $0.identifier == requested })
                        } ?? self.preferredLocale(from: supported)
                        let session = ModernSpeechSession(locale: locale) { [weak self] text, isFinal in
                            DispatchQueue.main.async {
                                self?.emitTranscript(text: text, isFinal: isFinal)
                            }
                        }
                        self.modernSpeech = session
                        try await session.start()
                        call.resolve(["sessionId": sessionId, "locale": session.localeIdentifier, "engine": "speech-analyzer"])
                    } else {
                        try self.startLegacySpeech(localeIdentifier: requestedLocale)
                        call.resolve(["sessionId": sessionId, "locale": self.legacyRecognizer?.locale.identifier ?? "en-PH", "engine": "on-device-speech-recognizer"])
                    }
                } catch {
                    self.transcriptSessionId = nil
                    self.modernSpeech = nil
                    self.stopLegacySpeech(cancelled: true)
                    call.reject("On-device transcription could not start.", "SPEECH_UNAVAILABLE")
                }
            }
        }
    }

    @objc func stopTranscription(_ call: CAPPluginCall) {
        finishTranscription(cancelled: false, call: call)
    }

    @objc func cancelTranscription(_ call: CAPPluginCall) {
        finishTranscription(cancelled: true, call: call)
    }

    @objc func clearHistory(_ call: CAPPluginCall) {
        resetPlanner()
        call.resolve()
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private func planner() -> LanguageModelSession {
        if let plannerSession { return plannerSession }
        let instructions = """
        You are Kairos, an on-device scheduling planner. Understand English and Taglish. Inspect local schedule and preferences using read-only tools. Preserve compound requests as separate actions. Use ISO 8601 timestamps with offsets. Never write data, send messages, invent locations, or hide assumptions. Fixed events and deadlines are fixed; ordinary tasks are flexible. Ask one concise clarification when a safe proposal is impossible.
        """
        let session = LanguageModelSession(
            tools: [
                ScheduleLookupTool(vault: vault),
                PreferenceLookupTool(vault: vault),
                FreeWindowTool(vault: vault)
            ],
            instructions: instructions
        )
        plannerSession = session
        return session
    }

    @available(iOS 26.0, *)
    private func actionDictionary(_ action: NativeSchedulingAction) -> [String: Any] {
        [
            "kind": action.kind,
            "title": action.title,
            "category": action.category,
            "locationLabel": action.locationLabel,
            "startAt": action.startAt,
            "endAt": action.endAt,
            "dueAt": action.dueAt,
            "durationMinutes": action.durationMinutes,
            "totalEffortMinutes": action.totalEffortMinutes,
            "sessionLengthMinutes": action.sessionLengthMinutes,
            "blockCount": action.blockCount,
            "afterTitle": action.afterTitle,
            "relatedDeadlineTitle": action.relatedDeadlineTitle,
            "flexibility": action.flexibility,
            "canShorten": action.canShorten,
            "canSplit": action.canSplit,
            "canSkip": action.canSkip,
            "priority": action.priority,
            "reminderMinutes": action.reminderMinutes,
            "assumptions": action.assumptions
        ]
    }
    #endif

    private func resetPlanner() {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) { plannerSession = nil }
        #endif
    }

    private func requestSpeechPermission(_ completion: @escaping (Bool) -> Void) {
        let group = DispatchGroup()
        var speechGranted = SFSpeechRecognizer.authorizationStatus() == .authorized
        var microphoneGranted = AVAudioSession.sharedInstance().recordPermission == .granted
        if SFSpeechRecognizer.authorizationStatus() == .notDetermined {
            group.enter()
            SFSpeechRecognizer.requestAuthorization { status in
                speechGranted = status == .authorized
                group.leave()
            }
        }
        if AVAudioSession.sharedInstance().recordPermission == .undetermined {
            group.enter()
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                microphoneGranted = granted
                group.leave()
            }
        }
        group.notify(queue: .main) { completion(speechGranted && microphoneGranted) }
    }

    private func startLegacySpeech(localeIdentifier: String?) throws {
        let locale = localeIdentifier.map(Locale.init(identifier:)) ?? preferredLegacyLocale()
        guard let recognizer = SFSpeechRecognizer(locale: locale),
              recognizer.isAvailable,
              recognizer.supportsOnDeviceRecognition else {
            throw NSError(domain: "KairosSpeech", code: 1)
        }
        let engine = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        request.taskHint = .dictation
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, _ in
            request.append(buffer)
        }
        legacyTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            if let result {
                self?.emitTranscript(text: result.bestTranscription.formattedString, isFinal: result.isFinal)
            }
            if error != nil { self?.stopLegacySpeech(cancelled: true) }
        }
        try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: [.duckOthers])
        try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        engine.prepare()
        try engine.start()
        legacyRecognizer = recognizer
        legacyRequest = request
        legacyEngine = engine
    }

    private func finishTranscription(cancelled: Bool, call: CAPPluginCall) {
        guard let sessionId = transcriptSessionId else {
            call.resolve(["active": false])
            return
        }
        transcriptSessionId = nil
        if #available(iOS 26.0, *), let session = modernSpeech as? ModernSpeechSession {
            Task {
                await session.stop(cancelled: cancelled)
                modernSpeech = nil
                call.resolve(["active": false, "sessionId": sessionId])
            }
        } else {
            stopLegacySpeech(cancelled: cancelled)
            call.resolve(["active": false, "sessionId": sessionId])
        }
    }

    private func stopLegacySpeech(cancelled: Bool) {
        if let engine = legacyEngine {
            if engine.isRunning {
                engine.inputNode.removeTap(onBus: 0)
                engine.stop()
            }
        }
        if cancelled {
            legacyTask?.cancel()
        } else {
            legacyRequest?.endAudio()
            legacyTask?.finish()
        }
        legacyRecognizer = nil
        legacyRequest = nil
        legacyTask = nil
        legacyEngine = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func emitTranscript(text: String, isFinal: Bool) {
        guard let sessionId = transcriptSessionId, !text.isEmpty else { return }
        transcriptSequence += 1
        notifyListeners("transcript", data: [
            "sessionId": sessionId,
            "sequence": transcriptSequence,
            "text": text,
            "isFinal": isFinal
        ])
    }

    @available(iOS 26.0, *)
    private func preferredLocale(from locales: [Locale]) -> Locale {
        locales.first(where: { $0.identifier.caseInsensitiveCompare("en-PH") == .orderedSame })
            ?? locales.first(where: { $0.language.languageCode?.identifier == "en" })
            ?? locales.first
            ?? Locale(identifier: "en-US")
    }

    private func preferredLegacyLocale() -> Locale {
        let locales = SFSpeechRecognizer.supportedLocales()
        return locales.first(where: { $0.identifier.caseInsensitiveCompare("en-PH") == .orderedSame })
            ?? locales.first(where: { $0.identifier.lowercased().hasPrefix("en") })
            ?? Locale(identifier: "en-US")
    }

    private func speechState(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "ready"
        case .notDetermined: return "prompt"
        case .denied: return "denied"
        case .restricted: return "restricted"
        @unknown default: return "unavailable"
        }
    }
}
