/* =========================================================
   0. REDUCED MOTION
========================================================= */

const REDUCED_MOTION = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;


/* =========================================================
   1. MOBILE NAVIGATION
========================================================= */

const menuButton = document.getElementById("menuButton");
const navLinks = document.getElementById("navLinks");

menuButton.addEventListener("click", () => {
  navLinks.classList.toggle("open");
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
  });
});


/* =========================================================
   2. ACTIVE NAV LINK
========================================================= */

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks
      .querySelectorAll("a")
      .forEach((item) => item.classList.remove("active"));

    link.classList.add("active");
  });
});


/* =========================================================
   3. SEARCH PANEL
========================================================= */

const searchButton = document.getElementById("searchButton");
const searchPanel = document.getElementById("searchPanel");
const searchInput = document.getElementById("searchInput");

searchButton.addEventListener("click", (event) => {
  event.stopPropagation();

  searchPanel.classList.toggle("open");

  if (searchPanel.classList.contains("open")) {
    setTimeout(() => searchInput.focus(), 150);
  }
});

document.addEventListener("click", (event) => {
  if (
    !searchPanel.contains(event.target) &&
    !searchButton.contains(event.target)
  ) {
    searchPanel.classList.remove("open");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    searchPanel.classList.remove("open");
    closeModal();
  }
});


/* =========================================================
   4. DEMO MODAL
========================================================= */

const demoButton = document.getElementById("demoButton");
const demoModal = document.getElementById("demoModal");
const modalClose = document.getElementById("modalClose");

function openModal() {
  demoModal.classList.add("open");
  demoModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  demoModal.classList.remove("open");
  demoModal.setAttribute("aria-hidden", "true");
}

demoButton.addEventListener("click", openModal);
modalClose.addEventListener("click", closeModal);

demoModal.addEventListener("click", (event) => {
  if (event.target === demoModal) {
    closeModal();
  }
});


/* =========================================================
   5. TYPING ASSISTANT (modal)
========================================================= */

const typingText = document.getElementById("typingText");

const MESSAGES = [
  "How can I help you today?",
  "Your balance is secure.",
  "Would you like to review your spending?",
  "I found a smarter way to complete that request.",
];

let messageIndex = 0;

setInterval(() => {
  messageIndex = (messageIndex + 1) % MESSAGES.length;

  typingText.style.opacity = "0";

  setTimeout(() => {
    typingText.textContent = MESSAGES[messageIndex];
    typingText.style.opacity = "1";
  }, 300);
}, 3000);


/* =========================================================
   6. MOUSE PARALLAX ON THE 3D SCENE
========================================================= */

const scene = document.getElementById("scene");

if (!REDUCED_MOTION && window.matchMedia("(pointer: fine)").matches) {
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  const sceneScale = window.innerWidth <= 560 ? 0.58 : window.innerWidth <= 760 ? 0.8 : 1;

  window.addEventListener("mousemove", (event) => {
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;

    targetX = x * 8;
    targetY = y * -8;
  });

  (function animateScene() {
    currentX += (targetX - currentX) * 0.055;
    currentY += (targetY - currentY) * 0.055;

    scene.style.transform =
      "rotateX(" + currentY.toFixed(2) + "deg) " +
      "rotateY(" + currentX.toFixed(2) + "deg) " +
      "scale(" + sceneScale + ")";

    requestAnimationFrame(animateScene);
  })();
}


/* =========================================================
   7. ENTRANCE REVEAL
========================================================= */

const revealElements = [
  document.querySelector(".hero-copy"),
  document.querySelector(".hero-visual"),
];

revealElements.forEach((element) => {
  if (!element) return;

  element.style.opacity = "1";
  element.style.transform = "translateY(0)";
});
