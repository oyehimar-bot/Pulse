import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownLeft, ArrowUpRight, BadgeCheck, Banknote, Check, ChevronRight,
  CircleAlert, FileCheck2, FileText, LayoutDashboard, LogOut, MessageSquareText,
  Search, ShieldCheck, X
} from "lucide-react";
import { apiRequest, apiUrl, formatDate, formatMoney, postJson } from "./api";
import type { DashboardDeal, DashboardResponse, DealDetail, LicenseListItem, PulseUser } from "./api";

type AuthChallenge = { challengeId: string; code: string; expiresAt: string; whatsappLink: string };
type AuthStatus = { status: "PENDING" | "EXPIRED" | "LOCKED" | "VERIFIED"; user?: PulseUser };
type View = "overview" | "deals" | "licenses";

const statuses: Record<DashboardDeal["status"], string> = {
  DRAFT: "Draft", AWAITING_BUYER: "Awaiting buyer", AWAITING_PAYMENT: "Awaiting payment",
  FUNDED: "In escrow", DELIVERED: "Delivered", RELEASED: "Released",
  DISPUTED: "In review", REFUNDED: "Refunded", EXPIRED: "Expired"
};

export default function Workspace() {
  const [user, setUser] = useState<PulseUser | null>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [licenses, setLicenses] = useState<LicenseListItem[]>([]);
  const [view, setView] = useState<View>("overview");
  const [dealCode, setDealCode] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ user: PulseUser }>("/auth/me", controller.signal)
      .then((result) => setUser(result.user))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : "Pulse API is unavailable.";
        if (!message.includes("Authentication required")) {
          setAuthError(/failed to fetch|networkerror|fetch failed/i.test(message)
            ? "Pulse API is unreachable. Start the API and check that PUBLIC_BASE_URL is a valid URL."
            : message);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setAuthBusy(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!user) { setData(null); setLicenses([]); return; }
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      apiRequest<DashboardResponse>("/api/dashboard", controller.signal),
      apiRequest<{ licenses: LicenseListItem[] }>("/api/licenses", controller.signal)
    ]).then(([dashboard, licenseResult]) => {
      setData(dashboard);
      setLicenses(licenseResult.licenses);
      setError(null);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load workspace.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user]);

  async function logout() {
    await fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "include" });
    setUser(null);
    setDealCode(null);
  }

  if (authBusy) return <div className="boot-screen"><span className="brand-mark">P</span><p>Loading Pulse workspace</p></div>;
  if (!user) return <AuthScreen onVerified={setUser} apiError={authError} />;
  const account = data?.user ?? user;
  const heading = view === "overview" ? "Overview" : view === "deals" ? "Deals" : "Licenses";

  return <div className="workspace-shell">
    <aside className="sidebar">
      <a className="brand-lockup" href="/"><span className="brand-mark">P</span><span>pulse<span className="brand-period">.</span></span></a>
      <div className="workspace-switcher"><span className="workspace-avatar">{initials(account.displayName ?? account.pulseId)}</span><span><b>{account.displayName ?? "Personal workspace"}</b><small>{account.pulseId}</small></span><ChevronRight size={15} /></div>
      <p className="nav-label">WORKSPACE</p>
      <nav className="main-nav" aria-label="Workspace navigation">
        <NavButton active={view === "overview"} onClick={() => { setView("overview"); setDealCode(null); }} icon={<LayoutDashboard size={17} />}>Overview</NavButton>
        <NavButton active={view === "deals"} onClick={() => { setView("deals"); setDealCode(null); }} icon={<FileText size={17} />}>Deals <span className="nav-count">{data?.summary.totalDeals ?? 0}</span></NavButton>
        <NavButton active={view === "licenses"} onClick={() => { setView("licenses"); setDealCode(null); }} icon={<BadgeCheck size={17} />}>Licenses <span className="nav-count">{licenses.length}</span></NavButton>
      </nav>
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={17} /><span>Phone verified<br /><b>Pulse account protected</b></span></div><button className="profile-button" type="button" onClick={() => void logout()}><span className="profile-avatar">{initials(account.displayName ?? account.phone)}</span><span className="profile-copy"><b>{account.displayName ?? account.phone}</b><small>{account.phone}</small></span><LogOut size={16} /><span className="sr-only">Log out</span></button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumbs"><span>Pulse</span><ChevronRight size={14} /><b>{heading}</b></div><div className="topbar-meta"><span className="live-indicator"><i /> All systems operational</span><span className="topbar-date">{formatDate(new Date().toISOString(), { weekday: "short", day: "numeric", month: "short" })}</span></div></header>
      <div className="page-body">
        {error && <div className="inline-alert" role="alert"><CircleAlert size={16} />{error}<button type="button" onClick={() => setError(null)} aria-label="Dismiss"><X size={15} /></button></div>}
        {loading && !data ? <div className="loading-line"><span /> Loading workspace data...</div> : view === "overview" ? <Overview data={data} licenses={licenses} openDeal={setDealCode} setView={setView} /> : view === "deals" ? <DealsPage deals={data?.deals ?? []} openDeal={setDealCode} /> : <LicensesPage licenses={licenses} />}
      </div>
    </main>
    {dealCode && <DealPanel dealCode={dealCode} close={() => setDealCode(null)} />}
  </div>;
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return <button type="button" className={`nav-button${active ? " active" : ""}`} onClick={onClick}>{icon}<span>{children}</span></button>;
}

