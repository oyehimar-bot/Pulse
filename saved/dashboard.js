/* =========================================================
   0. SESSION GUARD — dashboard is only for signed-in users
========================================================= */

const REDUCED_MOTION = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

function readSession() {
  try {
    return JSON.parse(localStorage.getItem("pulse.session") || "null");
  } catch (error) {
    return null;
  }
}

const session = readSession();

if (!session) {
  /* No session on disk — bounce to the landing page sign-in.
     (In the preview bundle a demo session is seeded below the guard
      by the preview harness only when explicitly asked; a real visitor
      always goes through the sign-in panel first.) */
  window.location.replace("pulse.html");
} else {
  const displayName =
    (session.name || session.email || "Creator").split(/[@\s]/)[0];

  document.getElementById("sideName").textContent = displayName.replace(
    /^./,
    (c) => c.toUpperCase()
  );
  document.getElementById("sideEmail").textContent = session.email || "";
  document.getElementById("greetLine").innerHTML =
    "<b>" + displayName.replace(/^./, (c) => c.toUpperCase()) + "</b>";
}


/* =========================================================
   1. DATE + GREETING
========================================================= */

const now = new Date();

const dayName = now.toLocaleDateString("en-GB", { weekday: "long" });
const dateShort = now.toLocaleDateString("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

document.getElementById("topbarDate").textContent = dateShort.replace(",", " ·");
document.getElementById("greetKicker").textContent = dayName + " · Lagos";

const hour = now.getHours();
const greetWord =
  hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

const greetLine = document.getElementById("greetLine");
if (greetLine) {
  greetLine.innerHTML = greetWord + ", " + greetLine.innerHTML + ".";
}


/* =========================================================
   2. VIEW ROUTER
========================================================= */

const VIEW_META = {
  overview: { kicker: "Workspace / 01", title: "Overview" },
  deals: { kicker: "Workspace / 02", title: "Deals" },
  vault: { kicker: "Workspace / 03", title: "Vault" },
  certificates: { kicker: "Workspace / 04", title: "Certificates" },
};

const sideItems = document.querySelectorAll(".side-item");
const views = document.querySelectorAll(".view");
const viewTitle = document.getElementById("viewTitle");
const viewKicker = document.getElementById("viewKicker");
const sidebar = document.getElementById("sidebar");

function setView(name) {
  if (!VIEW_META[name]) return;

  views.forEach((view) => {
    view.classList.toggle("active", view.id === "view-" + name);
  });

  sideItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === name);
  });

  viewTitle.textContent = VIEW_META[name].title;
  viewKicker.textContent = VIEW_META[name].kicker;

  sidebar.classList.remove("open");

  /* count-up runs against .view.active [data-count], so every switch
     re-animates that view's numbers (overview KPIs, vault totals) */
  animateCounters();

  window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? "auto" : "smooth" });
}

sideItems.forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.view));
});

document.querySelectorAll("[data-goto]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.goto));
});

document.getElementById("burgerBtn").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});


/* =========================================================
   3. COUNTER ANIMATION (KPI + vault totals)
========================================================= */

function formatValue(value, format) {
  if (format === "naira") {
    return "₦" + Math.round(value).toLocaleString("en-NG");
  }
  if (format === "days") {
    return (value / 10).toFixed(1) + " days";
  }
  return Math.round(value).toLocaleString("en-NG");
}

