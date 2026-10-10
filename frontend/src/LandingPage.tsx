import { useState, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { postJson, apiRequest } from "./api";
import type { PulseUser } from "./api";

type AuthChallenge = { challengeId: string; code: string; expiresAt: string; whatsappLink: string };
type AuthStatus = { status: "PENDING" | "EXPIRED" | "LOCKED" | "VERIFIED"; user?: PulseUser };

export default function LandingPage({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  const [signinOpen, setSigninOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("home");
  const [typingText, setTypingText] = useState("How can I help you today?");
  const sceneRef = useRef<HTMLDivElement>(null);
  const [sceneHover, setSceneHover] = useState(false);

  // Auth state
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [status, setStatus] = useState<AuthStatus["status"] | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Typing animation
  useEffect(() => {
    const messages = [
      "How can I help you today?",
      "Draft a deal for exclusive beat rights\u2026",
      "\u20a6200,000 locked \u2014 escrow confirmed.",
      "Proof-of-License issued. All done."
    ];
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % messages.length;
      setTypingText(messages[i]);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Close panel on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setSigninOpen(false); setChallenge(null); setStatus(null); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Mouse parallax on scene
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || !sceneRef.current) return;
    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
    let animFrame: number;
    function onMove(e: MouseEvent) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      targetX = ((e.clientX / w) - 0.5) * 12;
      targetY = ((e.clientY / h) - 0.5) * 8;
    }
    function animate() {
      currentX += (targetX - currentX) * 0.055;
      currentY += (targetY - currentY) * 0.055;
      if (sceneRef.current) {
        sceneRef.current.style.transform = `rotateY(${currentX}deg) rotateX(${-currentY}deg)`;
      }
      animFrame = requestAnimationFrame(animate);
    }
    window.addEventListener("mousemove", onMove);
    animFrame = requestAnimationFrame(animate);
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(animFrame); };
  }, []);

  // Poll for WhatsApp verification
  useEffect(() => {
    if (!challenge || status === "VERIFIED" || status === "EXPIRED" || status === "LOCKED") return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await apiRequest<AuthStatus>(`/auth/challenges/${challenge.challengeId}`);
        if (cancelled) return;
        setStatus(result.status);
        if (result.status === "VERIFIED" && result.user) {
          setSigninOpen(false);
          onEnterDashboard();
        } else if (result.status === "PENDING") {
          timer = window.setTimeout(poll, 2000);
        }
      } catch { if (!cancelled) timer = window.setTimeout(poll, 4000); }
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [challenge, status, onEnterDashboard]);

  async function startAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setAuthError(null);
    try {
      const result = await postJson<AuthChallenge>("/auth/challenges", {
        phone,
        ...(name.trim() ? { displayName: name.trim() } : {})
      });
      setChallenge(result);
      setStatus("PENDING");
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : "Could not start verification.");
    } finally {
      setBusy(false);
    }
  }

  function resetAuth() {
    setChallenge(null);
    setStatus(null);
    setAuthError(null);
  }

  return (
    <main className="page">
      {/* NAVBAR */}
      <header className="navbar">
        <button
          className={`hamburger${mobileNavOpen ? " open" : ""}`}
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          aria-label="Open menu"
        >
          <span /><span />
        </button>

        <a href="#home" className="brand" aria-label="Pulse home">
          <img src="/pulse.svg" alt="Pulse logo" className="brand-logo" width="150" />
          <span className="brand-name">Pulse</span>
        </a>

        <nav className={`nav-links${mobileNavOpen ? " open" : ""}`} aria-label="Primary">
          {["home", "about", "contact"].map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className={activeNav === id ? "active" : ""}
              onClick={() => { setActiveNav(id); setMobileNavOpen(false); }}
            >
              {id === "home" ? "Home" : id === "about" ? "About Us" : "Contact"}
            </a>
          ))}
        </nav>

        <button
          className="signin-button"
          onClick={() => { setSigninOpen(!signinOpen); resetAuth(); }}
          aria-expanded={signinOpen}
        >
          Sign In
        </button>

        {/* Auth panel — WhatsApp phone number only, no email/password */}
        <div className={`signin-panel${signinOpen ? " open" : ""}`} role="dialog" aria-label="Sign in to Pulse">
          <div className="signin-panel-heading">
            <span className="section-kicker">Pulse workspace</span>
            <h2>{challenge ? "Verify your number" : "Sign in or create account"}</h2>
            {!challenge && <p className="signin-sub">Your verified WhatsApp number is your account.</p>}
          </div>

          {challenge ? (
            <>
              <p className="auth-help">Send this code to Pulse on WhatsApp to confirm your number.</p>
              <output className="auth-code-display">{challenge.code}</output>
              <a className="signin-whatsapp-btn" href={challenge.whatsappLink} target="_blank" rel="noreferrer">
                Open WhatsApp
              </a>
              <p className="auth-wait-note">
                <i className="lock-dot" />
                {status === "EXPIRED"
                  ? "This code expired. Start again for a new one."
                  : status === "LOCKED"
                  ? "Too many attempts. Try again later."
                  : "Waiting for WhatsApp verification..."}
              </p>
              {(status === "EXPIRED" || status === "LOCKED") && (
                <button className="link-btn" type="button" onClick={resetAuth}>Start again</button>
              )}
            </>
          ) : (
            <form className="signin-form" onSubmit={(e) => void startAuth(e)}>
              <label htmlFor="signinPhone">Phone number</label>
              <input
                id="signinPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+234 801 234 5678"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <label htmlFor="signinName">
                Your name <small>Optional for existing accounts</small>
              </label>
              <input
                id="signinName"
                type="text"
                autoComplete="name"
                placeholder="Display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" disabled={busy}>
                {busy ? "Starting verification..." : "Continue with WhatsApp"}
              </button>
            </form>
          )}

          {authError && <p className="auth-error" role="alert">{authError}</p>}
          <p className="signin-privacy">
            <span>Secure sign-in. Your phone number is never shown to other users.</span>
          </p>
        </div>

        {/* Backdrop to close panel */}
        {signinOpen && (
          <div
            className="signin-backdrop"
            onClick={() => { setSigninOpen(false); resetAuth(); }}
            aria-hidden="true"
          />
        )}
      </header>

      {/* HERO */}
      <section className="hero" id="home">
        <div className="hero-copy">
          <h1 className="hero-title">
            <span className="white">Conversations</span>
            <span className="muted">that move things forward</span>
          </h1>
          <p className="hero-description">
            Pulse keeps the creative brief, beat rights, and payment in one
            clear conversation, from first idea to final delivery.
          </p>
          <button className="demo-button" onClick={() => { setSigninOpen(true); resetAuth(); }}>
            <span>Get Started</span>
            <span className="demo-arrow">
              <svg viewBox="0 0 34 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M0 5H31" />
                <path d="M27 1L32 5L27 9" />
              </svg>
            </span>
          </button>
        </div>

        <div className="hero-visual">
          <div
            className="scene"
            ref={sceneRef}
            onPointerEnter={() => setSceneHover(true)}
            onPointerLeave={() => setSceneHover(false)}
          >
            <div className="scene-aura" aria-hidden="true" />

            <div className="conversation-panel" aria-hidden="true">
              <div className="panel-heading">
                <span className="bot-dot" />
                <strong>Pulse Bot</strong>
                <span>Deal workspace</span>
              </div>
              <div className="deal-summary">
                <span className="summary-kicker">Exclusive beat license</span>
                <strong>&#8358;200,000</strong>
                <span>&#8358;100,000 deposit &middot; &#8358;100,000 on final stems</span>
                <div className="deal-actions">
                  <span>Approve &amp; Generate Link</span>
                  <span>Edit Deal</span>
                </div>
              </div>
              <div className="panel-line" />
              <div className="panel-status"><span /> payment protected</div>
              <div className="panel-wave"><i /><i /><i /><i /><i /></div>
            </div>

            <div className="human-person person-left" aria-hidden="true">
              <div className="person-label">Joe &middot; Producer <span>09:41</span></div>
              <img className={`character-image${sceneHover ? "" : " active"}`} src="/producer.png" alt="" />
              <img className={`character-image${sceneHover ? " active" : ""}`} src="/producer-touch.png" alt="" />
            </div>

            <div className="human-person person-right" aria-hidden="true">
              <div className="person-label">Tunde &middot; Artist <span>09:42</span></div>
              <img className={`character-image${sceneHover ? "" : " active"}`} src="/buyer.png" alt="" />
              <img className={`character-image${sceneHover ? " active" : ""}`} src="/buyer-touch.png" alt="" />
            </div>

            <div className={`pulse-beam${sceneHover ? " visible" : ""}`} aria-hidden="true">
              <img src="/pulse.png" alt="" />
            </div>

            <div className="message-bubble bubble-left producer-message">
              <small>Producer &middot; Creator</small>
              <span>Draft exclusive beat rights for @tunde at &#8358;200,000. 50% now, 50% on final stems.</span>
            </div>
            <div className="message-bubble bubble-right buyer-message">
              <small>Tunde &middot; Buyer</small>
              <span>Making the 50% deposit of &#8358;100,000 now.</span>
            </div>
            <div className="message-bubble bot-message">
              <small>Pulse Bot</small>
              <span>Payment received. Proof-of-License issued. Final &#8358;100,000 releases when stems arrive.</span>
            </div>
            <div className="conversation-note"><span /> Escrow locked &middot; stems next</div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section className="info-section" id="about">
        <div className="section-copy">
          <img className="section-icon" src="/about.png" alt="" />
          <span className="section-kicker">About Pulse</span>
          <h2>Creative deals, made clear.</h2>
        </div>
        <div className="section-detail">
          <p>Pulse gives producers and artists one trusted place to agree on rights, collect payment, and deliver the final work without losing the conversation.</p>
          <div className="trust-points" aria-label="Pulse trust principles">
            <span><b>01</b> Clear rights</span>
            <span><b>02</b> Protected payment</span>
            <span><b>03</b> Proof of delivery</span>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="info-section contact-section" id="contact">
        <div className="section-copy">
          <img className="section-icon" src="/contact.png" alt="" />
          <span className="section-kicker">Contact</span>
          <h2>Keep the next deal moving.</h2>
        </div>
        <div className="section-detail contact-detail">
          <p>Have a beat, a brief, or a question about a deal? Reach the Pulse team at <a href="mailto:hello@pulse.example">hello@pulse.example</a>.</p>
          <a className="contact-action" href="mailto:hello@pulse.example">Open a conversation <span>&#8599;</span></a>
          <span className="contact-status"><i /> Usually replies within one working day</span>
        </div>
      </section>

      {/* SOCIAL RAIL */}
      <div className="social-links">
        <a href="#" aria-label="Google">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.35 12.27c0-.7-.06-1.37-.18-2H12v3.79h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.18Z"/>
            <path d="M12 21.5c2.63 0 4.84-.87 6.45-2.35l-3.14-2.45c-.87.58-1.98.93-3.31.93-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.75 9.75 0 0 0 12 21.5Z"/>
            <path d="M6.54 13.6a5.85 5.85 0 0 1 0-3.2V7.87H3.3a9.75 9.75 0 0 0 0 8.26l3.24-2.53Z"/>
            <path d="M12 6.38c1.43 0 2.72.49 3.73 1.46l2.8-2.8C16.84 3.45 14.63 2.5 12 2.5a9.75 9.75 0 0 0-8.7 5.37l3.24 2.53C7.31 8.1 9.46 6.38 12 6.38Z"/>
          </svg>
        </a>
        <a href="#" aria-label="Twitter">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.4L6.47 22H3.36l7.24-8.28L2.8 2h6.4l4.42 5.85L18.9 2Zm-1.1 17.8h1.73L8.29 4.1H6.43L17.8 19.8Z"/>
          </svg>
        </a>
        <a href="#" aria-label="Facebook">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.87.24-1.46 1.5-1.46h1.72V4a23 23 0 0 0-2.5-.13c-2.48 0-4.18 1.52-4.18 4.3V10H7.3v3h2.74v8h3.46Z"/>
          </svg>
        </a>
      </div>

      {/* TYPING INDICATOR */}
      <div className="modal-typing" aria-hidden="true">
        <div className="modal-demo-label">Pulse Assistant</div>
        <div className="typing">{typingText}</div>
      </div>
    </main>
  );
}