function Overview({ data, licenses, openDeal, setView }: { data: DashboardResponse | null; licenses: LicenseListItem[]; openDeal: (code: string) => void; setView: (view: View) => void }) {
  const deals = data?.deals ?? [];
  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR CONTROL ROOM</p><h1>Good work, {data?.user.displayName?.split(/\s+/)[0] ?? "there"}.</h1><p className="heading-subtitle">A clear view of the deals and rights you’re moving.</p></div><div className="account-chip"><span className="account-dot" /> Verified account</div></div>
    <section className="metric-grid" aria-label="Workspace summary">
      <Metric label="Active deals" value={String(data?.summary.activeDeals ?? 0)} detail="In progress" icon={<FileText size={17} />} tone="green" />
      <Metric label="Completed" value={String(data?.summary.completedDeals ?? 0)} detail="Released or refunded" icon={<Check size={17} />} tone="blue" />
      <Metric label="Deal value" value={formatMoney(data?.summary.totalValueKobo ?? "0")} detail={`${data?.summary.totalDeals ?? 0} total deals`} icon={<Banknote size={17} />} tone="coral" />
      <Metric label="Certificates" value={String(licenses.length)} detail="Verified rights records" icon={<BadgeCheck size={17} />} tone="gold" />
    </section>
    <section className="content-section overview-lower"><div className="section-main"><div className="section-heading"><div><p className="eyebrow">IN MOTION</p><h2>Recent deals</h2></div><button className="text-button" onClick={() => setView("deals")} type="button">All deals <ArrowUpRight size={15} /></button></div>{deals.length ? <div className="deal-table-wrap"><DealTable deals={deals.slice(0, 5)} openDeal={openDeal} compact /></div> : <EmptyState icon={<FileText size={21} />} title="No deals to show" detail="When a deal is created through Pulse, it will appear here." />}</div>
      <aside className="section-aside"><div className="section-heading"><div><p className="eyebrow">RIGHTS RECORDS</p><h2>Latest licenses</h2></div><button className="icon-button" type="button" aria-label="View all licenses" onClick={() => setView("licenses")}><ArrowUpRight size={17} /></button></div>{licenses.length ? <div className="license-mini-list">{licenses.slice(0, 3).map((license) => <a key={license.certificateNumber} className="license-mini" href={license.verificationUrl} target="_blank" rel="noreferrer"><span className="license-icon"><FileCheck2 size={17} /></span><span className="license-mini-copy"><b>{license.deal.description}</b><small>{license.certificateNumber}</small></span><ChevronRight size={15} /></a>)}</div> : <EmptyState icon={<BadgeCheck size={20} />} title="No certificates yet" detail="Issued certificates will be listed here." />}</aside></section>
    <div className="page-footnote"><ShieldCheck size={14} /> Deal events and payment records are securely associated with your verified account.</div>
  </>;
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: ReactNode; tone: string }) {
  return <article className="metric"><div className="metric-top"><span>{label}</span><i className={`metric-icon ${tone}`}>{icon}</i></div><strong>{value}</strong><small>{detail}</small></article>;
}

