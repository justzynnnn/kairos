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
    @Guide(description: "Title this should follow only when the user explicitly says after, then, tapos, or equivalent. Never infer a dependency from list order or explicit clock times. Otherwise an empty string.")
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

/// Why a recording could not start, so the web layer can say something the user
/// can act on instead of one generic failure.
enum SpeechStartError: Error {
    case audioFormatUnavailable
    case modelUnavailable
    case noAudioInput
    case noOnDeviceLocale

    var code: String {
        switch self {
        case .audioFormatUnavailable: return "SPEECH_AUDIO_FORMAT_UNAVAILABLE"
        case .modelUnavailable: return "SPEECH_MODEL_UNAVAILABLE"
        case .noAudioInput: return "SPEECH_NO_INPUT"
        case .noOnDeviceLocale: return "SPEECH_LOCALE_UNSUPPORTED"
        }
    }

    var message: String {
        switch self {
        case .audioFormatUnavailable:
            return "This phone could not prepare a compatible transcription audio format."
        case .modelUnavailable:
            return "The on-device dictation model is still downloading. Try again in a moment."
        case .noAudioInput:
            return "This phone did not provide a microphone input."
        case .noOnDeviceLocale:
            return "On-device dictation is not installed for your language. Add it in Settings › General › Keyboard › Dictation, or type instead."
        }
    }
}

/// RMS of a capture buffer on a decibel curve, so the ring answers to ordinary
/// speech instead of sitting near zero until someone shouts. -50 dBFS reads as
/// silence and 0 dBFS as full deflection.
private func normalizedLevel(_ buffer: AVAudioPCMBuffer) -> Double {
    guard let channel = buffer.floatChannelData?[0] else { return 0 }
    let count = Int(buffer.frameLength)
    guard count > 0 else { return 0 }
    var sum: Float = 0
    for index in 0..<count {
        let sample = channel[index]
        sum += sample * sample
    }
    let rms = (sum / Float(count)).squareRoot()
    let decibels = 20 * log10(max(rms, 1e-7))
    return Double(min(1, max(0, (decibels + 50) / 50)))
}

private let schedulingVocabulary = [
    "gym", "workout", "exercise", "lunch", "breakfast", "dinner", "school",
    "class", "lecture", "laboratory", "lab", "study", "review", "exam",
    "quiz", "deadline", "meeting", "appointment", "interview", "standup",
    "call", "errand", "commute", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday", "Sunday", "morning", "afternoon",
    "evening", "noon", "midnight", "AM", "PM"
]

private let schedulingVocabularyWords = Set(
    schedulingVocabulary.map { $0.lowercased() }
)

private func preferredSchedulingTranscription(
    _ alternatives: [AttributedString]
) -> String {
    let values = alternatives.map { String($0.characters) }
    guard let first = values.first else { return "" }
    return values.dropFirst().reduce(first) { current, candidate in
        let currentWords = Set(
            current.lowercased().split { !$0.isLetter }.map(String.init)
        )
        let candidateWords = Set(
            candidate.lowercased().split { !$0.isLetter }.map(String.init)
        )
        let currentScore = currentWords.intersection(
            schedulingVocabularyWords
        ).count
        let candidateScore = candidateWords.intersection(
            schedulingVocabularyWords
        ).count
        return candidateScore > currentScore ? candidate : current
    }
}

private func joinedTranscript(_ parts: [String]) -> String {
    parts
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: " ")
}

@available(iOS 26.0, *)
private struct TranscriptSegment {
    let range: CMTimeRange
    let text: String

    private var start: Double {
        CMTimeGetSeconds(range.start)
    }

    private var end: Double {
        CMTimeGetSeconds(range.end)
    }

    func replaces(_ other: TranscriptSegment) -> Bool {
        guard start.isFinite, end.isFinite,
              other.start.isFinite, other.end.isFinite else {
            return false
        }
        // Volatile and finalized interpretations of the same speech occupy
        // the same audio range. Replace that range instead of appending every
        // revision, which otherwise repeats a single utterance several times.
        let overlap = max(start, other.start) < min(end, other.end)
        let sameStart = abs(start - other.start) < 0.02
        return overlap || sameStart
    }

    static func ordered(_ left: TranscriptSegment, _ right: TranscriptSegment) -> Bool {
        CMTimeCompare(left.range.start, right.range.start) < 0
    }
}