function animateCounters() {
  document
    .querySelectorAll(".view.active [data-count]")
    .forEach((element) => {
      const target = Number(element.dataset.count);
      const format = element.dataset.format || "";

      if (REDUCED_MOTION) {
        element.textContent = formatValue(target, format);
        return;
      }

      const duration = 900;
      const start = performance.now();

      function tick(time) {
        const progress = Math.min((time - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        element.textContent = formatValue(target * eased, format);

        if (progress < 1) requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    });
}


/* =========================================================
   4. VOLUME CHART (flat bars, no gradients)
========================================================= */

const CHART_DATA = {
  7: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    locked: [42, 58, 36, 74, 66, 30, 48],
    released: [20, 34, 28, 40, 52, 18, 30],
    total: "Total ₦1.86M",
  },
  30: {
    labels: ["W1", "W2", "W3", "W4"],
    locked: [64, 82, 58, 91],
    released: [40, 55, 48, 70],
    total: "Total ₦4.82M",
  },
  90: {
    labels: ["Jul", "Aug", "Sep"],
    locked: [78, 88, 96],
    released: [52, 64, 76],
    total: "Total ₦13.4M",
  },
};

const chart = document.getElementById("volumeChart");
const chartTotal = document.getElementById("chartTotal");

function renderChart(range) {
  const data = CHART_DATA[range];
  if (!data) return;

  const max = Math.max(...data.locked, ...data.released);

  chart.innerHTML = data.labels
    .map(
      (label, index) => `
      <div class="chart-col">
        <div class="chart-bars">
          <i class="chart-bar" style="height:${
            (data.locked[index] / max) * 100
          }%" title="Locked ₦${data.locked[index]}k"></i>
          <i class="chart-bar released" style="height:${
            (data.released[index] / max) * 100
          }%" title="Released ₦${data.released[index]}k"></i>
        </div>
        <small>${label}</small>
      </div>`
    )
    .join("");

  chartTotal.textContent = data.total;
}

renderChart(7);

document.getElementById("rangeSeg").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-range]");
  if (!button) return;

  document
    .querySelectorAll("#rangeSeg button")
    .forEach((item) => item.classList.toggle("on", item === button));

  renderChart(button.dataset.range);
});


/* =========================================================
   5. DEALS — filters + global search
========================================================= */

const dealRows = Array.from(document.querySelectorAll(".table-row"));
const dealEmpty = document.getElementById("dealEmpty");
const dealCountNote = document.getElementById("dealCountNote");
const filterButtons = document.querySelectorAll("#dealFilters button");

let activeFilter = "all";
let searchTerm = "";

function applyDealFilters() {
  let visible = 0;

  dealRows.forEach((row) => {
    const matchesFilter =
      activeFilter === "all" || row.dataset.status === activeFilter;
    const matchesSearch =
      !searchTerm || (row.dataset.name || "").includes(searchTerm);

    const show = matchesFilter && matchesSearch;
    row.hidden = !show;
    if (show) visible += 1;
  });

  dealEmpty.hidden = visible !== 0;
  dealCountNote.textContent =
    "Showing " + visible + " of " + dealRows.length + " deals";
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;

    filterButtons.forEach((item) =>
      item.classList.toggle("on", item === button)
    );

    applyDealFilters();
  });
});

const globalSearch = document.getElementById("globalSearch");

globalSearch.addEventListener("input", () => {
  searchTerm = globalSearch.value.trim().toLowerCase();

  if (searchTerm) setView("deals");

  applyDealFilters();
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    globalSearch.focus();
  }
});


/* =========================================================
   6. BELL DROPDOWN
========================================================= */

const bellBtn = document.getElementById("bellBtn");
const bellPanel = document.getElementById("bellPanel");

bellBtn.addEventListener("click", (event) => {
  event.stopPropagation();

  const isOpen = bellPanel.classList.toggle("open");
  bellPanel.setAttribute("aria-hidden", String(!isOpen));
  bellBtn.setAttribute("aria-expanded", String(isOpen));
});

bellPanel.addEventListener("click", (event) => event.stopPropagation());

document.addEventListener("click", () => {
  bellPanel.classList.remove("open");
  bellPanel.setAttribute("aria-hidden", "true");
  bellBtn.setAttribute("aria-expanded", "false");
});


/* =========================================================
   7. NEW DEAL MODAL
========================================================= */

const modal = document.getElementById("newDealModal");
const newDealBtn = document.getElementById("newDealBtn");

