import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiRequest, apiUrl, formatDate, formatMoney, postJson } from "./api";
import type { DashboardDeal, DashboardResponse, DealDetail, LicenseListItem, PulseUser } from "./api";

type AuthChallenge = { challengeId: string; code: string; expiresAt: string; whatsappLink: string };
type AuthStatus = { status: "PENDING" | "EXPIRED" | "LOCKED" | "VERIFIED"; user?: PulseUser };
type View = "overview" | "deals" | "vault" | "licenses";

const statuses: Record<DashboardDeal["status"], string> = {
  DRAFT: "Draft", AWAITING_BUYER: "Awaiting buyer", AWAITING_PAYMENT: "Awaiting payment",
  FUNDED: "In escrow", DELIVERED: "Delivered", RELEASED: "Released",
  DISPUTED: "In review", REFUNDED: "Refunded", EXPIRED: "Expired"
};

const viewMeta: Record<View, { title: string; kicker: string; index: string }> = {
  overview: { title: "Overview", kicker: "Workspace / 01", index: "01" },
  deals: { title: "Deals", kicker: "Workspace / 02", index: "02" },
  vault: { title: "Vault", kicker: "Workspace / 03", index: "03" },
  licenses: { title: "Certificates", kicker: "Workspace / 04", index: "04" },
};

