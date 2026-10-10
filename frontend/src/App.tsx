import Workspace from "./Workspace";
import VerificationPage from "./VerificationPage";

export default function App() {
  const match = window.location.pathname.match(/^\/verify\/(PULSE-LIC-[A-Z0-9-]+)$/);
  return match?.[1] ? <VerificationPage certificateNumber={match[1]} /> : <Workspace />;
}