function openModal() {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

newDealBtn.addEventListener("click", openModal);
document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalCancel").addEventListener("click", closeModal);

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

document.getElementById("modalCreate").addEventListener("click", () => {
  closeModal();
  setView("deals");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});


/* =========================================================
   8. LICENCE DRAFTER — live preview, download, print
========================================================= */

/* One stylesheet, two homes: injected here for the on-screen preview
   and embedded verbatim in the downloaded / printed file, so what you
   see is exactly what you save. Selectors are rooted at #licenceDoc. */

const LICENCE_CSS = `
#licenceDoc {
  display: block;
  background: #FFFFFF;
  border: 1px solid rgba(23, 32, 51, 0.14);
  border-top: 6px solid #800020;
  padding: 28px 32px 24px;

  color: #172033;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 12.5px;
  line-height: 1.62;
}

#licenceDoc * { box-sizing: border-box; }

#licenceDoc .lic-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
}

#licenceDoc .lic-brand strong {
  display: block;
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.32em;
  color: #800020;
}

#licenceDoc .lic-brand span {
  display: block;
  margin-top: 2px;
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 8.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #526078;
}

#licenceDoc .lic-ref { text-align: right; }

#licenceDoc .lic-ref small {
  display: block;
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 8.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #526078;
}

#licenceDoc .lic-ref b {
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 13px;
  letter-spacing: 0.06em;
  color: #1E3A8A;
}

#licenceDoc .lic-kind {
  display: inline-block;
  margin-top: 22px;
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #059669;
}

#licenceDoc .lic-title {
  margin: 6px 0 18px;
  font-size: 21px;
  line-height: 1.32;
}

#licenceDoc .lic-parties {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 16px;
  align-items: center;

  padding: 15px 0;
  border-top: 1px solid rgba(23, 32, 51, 0.14);
  border-bottom: 1px solid rgba(23, 32, 51, 0.14);
}

#licenceDoc .lic-parties small {
  display: block;
  margin-bottom: 4px;
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 8.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #526078;
}

#licenceDoc .lic-parties strong { font-size: 13.5px; }

#licenceDoc .lic-arrow {
  color: #2563EB;
  font-size: 16px;
  font-weight: 700;
}

#licenceDoc .lic-terms {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px 26px;
  margin: 20px 0 0;
}

#licenceDoc .lic-terms > div {
  padding-bottom: 8px;
  border-bottom: 1px dotted rgba(23, 32, 51, 0.32);
}

#licenceDoc .lic-terms .lic-wide { grid-column: 1 / -1; }

#licenceDoc .lic-terms dt {
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 8.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #526078;
}

#licenceDoc .lic-terms dd {
  margin: 4px 0 0;
  font-size: 12.5px;
  font-weight: 700;
}

#licenceDoc .lic-clauses {
  margin-top: 20px;
  padding: 14px 16px;
  background: #F5F3EE;
  border-left: 3px solid #800020;
}

#licenceDoc .lic-clauses small {
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #800020;
}

#licenceDoc .lic-clauses p { margin: 7px 0 0; }

#licenceDoc .lic-foot {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 26px;
  margin-top: 30px;
}

#licenceDoc .lic-signs {
  display: flex;
  gap: 28px;
  flex: 1;
  min-width: 0;
}

#licenceDoc .lic-signs > div { flex: 1; }

#licenceDoc .lic-signs b {
  display: block;
  height: 1px;
  background: #172033;
  margin-bottom: 8px;
}

#licenceDoc .lic-signs span {
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 8.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #526078;
}

#licenceDoc .lic-seal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;

  color: #800020;
  text-align: center;
}

#licenceDoc .lic-seal svg { width: 36px; height: 36px; }

#licenceDoc .lic-seal small {
  font-family: "Poppins", "Segoe UI", Arial, sans-serif;
  font-size: 8px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

#licenceDoc .lic-note {
  margin: 22px 0 0;
  padding-top: 12px;
  border-top: 1px solid rgba(23, 32, 51, 0.14);

  font-size: 10px;
  color: #526078;
}

@media (max-width: 560px) {
  #licenceDoc { padding: 22px 18px; }
  #licenceDoc .lic-parties { grid-template-columns: minmax(0, 1fr); }
  #licenceDoc .lic-arrow { display: none; }
  #licenceDoc .lic-terms { grid-template-columns: minmax(0, 1fr); }
  #licenceDoc .lic-foot { flex-direction: column; align-items: flex-start; }
}
`;

const licenceStyle = document.createElement("style");
licenceStyle.textContent = LICENCE_CSS;
document.head.appendChild(licenceStyle);

const licenceDoc = document.getElementById("licenceDoc");
const licenceForm = document.getElementById("licenceForm");

function escHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;"
      : ch === "<" ? "&lt;"
        : ch === ">" ? "&gt;"
          : ch === '"' ? "&quot;"
            : "&#39;");
}

