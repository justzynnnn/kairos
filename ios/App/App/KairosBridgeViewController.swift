import Capacitor
import UIKit

@objc(KairosBridgeViewController)
final class KairosBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // "Canvas" is the single source of truth shared with the launch
        // storyboard and mirrored by --canvas in mobile-src/styles.css. Being a
        // dynamic UIColor it re-resolves on its own when the user switches
        // appearance, so there is no trait-change handling to keep in sync.
        let canvasColor = UIColor(named: "Canvas") ?? .systemBackground
        view.backgroundColor = canvasColor
        webView?.isOpaque = true
        webView?.backgroundColor = canvasColor
        webView?.scrollView.backgroundColor = canvasColor
        bridge?.registerPluginInstance(KairosTripMonitorPlugin())
        bridge?.registerPluginInstance(KairosIntelligencePlugin())
        bridge?.registerPluginInstance(KairosSecureStorePlugin())
    }
}