export default function Workspace({ onSignOut }: { onSignOut: () => void }) {
  const [user, setUser] = useState<PulseUser | null>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [licenses, setLicenses] = useState<LicenseListItem[]>([]);
  const [view, setView] = useState<View>("overview");
  const [dealCode, setDealCode] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

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
    onSignOut();
  }

  if (authBusy) return <div className="boot-screen"><div className="boot-logo"><img src="/pulse.svg" alt="" width="42" height="42" /></div><p>Loading Pulse workspace</p></div>;
  if (!user) return <AuthScreen onVerified={setUser} apiError={authError} />;
  const account = data?.user ?? user;
  const firstName = account.displayName?.split(/\s+/)[0] ?? "there";
  const greeting = getGreeting();
  const meta = viewMeta[view];

  function switchView(v: View) {
    setView(v);
    setDealCode(null);
    setSidebarOpen(false);
  }

  return (
    <div className="dash-frame">
      {/* SIDEBAR */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <a className="brand" href="/" aria-label="Pulse home" onClick={(e) => { e.preventDefault(); onSignOut(); }}>
          <img src="/pulse.svg" alt="" className="brand-logo" width="38" height="38" />
          <span className="brand-text">
            <strong>Pulse</strong>
            <small>Escrow OS</small>
          </span>
        </a>

        <nav className="side-nav" aria-label="Dashboard">
          <span className="side-label">Workspace</span>
          <SideItem active={view === "overview"} onClick={() => switchView("overview")} index="01" label="Overview" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>} />
          <SideItem active={view === "deals"} onClick={() => switchView("deals")} index="02" label="Deals" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18"/><path d="M4 7h13a3 3 0 0 1 0 6H7a3 3 0 0 0 0 6h13"/></svg>} count={data?.summary.totalDeals} />
          <SideItem active={view === "vault"} onClick={() => switchView("vault")} index="03" label="Vault" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5"/><circle cx="12" cy="12" r="3.4"/><path d="M12 4v2.6M12 17.4V20M4 12h2.6M17.4 12H20"/></svg>} />
          <SideItem active={view === "licenses"} onClick={() => switchView("licenses")} index="04" label="Certificates" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9.5" r="5.5"/><path d="M8.6 14 7 21l5-2.4L17 21l-1.6-7"/></svg>} count={licenses.length > 0 ? licenses.length : undefined} />
        </nav>

        <div className="side-vault">
          <span className="side-label">Escrow status</span>
          <div className="side-vault-body">
            <span className="lock-dot" aria-hidden="true" />
            <div>
              <small>Active value</small>
              <strong>{formatMoney(data?.summary.totalValueKobo ?? "0")}</strong>
            </div>
          </div>
          <div className="side-vault-bar" aria-hidden="true"><i style={{ width: `${data ? Math.min(100, (data.summary.activeDeals / Math.max(1, data.summary.totalDeals)) * 100) : 0}%` }} /></div>
          <p>{data?.summary.activeDeals ?? 0} of {data?.summary.totalDeals ?? 0} deals active.</p>
        </div>

        <div className="side-user">
          <div className="side-user-avatar">{initials(account.displayName ?? account.phone)}</div>
          <div className="side-user-text">
            <strong>{account.displayName ?? account.phone}</strong>
            <small>{account.phone}</small>
          </div>
          <button className="signout" onClick={() => void logout()} type="button" aria-label="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 17l5-5-5-5"/><path d="M20 12H9"/><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"/></svg>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main">
        <header className="topbar">
          <button className="burger" onClick={() => setSidebarOpen(!sidebarOpen)} type="button" aria-label="Toggle menu">
            <span /><span />
          </button>
          <div className="topbar-title">
            <span className="kicker">{meta.kicker}</span>
            <h1>{meta.title}</h1>
          </div>
          <div className="topbar-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
            <input type="search" placeholder="Search deals, people, IDs…" aria-label="Search deals" />
            <kbd>⌘K</kbd>
          </div>
          <span className="topbar-date">{formatDate(new Date().toISOString(), { weekday: "short", day: "numeric", month: "short" })}</span>

          <div className="bell-wrap">
            <button className="bell" onClick={() => setBellOpen(!bellOpen)} type="button" aria-label="Notifications" aria-expanded={bellOpen}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.4 20a2 2 0 0 0 3.2 0"/></svg>
              <b>{data?.deals.filter(d => ["AWAITING_BUYER", "AWAITING_PAYMENT", "DELIVERED"].includes(d.status)).length ?? 0}</b>
            </button>
            <div className={`bell-panel${bellOpen ? " open" : ""}`}>
              <span className="side-label">Notifications</span>
              {data?.deals.slice(0, 3).map(deal => (
                <div className="bell-row" key={deal.id}>
                  <i className={`tick ${deal.status === "FUNDED" ? "green" : deal.status === "RELEASED" ? "burgundy" : "blue"}`} />
                  <div>
                    <strong>{statuses[deal.status]}</strong>
                    <small>{deal.dealCode} · {deal.description}</small>
                  </div>
                  <time>{formatDate(deal.updatedAt, { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
              ))}
            </div>
          </div>

          <button className="new-deal" type="button"><span>+</span> New deal</button>
        </header>

        <div className="content">
          {error && <div className="inline-alert" role="alert"><span>⚠</span>{error}<button type="button" onClick={() => setError(null)} aria-label="Dismiss">×</button></div>}
          {loading && !data ? (
            <div className="loading-line"><span /> Loading workspace data...</div>
          ) : (
            <div className={`view active`}>
              {view === "overview" && <Overview data={data} licenses={licenses} openDeal={setDealCode} setView={switchView} greeting={greeting} firstName={firstName} />}
              {view === "deals" && <DealsPage deals={data?.deals ?? []} openDeal={setDealCode} />}
              {view === "vault" && <VaultView data={data} />}
              {view === "licenses" && <LicensesPage licenses={licenses} />}
            </div>
          )}
        </div>
      </div>

      {dealCode && <DealPanel dealCode={dealCode} close={() => setDealCode(null)} />}
    </div>
  );
}

function SideItem({ active, onClick, index, label, icon, count }: {
  active: boolean; onClick: () => void; index: string; label: string; icon: ReactNode; count?: number;
}) {
  return (
    <button type="button" className={`side-item${active ? " active" : ""}`} onClick={onClick}>
      <i className="side-index">{index}</i>
      {icon}
      <span>{label}</span>
      {count !== undefined && <b className="side-count">{count}</b>}
    </button>
  );
}

function Overview({ data, licenses, openDeal, setView, greeting, firstName }: {
  data: DashboardResponse | null; licenses: LicenseListItem[]; openDeal: (code: string) => void;
  setView: (view: View) => void; greeting: string; firstName: string;
}) {
  const deals = data?.deals ?? [];
  return <>
    <div className="greet-row">
      <div>
        <span className="kicker">{formatDate(new Date().toISOString(), { weekday: "long" })} · Lagos</span>
        <h2 className="greet">{greeting}, <b>{firstName}</b>.</h2>
        <p className="greet-sub">A clear view of the deals and rights you're moving.</p>
      </div>
      <div className="greet-cta">
        <button className="btn ghost" type="button" onClick={() => setView("licenses")}>Draft a licence</button>
        <button className="btn solid" type="button" onClick={() => setView("deals")}>Review deals</button>
      </div>
    </div>

    <div className="kpi-grid">
      <article className="kpi rail-blue">
        <span className="kpi-label">In escrow</span>
        <strong className="kpi-value">{formatMoney(data?.summary.totalValueKobo ?? "0")}</strong>
        <div className="kpi-foot">
          <span className="delta up">▲ Active</span>
          <small>{data?.summary.activeDeals ?? 0} deals</small>
          <svg className="spark" viewBox="0 0 84 24" aria-hidden="true"><polyline points="2,19 14,17 26,18 38,12 50,13 62,8 74,9 82,4"/></svg>
        </div>
      </article>
      <article className="kpi rail-green">
        <span className="kpi-label">Active deals</span>
        <strong className="kpi-value">{data?.summary.activeDeals ?? 0}</strong>
        <div className="kpi-foot">
          <span className="delta up">▲ {data?.summary.activeDeals ?? 0}</span>
          <small>in progress</small>
          <svg className="spark green" viewBox="0 0 84 24" aria-hidden="true"><polyline points="2,20 14,16 26,17 38,15 50,10 62,11 74,6 82,6"/></svg>
        </div>
      </article>
      <article className="kpi rail-burgundy">
        <span className="kpi-label">Completed</span>
        <strong className="kpi-value">{data?.summary.completedDeals ?? 0}</strong>
        <div className="kpi-foot">
          <span className="delta up">▲ Done</span>
          <small>released or refunded</small>
          <svg className="spark burgundy" viewBox="0 0 84 24" aria-hidden="true"><polyline points="2,18 14,19 26,14 38,15 50,9 62,10 74,7 82,3"/></svg>
        </div>
      </article>
      <article className="kpi rail-ink">
        <span className="kpi-label">Total deals</span>
        <strong className="kpi-value">{data?.summary.totalDeals ?? 0}</strong>
        <div className="kpi-foot">
          <span className="delta down">All time</span>
          <small>on record</small>
          <svg className="spark ink" viewBox="0 0 84 24" aria-hidden="true"><polyline points="2,6 14,8 26,7 38,11 50,10 62,14 74,15 82,18"/></svg>
        </div>
      </article>
    </div>

    <div className="split-1-1">
      <article className="panel">
        <header className="panel-head">
          <div>
            <span className="kicker">In motion</span>
            <h3>Recent deals</h3>
          </div>
          <button className="link-btn" type="button" onClick={() => setView("deals")}>All deals →</button>
        </header>
        {deals.length > 0 ? (
          <div className="table-panel">
            <div className="table-head deal-row-mini">
              <span>Deal</span><span>Value</span><span>Status</span><span>Updated</span>
            </div>
            {deals.slice(0, 5).map(deal => (
              <div className="table-row deal-row-mini" key={deal.id} onClick={() => openDeal(deal.dealCode)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openDeal(deal.dealCode); }}>
                <span className="cell-deal-mini"><strong>{deal.description}</strong><small>{deal.dealCode}</small></span>
                <span className="cell-value"><strong>{formatMoney(deal.amountKobo)}</strong></span>
                <span><StatusBadge status={deal.status} /></span>
                <span className="cell-date">{formatDate(deal.updatedAt, { day: "numeric", month: "short" })}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No deals to show" detail="When a deal is created through Pulse, it will appear here." />
        )}
      </article>

      <article className="panel">
        <header className="panel-head">
          <div>
            <span className="kicker">Rights records</span>
            <h3>Latest licenses</h3>
          </div>
          <button className="link-btn" type="button" onClick={() => setView("licenses")}>View all →</button>
        </header>
        {licenses.length > 0 ? (
          <div className="license-mini-list">
            {licenses.slice(0, 3).map(license => (
              <a key={license.certificateNumber} className="license-mini" href={license.verificationUrl} target="_blank" rel="noreferrer">
                <svg className="cert-seal-mini" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="9.5" r="5.5"/><path d="M8.6 14 7 21l5-2.4L17 21l-1.6-7"/></svg>
                <div>
                  <strong>{license.deal.description}</strong>
                  <small>{license.certificateNumber}</small>
                </div>
                <span className="chevron">→</span>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState title="No certificates yet" detail="Issued certificates will be listed here." />
        )}
      </article>
    </div>
  </>;
}

function DealsPage({ deals, openDeal }: { deals: DashboardDeal[]; openDeal: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = deals.filter((deal) => {
    const matchesQuery = `${deal.dealCode} ${deal.description} ${deal.counterparty} ${statuses[deal.status]}`.toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (filter === "all") return true;
    if (filter === "locked") return deal.status === "FUNDED";
    if (filter === "action") return ["AWAITING_BUYER", "AWAITING_PAYMENT", "DELIVERED"].includes(deal.status);
    if (filter === "released") return deal.status === "RELEASED";
    if (filter === "draft") return deal.status === "DRAFT";
    return true;
  });

  const counts = {
    all: deals.length,
    locked: deals.filter(d => d.status === "FUNDED").length,
    action: deals.filter(d => ["AWAITING_BUYER", "AWAITING_PAYMENT", "DELIVERED"].includes(d.status)).length,
    released: deals.filter(d => d.status === "RELEASED").length,
    draft: deals.filter(d => d.status === "DRAFT").length,
  };

  return <>
    <div className="toolbar">
      <div className="filters">
        {Object.entries(counts).map(([key, count]) => (
          <button key={key} className={filter === key ? "on" : ""} onClick={() => setFilter(key)} type="button">
            {key === "all" ? "All" : key === "locked" ? "Escrow locked" : key === "action" ? "Needs action" : key === "released" ? "Released" : "Drafting"}
            <b>{count}</b>
          </button>
        ))}
      </div>
      <span className="toolbar-note">Showing {filtered.length} of {deals.length} deals</span>
    </div>

    <div className="topbar-search deals-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
      <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Search code, work or counterparty" />
    </div>

    <article className="panel table-panel">
      <div className="table-head deal-row">
        <span>Deal</span><span>Counterparty</span><span>Value</span><span>Status</span><span>Role</span><span></span>
      </div>
      {filtered.length > 0 ? filtered.map(deal => (
        <div className="table-row deal-row" key={deal.id} onClick={() => openDeal(deal.dealCode)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openDeal(deal.dealCode); }}>
          <span className="cell-deal">
            <i className={`deal-mark ${deal.status === "FUNDED" ? "green" : deal.status === "RELEASED" ? "burgundy" : "blue"}`}>
              {deal.description.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("")}
            </i>
            <div><strong>{deal.description}</strong><small>{deal.dealCode}</small></div>
          </span>
          <span className="cell-counter">{deal.counterparty}</span>
          <span className="cell-value"><strong>{formatMoney(deal.amountKobo)}</strong></span>
          <span><StatusBadge status={deal.status} /></span>
          <span className="cell-role"><span className={`chip ${deal.role === "BUYER" ? "blue" : "burgundy"}`}>{deal.role === "SELLER" ? "Seller" : "Buyer"}</span></span>
          <span className="cell-act"><button className="mini" type="button">Open</button></span>
        </div>
      )) : (
        <div className="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
          <strong>No deals match that.</strong>
          <p>{query ? "Try a different search term." : "Your deals will appear here."}</p>
        </div>
      )}
    </article>
  </>;
}

function VaultView({ data }: { data: DashboardResponse | null }) {
  const totalValue = data?.summary.totalValueKobo ?? "0";
  const activeDeals = data?.summary.activeDeals ?? 0;
  const completedDeals = data?.summary.completedDeals ?? 0;

  return <>
    <div className="vault-hero">
      <div className="vault-hero-main">
        <span className="kicker light">Total secured on Pulse</span>
        <strong className="vault-total">{formatMoney(totalValue)}</strong>
        <p>Funds held by Payaza escrow across {activeDeals} live deal{activeDeals !== 1 ? "s" : ""}. Nothing moves without both sides signing.</p>
      </div>
      <div className="vault-hero-side">
        <div className="vault-metric"><small>Active deals</small><strong>{activeDeals}</strong></div>
        <div className="vault-metric"><small>Completed</small><strong>{completedDeals}</strong></div>
        <div className="vault-metric"><small>Total deals</small><strong>{data?.summary.totalDeals ?? 0}</strong></div>
      </div>
    </div>

    <div className="split-1-1">
      <article className="panel">
        <header className="panel-head">
          <div>
            <span className="kicker">Deal activity</span>
            <h3>Recent movement</h3>
          </div>
        </header>
        {data?.deals && data.deals.length > 0 ? (
          <ul className="feed">
            {data.deals.slice(0, 5).map(deal => (
              <li key={deal.id}>
                <i className={`tick ${deal.status === "FUNDED" ? "green" : deal.status === "RELEASED" ? "burgundy" : "blue"}`} />
                <div>
                  <strong>{deal.description}</strong>
                  <small>{deal.dealCode} · {statuses[deal.status]}</small>
                </div>
                <time>{formatDate(deal.updatedAt, { day: "numeric", month: "short" })}</time>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="No activity" detail="Deal activity will show here." />}
      </article>

      <article className="panel">
        <header className="panel-head">
          <div>
            <span className="kicker">Vault health</span>
            <h3>Where the money sits</h3>
          </div>
          <span className="chip green">Verified</span>
        </header>
        <div className="seal-row">
          <svg className="seal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9.5" r="5.5"/><path d="M8.6 14 7 21l5-2.4L17 21l-1.6-7"/></svg>
          <div>
            <strong>Legally binding, every release.</strong>
            <small>NDPR-compliant · Payaza settlement · receipts archived 7 years.</small>
          </div>
        </div>
      </article>
    </div>
  </>;
}

function LicensesPage({ licenses }: { licenses: LicenseListItem[] }) {
  return <>
    <div className="cert-intro">
      <span className="kicker">Proof of everything</span>
      <h2>Certificates &amp; receipts</h2>
      <p>Each finished deal issues a tamper-evident certificate — rights, parties, amount, timestamp — signed the moment escrow releases.</p>
    </div>

    {licenses.length > 0 ? (
      <div className="cert-grid">
        {licenses.map(license => (
          <article className="cert" key={license.certificateNumber}>
            <div className="cert-frame">
              <span className="cert-no">{license.deal.dealCode}</span>
              <span className="cert-kind">Proof-of-License</span>
              <h3>{license.deal.description}</h3>
              <p>{license.deal.rightsText}</p>
              <strong className="cert-amount">{formatMoney(license.deal.amountKobo)}</strong>
              <footer>
                <span>Issued {formatDate(license.createdAt)}</span>
                <a className="mini ghost" href={license.pdfUrl} target="_blank" rel="noreferrer">Download</a>
              </footer>
              <svg className="cert-seal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="9.5" r="5.5"/><path d="M8.6 14 7 21l5-2.4L17 21l-1.6-7"/></svg>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <EmptyState title="No licenses yet" detail="Certificates are issued after a buyer releases a delivered deal." />
    )}
  </>;
}

function StatusBadge({ status }: { status: DashboardDeal["status"] }) {
  const chipColor = status === "FUNDED" ? "green" : status === "RELEASED" ? "ink" : ["AWAITING_BUYER", "AWAITING_PAYMENT", "DELIVERED"].includes(status) ? "blue" : status === "DRAFT" ? "muted" : status === "DISPUTED" ? "burgundy" : "muted";
  return <span className={`chip ${chipColor}`}>{statuses[status]}</span>;
}

function DealPanel({ dealCode, close }: { dealCode: string; close: () => void }) {
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDeal(null);
    setError(null);
    apiRequest<{ deal: DealDetail }>(`/api/deals/${encodeURIComponent(dealCode)}`, controller.signal)
      .then((result) => setDeal(result.deal))
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load deal."); });
    return () => controller.abort();
  }, [dealCode]);

  return (
    <div className="modal open" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal-card deal-panel-card">
        <button className="modal-close" onClick={close} type="button" aria-label="Close">×</button>
        <span className="kicker">Deal detail</span>
        <span className="deal-panel-code">{dealCode}</span>

        {error ? (
          <div className="panel-error">⚠ {error}</div>
        ) : !deal ? (
          <div className="loading-line"><span /> Loading deal record...</div>
        ) : (
          <div className="deal-panel-body">
            <StatusBadge status={deal.status} />
            <h2>{deal.description}</h2>
            <strong className="deal-panel-amount">{formatMoney(deal.amountKobo)}</strong>
            <p className="deal-panel-counter">with {deal.role === "SELLER" ? deal.buyer?.displayName ?? "Buyer" : deal.seller.displayName ?? deal.seller.pulseId}</p>

            <div className="detail-block">
              <h3>Agreement</h3>
              <p>{deal.rightsText}</p>
              <div className="detail-pairs">
                <span>Created</span><b>{formatDate(deal.createdAt)}</b>
                <span>Payment</span><b>{deal.payments[0]?.status ?? "Not recorded"}</b>
                <span>Payout</span><b>{deal.payout?.status ?? "Not released"}</b>
              </div>
            </div>

            {deal.license && (
              <div className="detail-license">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="9.5" r="5.5"/><path d="M8.6 14 7 21l5-2.4L17 21l-1.6-7"/></svg>
                <div>
                  <strong>License certificate issued</strong>
                  <small>{deal.license.certificateNumber}</small>
                </div>
                <a href={deal.license.verificationUrl} target="_blank" rel="noreferrer">↗</a>
              </div>
            )}

            {deal.events.length > 0 && (
              <div className="detail-block">
                <h3>Timeline <small>{deal.events.length} events</small></h3>
                <ul className="feed">
                  {deal.events.map(event => (
                    <li key={event.id}>
                      <i className="tick blue" />
                      <div>
                        <strong>{event.toStatus ? statuses[event.toStatus] : event.type.replaceAll("_", " ").toLowerCase()}</strong>
                        <small>{formatDate(event.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {deal.ledgerEntries.length > 0 && (
              <div className="detail-block">
                <h3>Ledger <small>{deal.ledgerEntries.length} entries</small></h3>
                {deal.ledgerEntries.map(entry => (
                  <div className="ledger-row" key={entry.id}>
                    <i className={`tick ${entry.direction === "CREDIT" ? "green" : "blue"}`} />
                    <div>
                      <strong>{entry.reason}</strong>
                      <small>{entry.account} · {formatDate(entry.createdAt, { day: "numeric", month: "short" })}</small>
                    </div>
                    <b className={entry.direction === "CREDIT" ? "positive" : ""}>{entry.direction === "CREDIT" ? "+" : "−"}{formatMoney(entry.amountKobo)}</b>
                  </div>
                ))}
              </div>
            )}

            {deal.messages.length > 0 && (
              <div className="detail-block">
                <h3>Messages</h3>
                <div className="thread">
                  {deal.messages.slice(-6).map(msg => (
                    <div className={`msg ${msg.direction === "OUTBOUND" ? "out" : "in"}`} key={msg.id}>
                      <p>{msg.body}</p>
                      <time>{formatDate(msg.sentAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deal.status === "DELIVERED" && deal.role === "BUYER" && (
              <div className="panel-actions">
                <button className="btn solid green-btn" type="button" onClick={() => setActionNote(`Release request: send RELEASE ${dealCode} to Pulse on WhatsApp.`)}>Release funds</button>
                <button className="btn ghost" type="button" onClick={() => setActionNote(`Issue report: send ISSUE ${dealCode} to Pulse on WhatsApp.`)}>Raise an issue</button>
                {actionNote && <p className="action-hint"><strong>Handled in WhatsApp.</strong> {actionNote}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
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

  return (
    <div className="auth-shell">
      <a className="brand auth-brand" href="/">
        <img src="/pulse.svg" alt="" className="brand-logo" width="38" height="38" />
        <span className="brand-text"><strong>Pulse</strong><small>Escrow OS</small></span>
      </a>

      <div className="auth-layout">
        <section className="auth-intro">
          <span className="kicker">WhatsApp Escrow &amp; Digital Rights</span>
          <h1>Every deal.<br /><em>In good hands.</em></h1>
          <p>Keep payment, delivery and license records together, from first agreement to final release.</p>
          <div className="auth-proof">
            <span>✓ Phone-verified accounts</span>
            <span>✓ Tamper-evident licenses</span>
          </div>
        </section>

        <section className="auth-box">
          {challenge ? <>
            <span className="kicker">One more step</span>
            <h2>Verify your number</h2>
            <p className="auth-help">Send this six-digit code to Pulse on WhatsApp.</p>
            <output className="auth-code">{challenge.code}</output>
            <a className="btn solid auth-whatsapp" href={challenge.whatsappLink} target="_blank" rel="noreferrer">Open WhatsApp →</a>
            <p className="auth-wait">
              <i className="lock-dot" />
              {status === "EXPIRED" ? "This code expired. Start again for a new one." : status === "LOCKED" ? "Too many attempts. Start again for a new code." : "Waiting for WhatsApp verification..."}
            </p>
            {(status === "EXPIRED" || status === "LOCKED") && <button className="link-btn" type="button" onClick={() => { setChallenge(null); setStatus(null); }}>Start again</button>}
          </> : <>
            <span className="kicker">Pulse Workspace</span>
            <h2>Sign in or create account</h2>
            <p className="auth-help">Your verified WhatsApp number is your account.</p>
            <form className="auth-form" onSubmit={(e) => void start(e)}>
              <div className="field">
                <label>Phone number</label>
                <input autoComplete="tel" inputMode="tel" placeholder="+234 801 234 5678" required value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label>Your name <small>Optional for existing accounts</small></label>
                <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <button className="btn solid" type="submit" disabled={busy}>{busy ? "Starting verification..." : "Continue with WhatsApp →"}</button>
            </form>
          </>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="auth-privacy">
            <span>🔒 Secure sign-in. Your phone number is never shown to other users.</span>
          </div>
        </section>
      </div>

      <footer className="auth-footer">Pulse · Digital Deals, Documented</footer>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty"><strong>{title}</strong><p>{detail}</p></div>;
}

function initials(value: string): string {
  return value.split(/[\s@+-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
