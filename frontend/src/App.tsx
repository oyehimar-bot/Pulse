import { useState } from "react";
import LandingPage from "./LandingPage";
import Workspace from "./Workspace";
import VerificationPage from "./VerificationPage";

export default function App() {
  const verifyMatch = window.location.pathname.match(/^\/verify\/(PULSE-LIC-[A-Z0-9-]+)$/);
  if (verifyMatch?.[1]) return <VerificationPage certificateNumber={verifyMatch[1]} />;

  const [showDashboard, setShowDashboard] = useState(false);
  if (showDashboard) return <Workspace onSignOut={() => setShowDashboard(false)} />;
  return <LandingPage onEnterDashboard={() => setShowDashboard(true)} />;
}
