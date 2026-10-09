import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type User = {
  id: string;
  displayName: string | null;
  phone: string;
  pulseId: string;
};

type AuthChallenge = {
  challengeId: string;
  code: string;
  expiresAt: string;
  whatsappLink: string;
};

type AuthStatus = {
  status: "PENDING" | "EXPIRED" | "LOCKED" | "VERIFIED";
  user?: User;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed with status ${response.status}.`);
  return body;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [status, setStatus] = useState<AuthStatus["status"] | null>(null);
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBaseUrl}/auth/me`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return null;
        return readResponse<{ user: User }>(response);
      })
      .then((result) => setUser(result?.user ?? null))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "API unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!challenge || status === "VERIFIED" || status === "EXPIRED" || status === "LOCKED") return;

    let cancelled = false;
    let timeoutId: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/challenges/${challenge.challengeId}`, {
          credentials: "include"
        });
        const result = await readResponse<AuthStatus>(response);
        if (cancelled) return;
        setStatus(result.status);
        if (result.status === "VERIFIED" && result.user) setUser(result.user);
        if (result.status === "PENDING") timeoutId = window.setTimeout(poll, 2000);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not check verification status.");
          timeoutId = window.setTimeout(poll, 4000);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [challenge, status]);

  async function startVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {})
        })
      });
      const result = await readResponse<AuthChallenge>(response);
      setChallenge(result);
      setStatus("PENDING");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start verification.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch(`${apiBaseUrl}/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
    setChallenge(null);
    setStatus(null);
  }

  if (busy && !challenge && !user) return <main><h1>Pulse</h1><p>Connecting to Pulse...</p></main>;

  return (
    <main>
      <h1>Pulse</h1>
      {user ? (
        <section aria-labelledby="account-heading">
          <h2 id="account-heading">Account verified</h2>
          <p>{user.displayName ?? user.phone}</p>
          <p>{user.pulseId}</p>
          <button type="button" onClick={() => void logout()}>Log out</button>
        </section>
      ) : challenge ? (
        <section aria-labelledby="verification-heading">
          <h2 id="verification-heading">Verify your phone</h2>
          <p>Send this code to the Pulse WhatsApp number:</p>
          <output aria-label="One-time verification code">{challenge.code}</output>
          <p><a href={challenge.whatsappLink} target="_blank" rel="noreferrer">Open WhatsApp with code</a></p>
          <p aria-live="polite">
            {status === "EXPIRED" ? "Code expired. Start again to get a new code." : status === "LOCKED" ? "Too many incorrect codes. Start again to get a new code." : "Waiting for your WhatsApp message..."}
          </p>
          {(status === "EXPIRED" || status === "LOCKED") && <button type="button" onClick={() => { setChallenge(null); setStatus(null); }}>Start again</button>}
        </section>
      ) : (
        <section aria-labelledby="login-heading">
          <h2 id="login-heading">Sign up or log in</h2>
          <form onSubmit={(event) => void startVerification(event)}>
            <label>
              Phone number in international format
              <input
                autoComplete="tel"
                inputMode="tel"
                placeholder="+2348012345678"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <label>
              Name <span>(optional for existing accounts)</span>
              <input
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>{busy ? "Please wait..." : "Continue with WhatsApp"}</button>
          </form>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}