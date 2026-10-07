#!/usr/bin/env python3
"""Build pulse-preview.html by inlining the real deliverables (no drift).

The sandboxed preview pane is narrow, so the built file also carries a
preview-only override that scales a 1440px iframe down to the pane size.
Desktop media queries see the iframe's real 1440px width, so the true
desktop composition is what gets inspected. The deliverables
(pulse.html / pulse.css / pulse.js) are never modified.
"""
import pathlib, re

root = pathlib.Path(__file__).parent
html = (root / "pulse.html").read_text(encoding="utf-8")
css = (root / "pulse.css").read_text(encoding="utf-8")
js = (root / "pulse.js").read_text(encoding="utf-8")

# 1. Inline the real stylesheet and script.
html, n_css = re.subn(
    r'<link rel="stylesheet" href="pulse\.css"\s*/?>',
    "<style>\n" + css + "\n</style>",
    html, count=1,
)
html, n_js = re.subn(
    r'<script src="pulse\.js"></script>',
    "<script>\n" + js + "\n</script>",
    html, count=1,
)

# 2. Preview-only scaler: a 1440x900 iframe scaled to fit the narrow pane.
SCALER = """
<style id="preview-only-scaler">
  html, body { margin: 0; background: #0d0620; }
  body.preview-top-level > :not(#preview-frame-scaler) { display: none !important; }
  #preview-frame-scaler {
    position: fixed; inset: 0; background: #0d0620; z-index: 2147483647;
  }
  #preview-frame-scaler iframe {
    width: 1440px; height: 900px; border: 0;
    transform: scale(0.305); transform-origin: 0 0;
  }
</style>
<script id="preview-only-scaler-js">
  window.addEventListener("DOMContentLoaded", function () {
    if (window.self !== window.top) return; /* never recurse inside the lens */
    document.body.classList.add("preview-top-level");
    var frame = document.createElement("iframe");
    frame.src = location.pathname;
    var scaler = document.createElement("div");
    scaler.id = "preview-frame-scaler";
    scaler.appendChild(frame);
    document.body.appendChild(scaler);
  });
</script>
"""
html = html.replace("</head>", SCALER + "</head>", 1)

assert n_css == 1 and n_js == 1, f"splice failed: css={n_css} js={n_js}"
assert html.count("preview-frame-scaler") >= 2
(root / "pulse-preview.html").write_text(html, encoding="utf-8")
print("pulse-preview.html written (deliverables inlined, scaler added)")