function DealsPage({ deals, openDeal }: { deals: DashboardDeal[]; openDeal: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = deals.filter((deal) => `${deal.dealCode} ${deal.description} ${deal.counterparty} ${statuses[deal.status]}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="page-heading"><div><p className="eyebrow">DEAL REGISTER</p><h1>Deals</h1><p className="heading-subtitle">Track the agreement, payment and release status.</p></div><span className="record-total">{deals.length} records</span></div><div className="toolbar"><label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, work or counterparty" /></label><span className="toolbar-caption">Sorted by recent activity</span></div>{filtered.length ? <div className="deal-table-wrap full-table"><DealTable deals={filtered} openDeal={openDeal} /></div> : <EmptyState icon={<Search size={21} />} title="No matching deals" detail={query ? "Try another search term." : "Your deals will appear here."} />}</>;
}

function DealTable({ deals, openDeal, compact = false }: { deals: DashboardDeal[]; openDeal: (code: string) => void; compact?: boolean }) {
  return <table className="deal-table"><thead><tr><th>DEAL</th><th>COUNTERPARTY</th><th>VALUE</th><th>STATUS</th><th>{compact ? "UPDATED" : "ROLE"}</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{deals.map((deal) => <tr key={deal.id} onClick={() => openDeal(deal.dealCode)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") openDeal(deal.dealCode); }}><td><b>{deal.description}</b><small className="mono">{deal.dealCode}</small></td><td>{deal.counterparty}</td><td className="money-cell">{formatMoney(deal.amountKobo)}</td><td><StatusBadge status={deal.status} /></td><td>{compact ? formatDate(deal.updatedAt, { day: "numeric", month: "short" }) : <span className={`role-label ${deal.role.toLowerCase()}`}>{deal.role === "SELLER" ? "Seller" : "Buyer"}</span>}</td><td><ChevronRight size={16} className="row-chevron" /></td></tr>)}</tbody></table>;
}

function StatusBadge({ status }: { status: DashboardDeal["status"] }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}><i />{statuses[status]}</span>;
}

function LicensesPage({ licenses }: { licenses: LicenseListItem[] }) {
  return <><div className="page-heading"><div><p className="eyebrow">RIGHTS REGISTRY</p><h1>Licenses</h1><p className="heading-subtitle">Issued certificates and their public integrity records.</p></div><span className="record-total">{licenses.length} certificates</span></div>{licenses.length ? <div className="license-grid">{licenses.map((license) => <article className="license-card" key={license.certificateNumber}><div className="license-card-top"><span className="license-icon large"><FileCheck2 size={20} /></span><span className="verified-tag"><BadgeCheck size={14} /> SHA-256 verified</span></div><p className="eyebrow">{license.deal.dealCode}</p><h2>{license.deal.description}</h2><p className="license-rights">{license.deal.rightsText}</p><div className="license-meta"><span>ISSUED</span><b>{formatDate(license.createdAt)}</b><span>VALUE</span><b>{formatMoney(license.deal.amountKobo)}</b><span>CERTIFICATE</span><b className="mono">{license.certificateNumber}</b></div><div className="license-actions"><a href={license.verificationUrl} target="_blank" rel="noreferrer"><ShieldCheck size={15} /> Verify</a><a href={license.pdfUrl} target="_blank" rel="noreferrer"><FileText size={15} /> Open PDF <ArrowUpRight size={14} /></a></div></article>)}</div> : <EmptyState icon={<BadgeCheck size={21} />} title="No licenses yet" detail="Certificates are issued after a buyer releases a delivered deal." />}</>;
}

function DealPanel({ dealCode, close }: { dealCode: string; close: () => void }) {
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setDeal(null);
    apiRequest<{ deal: DealDetail }>(`/api/deals/${encodeURIComponent(dealCode)}`, controller.signal).then((result) => setDeal(result.deal)).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load deal."); });
    return () => controller.abort();
  }, [dealCode]);
  return <div className="panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="deal-panel" aria-label={`Deal ${dealCode}`}><header className="panel-header"><div><p className="eyebrow">DEAL DETAIL</p><span className="mono">{dealCode}</span></div><button className="icon-button" onClick={close} type="button" aria-label="Close deal details"><X size={19} /></button></header>{error ? <div className="panel-error"><CircleAlert size={17} />{error}</div> : !deal ? <div className="panel-loading"><span /> Loading deal record...</div> : <div className="panel-scroll"><div className="panel-title"><StatusBadge status={deal.status} /><h2>{deal.description}</h2><strong>{formatMoney(deal.amountKobo)}</strong><p>with {deal.role === "SELLER" ? deal.buyer?.displayName ?? "Buyer" : deal.seller.displayName ?? deal.seller.pulseId}</p></div><DetailBlock title="Agreement"><p>{deal.rightsText}</p><div className="detail-pairs"><span>Created</span><b>{formatDate(deal.createdAt)}</b><span>Payment</span><b>{deal.payments[0]?.status ?? "Not recorded"}</b><span>Payout</span><b>{deal.payout?.status ?? "Not released"}</b></div></DetailBlock>{deal.license && <div className="detail-license"><BadgeCheck size={18} /><span><b>License certificate issued</b><small>{deal.license.certificateNumber}</small></span><a href={deal.license.verificationUrl} target="_blank" rel="noreferrer" aria-label="Verify license"><ArrowUpRight size={16} /></a></div>}<DetailBlock title="Timeline" meta={`${deal.events.length} events`}>{deal.events.length ? <ol className="timeline">{deal.events.map((event) => <li key={event.id}><i /><div><b>{event.toStatus ? statuses[event.toStatus] : event.type.replaceAll("_", " ").toLowerCase()}</b><small>{event.type.replaceAll("_", " ")} · {formatDate(event.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div></li>)}</ol> : <p className="muted-copy">No activity recorded.</p>}</DetailBlock><DetailBlock title="Ledger" meta={`${deal.ledgerEntries.length} entries`}>{deal.ledgerEntries.length ? <div className="ledger-list">{deal.ledgerEntries.map((entry) => <div className="ledger-row" key={entry.id}><span className={`ledger-direction ${entry.direction.toLowerCase()}`}>{entry.direction === "CREDIT" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}</span><span><b>{entry.reason}</b><small>{entry.account} · {formatDate(entry.createdAt, { day: "numeric", month: "short" })}</small></span><strong className={entry.direction === "CREDIT" ? "positive" : ""}>{entry.direction === "CREDIT" ? "+" : "−"}{formatMoney(entry.amountKobo)}</strong></div>)}</div> : <p className="muted-copy">No ledger entries recorded.</p>}</DetailBlock><DetailBlock title="Messages" meta={<MessageSquareText size={15} />}>{deal.messages.length ? <div className="message-list">{deal.messages.slice(-6).map((message) => <div className={`message-row ${message.direction.toLowerCase()}`} key={message.id}><small>{message.direction} · {formatDate(message.sentAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small><p>{message.body}</p>{message.deliveryError && <span className="message-error">{message.deliveryError}</span>}</div>)}</div> : <p className="muted-copy">No messages linked to this deal.</p>}</DetailBlock></div>}</aside></div>;
}

function DetailBlock({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return <div className="detail-block"><div className="detail-head"><h3>{title}</h3>{meta && <span>{meta}</span>}</div>{children}</div>;
}

function AuthScreen({ onVerified, apiError }: { onVerified: (user: PulseUser) => void; apiError: string | null }) {
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [status, setStatus] = useState<AuthStatus["status"] | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(apiError);
  useEffect(() => {
    if (!challenge || status === "VERIFIED" || status === "EXPIRED" || status === "LOCKED") return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await apiRequest<AuthStatus>(`/auth/challenges/${challenge.challengeId}`);
        if (cancelled) return;
        setStatus(result.status);
        if (result.status === "VERIFIED" && result.user) onVerified(result.user);
        else if (result.status === "PENDING") timer = window.setTimeout(poll, 2000);
      } catch { if (!cancelled) timer = window.setTimeout(poll, 4000); }
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [challenge, status, onVerified]);
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try { setChallenge(await postJson<AuthChallenge>("/auth/challenges", { phone, ...(name.trim() ? { displayName: name.trim() } : {}) })); setStatus("PENDING"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start verification."); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><a className="brand-lockup verify-brand" href="/"><span className="brand-mark">P</span><span>pulse<span className="brand-period">.</span></span></a><div className="auth-layout"><section className="auth-intro"><p className="eyebrow">WHATSAPP ESCROW & DIGITAL RIGHTS</p><h1>Every deal.<br /><em>In good hands.</em></h1><p>Keep payment, delivery and license records together, from first agreement to final release.</p><div className="auth-proof"><span><ShieldCheck size={16} /> Phone-verified accounts</span><span><FileCheck2 size={16} /> Tamper-evident licenses</span></div></section><section className="auth-box">{challenge ? <><p className="eyebrow">ONE MORE STEP</p><h2>Verify your number</h2><p className="auth-help">Send this six-digit code to Pulse on WhatsApp.</p><output className="auth-code">{challenge.code}</output><a className="primary-link auth-whatsapp" href={challenge.whatsappLink} target="_blank" rel="noreferrer">Open WhatsApp <ArrowUpRight size={15} /></a><p className="auth-wait" aria-live="polite">{status === "EXPIRED" ? "This code expired. Start again for a new one." : status === "LOCKED" ? "Too many attempts. Start again for a new code." : "Waiting for WhatsApp verification..."}</p>{(status === "EXPIRED" || status === "LOCKED") && <button className="text-button" type="button" onClick={() => { setChallenge(null); setStatus(null); }}>Start again</button>}</> : <><p className="eyebrow">PULSE WORKSPACE</p><h2>Sign in or create account</h2><p className="auth-help">Your verified WhatsApp number is your account.</p><form onSubmit={(event) => void start(event)}><label>Phone number<input autoComplete="tel" inputMode="tel" placeholder="+234 801 234 5678" required value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>Your name <span>Optional for existing accounts</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label><button className="primary-button" type="submit" disabled={busy}>{busy ? "Starting verification..." : "Continue with WhatsApp"}<ArrowUpRight size={16} /></button></form></>}{error && <p role="alert" className="auth-error">{error}</p>}<div className="auth-privacy"><ShieldCheck size={15} /><span>Secure sign-in. Your phone number is never shown to other users.</span></div></section></div><footer className="auth-footer">PULSE · DIGITAL DEALS, DOCUMENTED</footer></main>;
}

function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="empty-state"><span>{icon}</span><b>{title}</b><p>{detail}</p></div>;
}

function initials(value: string): string {
  return value.split(/[\s@+-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}