@available(iOS 26.0, *)
private final class ModernSpeechSession {
    private let analyzer: SpeechAnalyzer
    private let transcriber: DictationTranscriber
    private let engine = AVAudioEngine()
    private var continuation: AsyncStream<AnalyzerInput>.Continuation?
    private var analysisTask: Task<Void, Never>?
    private var resultTask: Task<Void, Never>?
    private var audioConverter: AVAudioConverter?
    private var tapInstalled = false
    private let onResult: @Sendable (String, Bool) -> Void
    private let onLevel: @Sendable (Double) -> Void
    let localeIdentifier: String

    init(
        locale: Locale,
        onResult: @escaping @Sendable (String, Bool) -> Void,
        onLevel: @escaping @Sendable (Double) -> Void
    ) {
        self.localeIdentifier = locale.identifier
        self.onResult = onResult
        self.onLevel = onLevel
        let preset = DictationTranscriber.Preset.shortDictation
        transcriber = DictationTranscriber(
            locale: locale,
            contentHints: preset.contentHints,
            transcriptionOptions: preset.transcriptionOptions,
            reportingOptions: preset.reportingOptions.union([
                .volatileResults,
                .alternativeTranscriptions
            ]),
            attributeOptions: preset.attributeOptions
        )
        analyzer = SpeechAnalyzer(
            modules: [transcriber],
            options: .init(priority: .userInitiated, modelRetention: .lingering)
        )
    }

