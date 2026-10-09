import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  service: string;
};

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

    fetch(`${apiBaseUrl}/health`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return (await response.json()) as HealthResponse;
      })
      .then(setHealth)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "API unavailable");
      });
  }, []);

  return (
    <main>
      <h1>Pulse</h1>
      <p>Escrow and licensing workspace</p>
      <output aria-live="polite">
        {health ? `${health.service}: ${health.status}` : error ?? "Checking API..."}
      </output>
    </main>
  );
}