function formatNaira(raw) {
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return "—";
  return "₦" + Number(digits).toLocaleString("en-NG");
}

function humanDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return value || "—";

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return Number(match[3]) + " " + months[Number(match[2]) - 1] + " " + match[1];
}

function todayStamp() {
  return new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function readLicenceForm() {
  const val = (id) => document.getElementById(id).value.trim();

  return {
    ref: val("licRef") || "PLS-0000",
    kind: "Licence agreement",
    title: val("licTitle") || "Creative licence",
    licensor: val("licLicensor") || "—",
    licensee: val("licLicensee") || "—",
    value: formatNaira(val("licValue")),
    date: humanDate(val("licDate")),
    rights: document.getElementById("licRights").value,
    term: document.getElementById("licTerm").value,
    payment: val("licPayment") || "—",
    clauses: val("licClauses") || "—",
    generated: todayStamp(),
  };
}

/* An issued certificate downloads as the same document shape,
   reconstructed from its card so parties / amount / date match. */
function readCertCard(card) {
  const text = (sel) => {
    const node = card.querySelector(sel);
    return node ? node.textContent.trim() : "";
  };

  const parties = text("p");
  const [pair, ...clauseParts] = parties.split("·");
  const [licensor, licensee] = pair.split("→").map((t) => t.trim());

  return {
    ref: text(".cert-no") || "PLS-0000",
    kind: text(".cert-kind") || "Certificate",
    title: text("h3") || "Creative work",
    licensor: licensor || "—",
    licensee: licensee || "—",
    value: text(".cert-amount") || "—",
    date: text("footer span").replace(/^Issued\s+/, "") || "—",
    rights: "As agreed in the Pulse deal terms",
    term: "As agreed in the Pulse deal terms",
    payment: "Settled in full from Payaza escrow",
    clauses: clauseParts.join("·").trim() || "Recorded in the Pulse deal record for " + (text(".cert-no") || "this deal") + ".",
    generated: todayStamp(),
  };
}

function licenceFragment(d) {
  return `
    <div class="lic-head">
      <div class="lic-brand">
        <strong>PULSE</strong>
        <span>Escrow OS · Creative Commerce</span>
      </div>
      <div class="lic-ref">
        <small>Licence reference</small>
        <b>${escHtml(d.ref)}</b>
      </div>
    </div>

    <span class="lic-kind">${escHtml(d.kind)}</span>
    <h1 class="lic-title">${escHtml(d.title)}</h1>

    <div class="lic-parties">
      <div>
        <small>Licensor — rights holder</small>
        <strong>${escHtml(d.licensor)}</strong>
      </div>
      <span class="lic-arrow">→</span>
      <div>
        <small>Licensee</small>
        <strong>${escHtml(d.licensee)}</strong>
      </div>
    </div>

    <dl class="lic-terms">
      <div><dt>Rights granted</dt><dd>${escHtml(d.rights)}</dd></div>
      <div><dt>Term</dt><dd>${escHtml(d.term)}</dd></div>
      <div><dt>Licence value</dt><dd>${escHtml(d.value)}</dd></div>
      <div><dt>Effective date</dt><dd>${escHtml(d.date)}</dd></div>
      <div class="lic-wide"><dt>Payment terms</dt><dd>${escHtml(d.payment)}</dd></div>
    </dl>

    <div class="lic-clauses">
      <small>Special conditions</small>
      <p>${escHtml(d.clauses)}</p>
    </div>

    <div class="lic-foot">
      <div class="lic-signs">
        <div><b></b><span>Licensor — signature &amp; date</span></div>
        <div><b></b><span>Licensee — signature &amp; date</span></div>
      </div>
      <div class="lic-seal">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9.5" r="5.5"/><path d="M8.6 14 7 21l5-2.4L17 21l-1.6-7"/></svg>
        <small>Secured by Pulse escrow</small>
      </div>
    </div>

    <p class="lic-note">Generated ${escHtml(d.generated)} by Pulse Escrow OS · reflects the agreed terms of deal ${escHtml(d.ref)} · keep this file with your records.</p>`;
}

function licenceFileHTML(d) {
  return "<!DOCTYPE html>\n" +
    "<html lang=\"en\">\n<head>\n" +
    "<meta charset=\"utf-8\" />\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n" +
    "<title>" + escHtml(d.ref) + " · " + escHtml(d.kind) + " — Pulse</title>\n" +
    "<style>\n" +
    "html, body { margin: 0; background: #EDEBE5; }\n" +
    "body { padding: 26px; font-family: Poppins, 'Segoe UI', Arial, sans-serif; }\n" +
    "@page { margin: 16mm; }\n" +
    "@media print { html, body { background: #fff; padding: 0; } }\n" +
    LICENCE_CSS +
    "\n</style>\n</head>\n<body>\n" +
    "<div id=\"licenceDoc\">" + licenceFragment(d) + "</div>\n" +
    "</body>\n</html>\n";
}

function renderLicence() {
  licenceDoc.innerHTML = licenceFragment(readLicenceForm());
}

licenceForm.addEventListener("submit", (event) => event.preventDefault());
licenceForm.addEventListener("input", renderLicence);
licenceForm.addEventListener("change", renderLicence);

function fileSlug(value) {
  return String(value).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "Pulse";
}

function downloadLicence(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function printLicence(html) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Licence print sheet");
  frame.style.cssText =
    "position:fixed; left:-30000px; top:0; width:794px; height:1123px; border:0;";
  document.body.appendChild(frame);

  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();

  const cleanup = () => { if (frame.parentNode) frame.remove(); };
  frame.contentWindow.addEventListener("afterprint", cleanup);

  setTimeout(() => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (error) {
      cleanup();
    }
    setTimeout(cleanup, 120000); /* safety net if afterprint never fires */
  }, 250);
}

