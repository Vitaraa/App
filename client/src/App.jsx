import { useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import VerifyEmail from "./VerifyEmail.jsx";
import ResetPassword from "./ResetPassword.jsx";

// Email links land on /verify?token=… or /reset?token=… (the server serves the
// SPA for any non-API path). Detect those once on load and show the right screen.
function initialRoute() {
  const path = window.location.pathname;
  const token = new URLSearchParams(window.location.search).get("token");
  if (token && path === "/verify") return { name: "verify", token };
  if (token && path === "/reset") return { name: "reset", token };
  return null;
}

export default function App() {
  const { isAuthed } = useAuth();
  const [route, setRoute] = useState(initialRoute);

  function clearRoute() {
    window.history.replaceState({}, "", "/");
    setRoute(null);
  }

  if (route?.name === "verify") return <VerifyEmail token={route.token} onDone={clearRoute} />;
  if (route?.name === "reset") return <ResetPassword token={route.token} onDone={clearRoute} />;

  return isAuthed ? <Dashboard /> : <Login />;
}
