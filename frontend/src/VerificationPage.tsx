import { useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, CircleAlert, ShieldCheck } from "lucide-react";
import { apiRequest, apiUrl, formatDate } from "./api";
import type { LicenseVerification } from "./api";

export default function VerificationPage({ certificateNumber }: { certificateNumber: string }) {
  const [result, setResult] = useState<LicenseVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<LicenseVerification>(`/licenses/${encodeURIComponent(certificateNumber)}/verify`, controller.signal)
      .then(setResult)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not verify certificate."); });
    return () => controller.abort();
  }, [certificateNumber]);

  return <main className="verification-shell"><a className="brand-lockup verify-brand" href="/"><span className="brand-mark">P</span><span>pulse<span className="brand-period">.</span></span></a><section className={`verification-card ${result?.valid ? "is-valid" : error || result ? "is-invalid" : ""}`}><div className="verification-symbol">{result?.valid ? <ShieldCheck size={28} /> : error || result ? <CircleAlert size={26} /> : <span className="spinner" />}</div><p className="eyebrow">PULSE RIGHTS REGISTRY</p><h1>{result?.valid ? "Valid" : error || result ? "Invalid" : "Checking certificate"}</h1><p className="mono verify-number">{certificateNumber}</p>{result?.valid && result.license ? <><div className="verification-detail"><span>WORK</span><b>{result.license.workDescription}</b><span>LICENSOR</span><b>{result.license.sellerName}</b><span>LICENSEE</span><b>{result.license.buyerName}</b><span>RIGHTS</span><b>{result.license.rights}</b><span>DEAL</span><b>{result.license.dealCode}</b><span>ISSUED</span><b>{result.issuedAt ? formatDate(result.issuedAt) : "Not recorded"}</b></div><div className="hash-box"><span>SHA-256 SNAPSHOT HASH</span><code>{result.sha256}</code></div><a className="primary-link" href={apiUrl(`/licenses/${encodeURIComponent(certificateNumber)}.pdf`)} target="_blank" rel="noreferrer">Open certificate PDF <ArrowUpRight size={15} /></a></> : <p className="verify-explainer">{error ?? result?.error ?? "The public registry record could not be confirmed."}</p>}</section><p className="verification-foot"><BadgeCheck size={14} /> A public integrity record issued by Pulse. The underlying deal remains subject to its agreement and applicable law.</p></main>;
}
