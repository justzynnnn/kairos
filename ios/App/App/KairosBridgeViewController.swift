import Capacitor
import UIKit

@objc(KairosBridgeViewController)
final class KairosBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        let canvasColor = UIColor(red: 245 / 255, green: 247 / 255, blue: 251 / 255, alpha: 1)
        view.backgroundColor = canvasColor
        webView?.isOpaque = true
        webView?.backgroundColor = canvasColor
        webView?.scrollView.backgroundColor = canvasColor
        bridge?.registerPluginInstance(KairosTripMonitorPlugin())
        bridge?.registerPluginInstance(KairosIntelligencePlugin())
        bridge?.registerPluginInstance(KairosSecureStorePlugin())
    }
}
