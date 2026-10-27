import SwiftUI
import WebKit

/// 主界面：铺满全屏的 WKWebView，加载内置的网页版应用（完全离线）。
struct ContentView: View {
    var body: some View {
        WebViewContainer()
            .ignoresSafeArea()
            .background(Color(red: 0.02, green: 0.08, blue: 0.16))
    }
}

struct WebViewContainer: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
            config.preferences.isTextInteractionEnabled = false
        }

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.scrollView.bouncesZoom = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = context.coordinator
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        loadLocalApp(into: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    private func loadLocalApp(into webView: WKWebView) {
        guard
            let indexURL = Bundle.main.url(
                forResource: "index",
                withExtension: "html",
                subdirectory: "www"
            )
        else {
            webView.loadHTMLString(Self.missingResourceHTML, baseURL: nil)
            return
        }
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            if url.isFileURL {
                decisionHandler(.allow)
                return
            }
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }

    private static let missingResourceHTML = """
    <!doctype html>
    <html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body{font-family:-apple-system,"PingFang SC",sans-serif;padding:32px;line-height:1.7;
           color:#e9f5ff;background:#061428}
      code{background:rgba(255,255,255,.1);padding:2px 6px;border-radius:5px}
    </style></head><body>
    <h2>未找到内置网页资源</h2>
    <p>请确认 Xcode 工程中 <code>www</code> 目录已作为「文件夹引用（蓝色文件夹）」加入
    target 的 <b>Copy Bundle Resources</b>，且其中包含 <code>index.html</code>。</p>
    </body></html>
    """
}