    func start() async throws {
        let modules: [any SpeechModule] = [transcriber]
        do {
            if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
                try await request.downloadAndInstall()
            }
        } catch {
            throw SpeechStartError.modelUnavailable
        }
        // The session has to be configured and active before the input node is
        // asked for its format: on a device an inactive session reports a zero
        // sample rate, and installing a tap with that format throws.
        try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: [.duckOthers])
        try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        let inputNode = engine.inputNode
        let captureFormat = inputNode.outputFormat(forBus: 0)
        guard captureFormat.sampleRate > 0 else {
            throw SpeechStartError.noAudioInput
        }
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: modules,
            considering: captureFormat
        ), let converter = AVAudioConverter(
            from: captureFormat,
            to: analyzerFormat
        ) else {
            throw SpeechStartError.audioFormatUnavailable
        }
        audioConverter = converter
        let analysisContext = AnalysisContext()
        analysisContext.contextualStrings[.general] = schedulingVocabulary
        try await analyzer.setContext(analysisContext)
        try await analyzer.prepareToAnalyze(in: analyzerFormat)
        let stream = AsyncStream<AnalyzerInput> { continuation in
            self.continuation = continuation
        }
        resultTask = Task { [transcriber, onResult] in
            var transcriptSegments = [TranscriptSegment]()
            do {
                for try await result in transcriber.results {
                    let phrase = preferredSchedulingTranscription(
                        result.alternatives
                    )
                    let segment = TranscriptSegment(
                        range: result.range,
                        text: phrase
                    )
                    transcriptSegments.removeAll {
                        segment.replaces($0)
                    }
                    if !phrase.isEmpty { transcriptSegments.append(segment) }
                    transcriptSegments.sort(by: TranscriptSegment.ordered)
                    onResult(
                        joinedTranscript(transcriptSegments.map(\.text)),
                        result.isFinal
                    )
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
        inputNode.installTap(onBus: 0, bufferSize: 1_024, format: captureFormat) { [weak self] buffer, _ in
            guard let self else { return }
            let level = normalizedLevel(buffer)
            self.convertAndYield(buffer, to: analyzerFormat)
            self.onLevel(level)
        }
        tapInstalled = true
        engine.prepare()
        try engine.start()
    }

    private func convertAndYield(
        _ buffer: AVAudioPCMBuffer,
        to analyzerFormat: AVAudioFormat
    ) {
        guard let audioConverter else { return }
        let rateRatio = analyzerFormat.sampleRate / buffer.format.sampleRate
        let estimatedFrames =
            ceil(Double(buffer.frameLength) * rateRatio) + 32
        let capacity = AVAudioFrameCount(max(estimatedFrames, 1))
        guard let converted = AVAudioPCMBuffer(
            pcmFormat: analyzerFormat,
            frameCapacity: capacity
        ) else { return }

        var suppliedInput = false
        var conversionError: NSError?
        audioConverter.convert(
            to: converted,
            error: &conversionError
        ) { _, status in
            guard !suppliedInput else {
                status.pointee = .noDataNow
                return nil
            }
            suppliedInput = true
            status.pointee = .haveData
            return buffer
        }
        guard conversionError == nil, converted.frameLength > 0 else { return }
        continuation?.yield(AnalyzerInput(buffer: converted))
    }

    func stop(cancelled: Bool) async {
        if tapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        if engine.isRunning { engine.stop() }
        continuation?.finish()
        continuation = nil
        if cancelled {
            await analyzer.cancelAndFinishNow()
        } else {
            try? await analyzer.finalizeAndFinishThroughEndOfInput()
        }
        analysisTask?.cancel()
        resultTask?.cancel()
        audioConverter = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

@objc(KairosIntelligencePlugin)
final class KairosIntelligencePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "KairosIntelligencePlugin"
    let jsName = "KairosIntelligence"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
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
    private var transcriptStartId: String?
    private var lastLevelAt: CFAbsoluteTime = 0
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
                let supported = await DictationTranscriber.supportedLocales
                modernSpeechAvailable = !supported.isEmpty
                locales = supported.map(\.identifier)
                selectedLocale = preferredLocale(from: supported).identifier
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

    /// A permission the user already refused can only be changed in Settings,
    /// and iOS never asks twice — so the app has to take them there.
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString),
                  UIApplication.shared.canOpenURL(url) else {
                call.reject("Settings could not be opened.")
                return
            }
            UIApplication.shared.open(url)
            call.resolve()
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
        guard transcriptSessionId == nil, transcriptStartId == nil else {
            call.reject("A transcription is already active.")
            return
        }
        let startId = UUID().uuidString
        transcriptStartId = startId
        requestSpeechPermission { [weak self] granted in
            guard let self else { return }
            guard self.transcriptStartId == startId else {
                call.resolve(["sessionId": startId, "cancelled": true])
                return
            }
            guard granted else {
                self.transcriptStartId = nil
                call.reject("Microphone or speech recognition permission was denied.", "SPEECH_PERMISSION_DENIED")
                return
            }
            Task { @MainActor in
                do {
                    let sessionId = UUID().uuidString
                    self.transcriptSessionId = sessionId
                    self.transcriptSequence = 0
                    let requestedLocale = call.getString("locale")
                    if #available(iOS 26.0, *),
                       !(await DictationTranscriber.supportedLocales).isEmpty {
                        let supported = await DictationTranscriber.supportedLocales
                        let locale = requestedLocale.flatMap { requested in
                            supported.first(where: { $0.identifier == requested })
                        } ?? self.preferredLocale(from: supported)
                        let session = ModernSpeechSession(
                            locale: locale,
                            onResult: { [weak self] text, isFinal in
                                DispatchQueue.main.async {
                                    self?.emitTranscript(text: text, isFinal: isFinal)
                                }
                            },
                            onLevel: { [weak self] level in
                                self?.emitLevel(level)
                            }
                        )
                        self.modernSpeech = session
                        try await session.start()
                        /*
                         * Starting can take seconds when the dictation model
                         * has to install, and the recording sheet is on screen
                         * for all of it — so Cancel can land before this line.
                         * A cleared session id means it did: the engine that
                         * just started belongs to nobody, and without this it
                         * would hold the microphone with no way to stop it.
                         */
                        guard self.transcriptSessionId == sessionId,
                              self.transcriptStartId == startId else {
                            await session.stop(cancelled: true)
                            if self.modernSpeech === session { self.modernSpeech = nil }
                            self.transcriptStartId = nil
                            call.resolve(["sessionId": sessionId, "cancelled": true])
                            return
                        }
                        self.transcriptStartId = nil
                        call.resolve(["sessionId": sessionId, "locale": session.localeIdentifier, "engine": "speech-analyzer"])
                    } else {
                        try self.startLegacySpeech(localeIdentifier: requestedLocale)
                        self.transcriptStartId = nil
                        call.resolve(["sessionId": sessionId, "locale": self.legacyRecognizer?.locale.identifier ?? "en-PH", "engine": "on-device-speech-recognizer"])
                    }
                } catch {
                    self.transcriptStartId = nil
                    self.transcriptSessionId = nil
                    self.modernSpeech = nil
                    self.stopLegacySpeech(cancelled: true)
                    if let reason = error as? SpeechStartError {
                        call.reject(reason.message, reason.code)
                    } else {
                        call.reject("On-device transcription could not start.", "SPEECH_UNAVAILABLE")
                    }
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
        // The one-action-per-clause rule was stated and still got ignored: the
        // model would summarise a compound request and emit only its first
        // item. Worked examples hold it far better than the instruction alone,
        // so the count is made explicit and shown in both languages.
        let instructions = """
        You are Mori, an on-device scheduling planner. Understand English and Taglish. Inspect local schedule and preferences using read-only tools. Use ISO 8601 timestamps with offsets. Never write data, send messages, invent locations, or hide assumptions. Fixed events and deadlines are fixed; ordinary tasks are flexible. Ask one concise clarification when a safe proposal is impossible.

        Every separate thing the user names is its own action. Count the things they listed and return exactly that many actions. Never merge them, never drop the ones after the first, and never keep only the one you find most important.

        Example: "Circuits 1 at 9-11:30am, lunch at 12 to 1pm, gym at 1:30 to 3pm" names three things, so return three actions — Circuits 1 from 09:00 to 11:30, Lunch from 12:00 to 13:00, and Gym from 13:30 to 15:00.

        Example: "gym bukas ng 6am tapos dinner ng 7pm" names two things, so return two actions, both on tomorrow's date.

        Example: "move my dentist appointment" names one thing and is missing its new time, so return a clarification instead of guessing.

        A time range stating the meridiem once applies it to both ends: "9-11:30am" is 09:00 to 11:30, and "12 to 1pm" is 12:00 to 13:00.

        Comma order is not schedule order. Never set afterTitle merely because one item was mentioned after another. Use it only when the user explicitly states a dependency such as "after lunch", "then", or "tapos".
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

    /// The first recognizer that can work entirely on device. Audio never leaves
    /// the phone, so a locale without a local model is skipped rather than
    /// quietly downgraded to Apple's servers.
    private func onDeviceRecognizer(preferring localeIdentifier: String?) -> SFSpeechRecognizer? {
        var candidates = [Locale]()
        if let localeIdentifier { candidates.append(Locale(identifier: localeIdentifier)) }
        candidates.append(preferredLegacyLocale())
        candidates.append(contentsOf: SFSpeechRecognizer.supportedLocales()
            .filter { $0.identifier.lowercased().hasPrefix("en") }
            .sorted { $0.identifier < $1.identifier })
        var seen = Set<String>()
        for locale in candidates where seen.insert(locale.identifier).inserted {
            if let recognizer = SFSpeechRecognizer(locale: locale),
               recognizer.isAvailable,
               recognizer.supportsOnDeviceRecognition {
                return recognizer
            }
        }
        return nil
    }

    private func startLegacySpeech(localeIdentifier: String?) throws {
        guard let recognizer = onDeviceRecognizer(preferring: localeIdentifier) else {
            throw SpeechStartError.noOnDeviceLocale
        }
        // Order matters: an inactive session reports a zero sample rate for the
        // input node, and installTap with that format throws.
        try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: [.duckOthers])
        try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        let engine = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        request.taskHint = .dictation
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else { throw SpeechStartError.noAudioInput }
        input.installTap(onBus: 0, bufferSize: 1_024, format: format) { [weak self] buffer, _ in
            // Same ordering rule as the modern path: measure, then hand off.
            let level = normalizedLevel(buffer)
            request.append(buffer)
            self?.emitLevel(level)
        }
        legacyTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            if let result {
                self?.emitTranscript(text: result.bestTranscription.formattedString, isFinal: result.isFinal)
            }
            if error != nil { self?.stopLegacySpeech(cancelled: true) }
        }
        engine.prepare()
        try engine.start()
        legacyRecognizer = recognizer
        legacyRequest = request
        legacyEngine = engine
    }

    private func finishTranscription(cancelled: Bool, call: CAPPluginCall) {
        guard let sessionId = transcriptSessionId else {
            transcriptStartId = nil
            call.resolve(["active": false])
            return
        }
        transcriptSessionId = nil
        transcriptStartId = nil
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

    /// Capture buffers arrive around 43 times a second, which is far more than
    /// a ring animation needs and more than the bridge should carry. Throttling
    /// to ~20 Hz keeps the motion smooth while halving the traffic, and the
    /// event is kept separate from `transcript` so metering can never change
    /// the cadence partial results are delivered at.
    private func emitLevel(_ level: Double) {
        // Called from the audio tap, so nothing here may touch plugin state
        // directly: the hop happens first and the throttle runs on the main
        // thread, where `transcriptSessionId` is also written.
        DispatchQueue.main.async { [weak self] in
            guard let self, let sessionId = self.transcriptSessionId else { return }
            let now = CFAbsoluteTimeGetCurrent()
            guard now - self.lastLevelAt >= 0.05 else { return }
            self.lastLevelAt = now
            self.notifyListeners("level", data: [
                "sessionId": sessionId,
                "level": level
            ])
        }
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
