import Capacitor
import CoreLocation
import Foundation
import Security
import UserNotifications

private struct ActiveTrip: Codable {
    let sessionId: String
    let token: String
    let endpoint: String
    let itemId: String
    let destinationLatitude: Double
    let destinationLongitude: Double
    let expiresAt: Date
}

@objc(KairosTripMonitorPlugin)
final class KairosTripMonitorPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
    let identifier = "KairosTripMonitorPlugin"
    let jsName = "KairosTripMonitor"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CLLocationManager()
    private var activeTrip: ActiveTrip?
    private var lastUploadAt: Date?
    private var lastUploadLocation: CLLocation?
    private var permissionCall: CAPPluginCall?
    private var notificationGranted = false
    private var requestedAlways = false
    private let keychainAccount = "active-journey"

    @objc override func load() {
        manager.delegate = self
        manager.activityType = .automotiveNavigation
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        UNUserNotificationCenter.current().delegate = self
        activeTrip = restoreTrip()
        if let trip = activeTrip, trip.expiresAt > Date(), locationGranted {
            beginLocationUpdates()
        } else if activeTrip != nil {
            clearTrip()
        }
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        permissionCall = call
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
            DispatchQueue.main.async {
                self?.notificationGranted = granted
                self?.requestLocationIfNeeded()
            }
        }
    }

    private func requestLocationIfNeeded() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            requestedAlways = true
            manager.requestAlwaysAuthorization()
        default:
            resolvePermissionCall()
        }
    }

    private var locationGranted: Bool {
        manager.authorizationStatus == .authorizedAlways
    }

    private func locationState() -> String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "granted"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    private func resolvePermissionCall() {
        guard let call = permissionCall else { return }
        permissionCall = nil
        call.resolve(["location": locationState(), "notifications": notificationGranted ? "granted" : "denied"])
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse, permissionCall != nil, !requestedAlways {
            requestedAlways = true
            manager.requestAlwaysAuthorization()
            return
        }
        if manager.authorizationStatus != .notDetermined { resolvePermissionCall() }
        if !locationGranted, activeTrip != nil { stopMonitoring(reason: "permission_revoked") }
    }

    @objc func startTrip(_ call: CAPPluginCall) {
        guard locationGranted else { call.reject("Allow location access before starting background traffic monitoring."); return }
        guard let sessionId = call.getString("sessionId"), let token = call.getString("token"),
              let endpoint = call.getString("endpoint"), let itemId = call.getString("itemId"),
              let destinationLatitude = call.getDouble("destinationLatitude"),
              let destinationLongitude = call.getDouble("destinationLongitude"),
              let expiresAtText = call.getString("expiresAt"),
              let expiresAt = ISO8601DateFormatter().date(from: expiresAtText),
              let endpointURL = URL(string: endpoint), endpointURL.scheme == "https" || endpointURL.host == "localhost"
        else { call.reject("Journey configuration is invalid."); return }
        guard expiresAt > Date() else { call.reject("Journey session has expired."); return }
        activeTrip = ActiveTrip(sessionId: sessionId, token: token, endpoint: endpoint, itemId: itemId, destinationLatitude: destinationLatitude, destinationLongitude: destinationLongitude, expiresAt: expiresAt)
        persistTrip(activeTrip!)
        lastUploadAt = nil
        lastUploadLocation = nil
        beginLocationUpdates()
        call.resolve(["active": true])
    }

    private func beginLocationUpdates() {
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
    }

    @objc func stopTrip(_ call: CAPPluginCall) {
        stopMonitoring(reason: "stopped")
        call.resolve(["active": false])
    }

    @objc func getState(_ call: CAPPluginCall) {
        if let trip = activeTrip { call.resolve(["active": true, "sessionId": trip.sessionId, "itemId": trip.itemId, "expiresAt": ISO8601DateFormatter().string(from: trip.expiresAt)]) }
        else { call.resolve(["active": false]) }
    }

    private func stopMonitoring(reason: String) {
        if let trip = activeTrip { closeRemote(trip: trip, reason: reason) }
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        clearTrip()
        notifyListeners("journeyUpdate", data: ["stopped": true, "reason": reason])
    }

    private func closeRemote(trip: ActiveTrip, reason: String) {
        guard let url = URL(string: trip.endpoint) else { return }
        var request = URLRequest(url: url); request.httpMethod = "DELETE"; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.setValue("Bearer \(trip.token)", forHTTPHeaderField: "Authorization")
        let status = reason == "arrived" ? "arrived" : reason == "expired" ? "expired" : "stopped"
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["journeySessionId": trip.sessionId, "status": status])
        URLSession.shared.dataTask(with: request).resume()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let trip = activeTrip, let location = locations.last else { return }
        if trip.expiresAt <= Date() { stopMonitoring(reason: "expired"); return }
        let destination = CLLocation(latitude: trip.destinationLatitude, longitude: trip.destinationLongitude)
        if location.distance(from: destination) <= 100 { stopMonitoring(reason: "arrived"); return }
        let timeDue = lastUploadAt.map { Date().timeIntervalSince($0) >= 60 } ?? true
        let distanceDue = lastUploadLocation.map { location.distance(from: $0) >= 250 } ?? true
        if timeDue || distanceDue { upload(location: location, trip: trip) }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        notifyListeners("journeyUpdate", data: ["error": "Background location is temporarily unavailable."])
    }

    private func upload(location: CLLocation, trip: ActiveTrip) {
        guard let url = URL(string: trip.endpoint) else { return }
        lastUploadAt = Date(); lastUploadLocation = location
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(trip.token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 25
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["itemId": trip.itemId, "journeySessionId": trip.sessionId, "latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude])
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            guard let self, let http = response as? HTTPURLResponse, let data, (200..<300).contains(http.statusCode),
                  let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            DispatchQueue.main.async {
                self.notifyListeners("journeyUpdate", data: payload)
                if let repair = payload["repair"] as? [String: Any], let incidentId = repair["id"] as? String {
                    self.sendRepairNotification(incidentId: incidentId, reason: repair["reason"] as? String)
                }
                if payload["arrived"] as? Bool == true { self.stopMonitoring(reason: "arrived") }
            }
        }.resume()
    }

    private func sendRepairNotification(incidentId: String, reason: String?) {
        let content = UNMutableNotificationContent()
        content.title = "Kairos repaired your schedule"
        content.body = reason ?? "Traffic changed the flexible parts of your day. Tap to review or undo."
        content.sound = .default
        content.userInfo = ["incidentId": incidentId, "path": "/?incident=\(incidentId)"]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "repair-\(incidentId)", content: content, trigger: nil))
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let incidentId = response.notification.request.content.userInfo["incidentId"] as? String
        notifyListeners("repairNotificationTapped", data: ["incidentId": incidentId ?? ""])
        completionHandler()
    }

    private func persistTrip(_ trip: ActiveTrip) {
        guard let data = try? JSONEncoder().encode(trip) else { return }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.kairos.guardian", kSecAttrAccount as String: keychainAccount]
        SecItemDelete(query as CFDictionary)
        var value = query; value[kSecValueData as String] = data; value[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(value as CFDictionary, nil)
    }

    private func restoreTrip() -> ActiveTrip? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.kairos.guardian", kSecAttrAccount as String: keychainAccount, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: AnyObject?; guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(ActiveTrip.self, from: data)
    }

    private func clearTrip() {
        activeTrip = nil
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.kairos.guardian", kSecAttrAccount as String: keychainAccount]
        SecItemDelete(query as CFDictionary)
    }
}
