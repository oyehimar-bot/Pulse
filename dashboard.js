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
  chats: { kicker: "Workspace / 03", title: "Chats" },
  vault: { kicker: "Workspace / 04", title: "Vault" },
  certificates: { kicker: "Workspace / 05", title: "Certificates" },
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
   6. CHATS — conversation switching + sending
========================================================= */

const CHAT_DATA = {
  joe: {
    name: "Joe · Producer",
    meta: "PLS-2847 · beat licence · online",
    chip: "Escrow locked",
    chipClass: "green",
    avatar: "producer.png",
    messages: `
      <span class="chat-date">Today</span>
      <div class="msg in">
        <p>Draft exclusive beat rights for @tunde at <b>₦200,000</b>. 50% now, 50% on final stems.</p>
        <time>09:41</time>
      </div>
      <div class="sys blue">Deal #PLS-2847 created · Payaza escrow</div>
      <div class="msg out">
        <p>Making the 50% deposit of ₦100,000 now.</p>
        <time>09:42 <svg viewBox="0 0 18 12" aria-label="read"><path d="M1 6.5 4 9.5 10.5 2.5"/><path d="M6.5 9.5 12.5 2.5"/></svg></time>
      </div>
      <div class="sys green">₦100,000 received · Escrow locked</div>
      <div class="msg bot">
        <p>Payment received. Proof-of-License issued. Final ₦100,000 releases when stems arrive.</p>
        <time>09:43</time>
      </div>`,
  },
  amara: {
    name: "Amara · Baker",
    meta: "PLS-2851 · recipe box film · typing…",
    chip: "Needs action",
    chipClass: "blue",
    avatar: "buyer-touch.png",
    messages: `
      <span class="chat-date">Today</span>
      <div class="msg in">
        <p>₦142,000 works if delivery is in two weeks, not one.</p>
        <time>09:41</time>
      </div>
      <div class="sys blue">Counter-offer received · tap to review terms</div>
      <div class="msg out">
        <p>Two weeks is fine — but the recipe cards stay included.</p>
        <time>09:44 <svg viewBox="0 0 18 12" aria-label="read"><path d="M1 6.5 4 9.5 10.5 2.5"/><path d="M6.5 9.5 12.5 2.5"/></svg></time>
      </div>`,
  },
  zainab: {
    name: "Zainab · Photographer",
    meta: "PLS-2844 · album shoot · 40 images",
    chip: "Escrow locked",
    chipClass: "green",
    avatar: "producer-touch.png",
    messages: `
      <span class="chat-date">Today</span>
      <div class="msg in">
        <p>Saturday works, golden hour from 5pm. Studio or rooftop?</p>
        <time>08:52</time>
      </div>
      <div class="msg out">
        <p>Rooftop. I'll send the address and mood board tonight.</p>
        <time>08:55 <svg viewBox="0 0 18 12" aria-label="read"><path d="M1 6.5 4 9.5 10.5 2.5"/><path d="M6.5 9.5 12.5 2.5"/></svg></time>
      </div>
      <div class="sys green">₦320,000 held in escrow · milestone 1 of 3</div>`,
  },
  ife: {
    name: "Ife · Writer",
    meta: "PLS-2853 · 30s spot · scope open",
    chip: "Needs action",
    chipClass: "blue",
    avatar: "buyer.png",
    messages: `
      <span class="chat-date">Today</span>
      <div class="msg in">
        <p>Is 3 revisions included, or do I pay extra for a fourth?</p>
        <time>08:31</time>
      </div>
      <div class="msg bot">
        <p>Pulse suggestion: cap at 3 revisions, then ₦12,000 per extra pass. Lock it into the deal terms?</p>
        <time>08:32</time>
      </div>`,
  },
  dax: {
    name: "Dax · Label",
    meta: "New thread · producer tags · offline",
    chip: "Drafting",
    chipClass: "muted",
    avatar: "contact.png",
    messages: `
      <span class="chat-date">Yesterday</span>
      <div class="msg in">
        <p>Send pricing for 5 tags. We need them by the 20th.</p>
        <time>17:04</time>
      </div>
      <div class="msg out">
        <p>₦180,000 for 5, exclusivity included. Drafting the deal now.</p>
        <time>17:10 <svg viewBox="0 0 18 12" aria-label="read"><path d="M1 6.5 4 9.5 10.5 2.5"/><path d="M6.5 9.5 12.5 2.5"/></svg></time>
      </div>`,
  },
};

const chatScroll = document.getElementById("chatScroll");
const chatList = document.getElementById("chatList");
const roomName = document.getElementById("roomName");
const roomMeta = document.getElementById("roomMeta");
const roomAvatar = document.getElementById("roomAvatar");
const roomChip = document.getElementById("roomChip");
const chatInput = document.getElementById("chatInput");

let activeChat = "joe";

function loadChat(key) {
  const data = CHAT_DATA[key];
  if (!data) return;

  activeChat = key;

  roomName.textContent = data.name;
  roomMeta.textContent = data.meta;
  roomAvatar.src = data.avatar;
  roomChip.textContent = data.chip;
  roomChip.className = "chip " + data.chipClass;
  chatInput.placeholder = "Message " + data.name.split(" · ")[0] + "…";

  chatScroll.innerHTML = data.messages;
  chatScroll.scrollTop = chatScroll.scrollHeight;

  /* clear the unread badge for this thread */
  const listItem = chatList.querySelector('[data-chat="' + key + '"]');
  if (listItem) {
    const badge = listItem.querySelector(".badge");
    if (badge) badge.remove();
    listItem.classList.add("on");
  }

  updateUnreadCount();
}

function updateUnreadCount() {
  const remaining = chatList.querySelectorAll(".badge").length;
  const navUnread = document.getElementById("navUnread");

  navUnread.textContent = remaining;
  navUnread.style.display = remaining ? "" : "none";
}

chatList.addEventListener("click", (event) => {
  const item = event.target.closest("li[data-chat]");
  if (!item) return;

  chatList
    .querySelectorAll("li")
    .forEach((row) => row.classList.toggle("on", row === item));

  loadChat(item.dataset.chat);
});

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  const time = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const bubble = document.createElement("div");
  bubble.className = "msg out";
  bubble.innerHTML =
    "<p></p><time>" +
    time +
    ' <svg viewBox="0 0 18 12" aria-label="delivered"><path d="M1 6.5 4 9.5 10.5 2.5"/><path d="M6.5 9.5 12.5 2.5"/></svg></time>';
  bubble.querySelector("p").textContent = text;

  chatScroll.appendChild(bubble);
  chatScroll.scrollTop = chatScroll.scrollHeight;
  chatInput.value = "";
}

document.getElementById("chatSend").addEventListener("click", sendMessage);

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendMessage();
});

loadChat("joe");


/* =========================================================
   7. BELL DROPDOWN
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
   8. NEW DEAL MODAL
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
