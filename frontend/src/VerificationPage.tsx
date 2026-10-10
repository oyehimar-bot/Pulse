import { useEffect, useState } from "react";
import { apiRequest, apiUrl, formatDate } from "./api";
import type { LicenseVerification } from "./api";

export default function VerificationPage({ certificateNumber }: { certificateNumber: string }) {
  const [result, setResult] = useState<LicenseVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<LicenseVerification>(`/licenses/${encodeURIComponent(certificateNumber)}/verify`, controller.signal)
      .then(setResult)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not verify certificate.");
      });
    return () => controller.abort();
  }, [certificateNumber]);

  const valid = result?.valid;
  const failed = error || result;

  return (
    <main className="verify-shell">
      <a className="brand verify-brand" href="/">
        <img src="/pulse.svg" alt="" className="brand-logo" width="34" height="34" />
        <span className="brand-text"><strong>Pulse</strong><small>Rights Registry</small></span>
      </a>

      <section className={`verify-card${valid ? " is-valid" : failed ? " is-invalid" : ""}`}>
        <div className="verify-symbol">
          {valid ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
          ) : failed ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
          ) : (
            <span className="spinner" />
          )}
        </div>

        <span className="kicker">Pulse Rights Registry</span>
        <h1>{valid ? "Valid" : failed ? "Invalid" : "Checking certificate"}</h1>
        <span className="verify-number">{certificateNumber}</span>

        {valid && result.license ? (
          <>
            <div className="detail-pairs verify-detail">
              <span>Work</span><b>{result.license.workDescription}</b>
              <span>Licensor</span><b>{result.license.sellerName}</b>
              <span>Licensee</span><b>{result.license.buyerName}</b>
              <span>Rights</span><b>{result.license.rights}</b>
              <span>Deal</span><b>{result.license.dealCode}</b>
              <span>Issued</span><b>{result.issuedAt ? formatDate(result.issuedAt) : "Not recorded"}</b>
            </div>

            <div className="verify-hash">
              <span className="kicker">SHA-256 Snapshot Hash</span>
              <code>{result.sha256}</code>
            </div>

            <a className="btn solid" href={apiUrl(`/licenses/${encodeURIComponent(certificateNumber)}.pdf`)} target="_blank" rel="noreferrer">
              Open certificate PDF
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
            </a>
          </>
        ) : (
          <p className="verify-explainer">{error ?? result?.error ?? "The public registry record could not be confirmed."}</p>
        )}
      </section>

      <p className="verify-foot">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" width="14" height="14"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.77 4 4 0 0 1 0 6.76 4 4 0 0 1-4.78 4.77 4 4 0 0 1-6.74 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>
        A public integrity record issued by Pulse. The underlying deal remains subject to its agreement and applicable law.
      </p>
    </main>
  );
}
