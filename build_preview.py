#!/usr/bin/env python3
"""Build preview bundles by inlining the real deliverables (no drift).

The sandboxed preview pane is narrow, so each built file also carries a
preview-only override that scales a 1440px iframe down to the pane size.
Desktop media queries see the iframe's real 1440px width, so the true
desktop composition is what gets inspected. The deliverables
(pulse.* / dashboard.*) are never modified.

Two bundles are produced:
  pulse-preview.html      — the landing page
  dashboard-preview.html  — the dashboard (with a demo session seeded,
                            since the real page guards on sign-in)
"""
import pathlib
import re

root = pathlib.Path(__file__).parent

# ------------------------------------------------------------------
# Preview-only scaler: a 1440x900 iframe scaled to fit the narrow pane.
# ------------------------------------------------------------------
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

# Demo session for the dashboard preview only — the deliverable itself
# keeps its strict "no session -> bounce to pulse.html" guard.
SESSION_SEED = """
<script id="preview-only-session-seed">
  try {
    if (!localStorage.getItem("pulse.session")) {
      localStorage.setItem("pulse.session", JSON.stringify({
        name: "Amara Okafor",
        email: "amara@pulse.example",
        startedAt: Date.now()
      }));
    }
  } catch (e) { /* storage blocked — guard will bounce, noted in report */ }
</script>
"""


def build(name: str, html_name: str, css_name: str, js_name: str,
          seed_session: bool = False) -> None:
    html = (root / html_name).read_text(encoding="utf-8")
    css = (root / css_name).read_text(encoding="utf-8")
    js = (root / js_name).read_text(encoding="utf-8")

    # 1. Inline the real stylesheet and script.
    #    (replacement passed as a function so backslashes in the source
    #     code are copied literally, not parsed as regex escapes)
    html, n_css = re.subn(
        r'<link rel="stylesheet" href="' + re.escape(css_name) + r'"\s*/?>',
        lambda _m: "<style>\n" + css + "\n</style>",
        html, count=1,
    )
    html, n_js = re.subn(
        r'<script src="' + re.escape(js_name) + r'"></script>',
        lambda _m: "<script>\n" + js + "\n</script>",
        html, count=1,
    )

    assert n_css == 1 and n_js == 1, (
        f"{name}: splice failed: css={n_css} js={n_js}"
    )

    # 2. Inject the scaler (+ optional demo session) before </head>.
    injection = (SESSION_SEED if seed_session else "") + SCALER
    html = html.replace("</head>", injection + "</head>", 1)
    assert html.count("preview-frame-scaler") >= 2, f"{name}: scaler missing"

    # 3. Deliverable scripts may reference sibling pages; point the bundle
    #    at the sibling *bundle* so navigation works inside the preview.
    sibling = "dashboard-preview.html" if name.startswith("pulse") else "pulse-preview.html"
    html = html.replace('"dashboard.html"', f'"{sibling}"')
    html = html.replace('"pulse.html"', f'"{sibling}"')

    (root / name).write_text(html, encoding="utf-8")
    print(f"{name} written (deliverables inlined, scaler added"
          f"{', session seeded' if seed_session else ''})")


build("pulse-preview.html", "pulse.html", "pulse.css", "pulse.js")
build("dashboard-preview.html", "dashboard.html", "dashboard.css",
      "dashboard.js", seed_session=True)