document.getElementById("licDownload").addEventListener("click", () => {
  const d = readLicenceForm();
  downloadLicence("Pulse-Licence-" + fileSlug(d.ref) + ".html", licenceFileHTML(d));
});

document.getElementById("licPrint").addEventListener("click", () => {
  printLicence(licenceFileHTML(readLicenceForm()));
});

const LICENCE_DEFAULTS = Array.from(licenceForm.elements)
  .filter((el) => el.id)
  .map((el) => [el.id, el.value]);

document.getElementById("licReset").addEventListener("click", () => {
  LICENCE_DEFAULTS.forEach(([id, value]) => {
    document.getElementById(id).value = value;
  });
  renderLicence();
});

/* Issued certificates download instantly; the pending one tracks. */
document.querySelectorAll(".cert").forEach((card) => {
  const button = card.querySelector(".mini");
  if (!button) return;

  if (card.classList.contains("pending")) {
    button.addEventListener("click", () => setView("deals"));
    return;
  }

  button.addEventListener("click", () => {
    const d = readCertCard(card);
    downloadLicence("Pulse-Certificate-" + fileSlug(d.ref) + ".html", licenceFileHTML(d));
  });
});

renderLicence();


/* =========================================================
   9. SIGN OUT
========================================================= */

document.getElementById("signOutBtn").addEventListener("click", () => {
  localStorage.removeItem("pulse.session");
  window.location.href = "pulse.html";
});


/* =========================================================
   10. BOOT
========================================================= */

animateCounters();
