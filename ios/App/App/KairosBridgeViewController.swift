import Capacitor

@objc(KairosBridgeViewController)
final class KairosBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KairosTripMonitorPlugin())
    }
}
