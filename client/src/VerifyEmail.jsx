import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import logo from "./logo.svg";

export default function VerifyEmail({ token, onDone }) {
  const { verifyEmail } = useAuth();
  const [state, setState] = useState("verifying"); // verifying | success | error
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard StrictMode double-invoke (token is single-use)
    ran.current = true;
    verifyEmail(token)
      .then(() => setState("success"))
      .catch((e) => {
        setError(e.message);
        setState("error");
      });
  }, [token, verifyEmail]);

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="brand brand-center">
          <img src={logo} className="brand-logo" alt="" />
          Claud
        </h1>
        {state === "verifying" && <p className="muted">Verifying your email…</p>}
        {state === "success" && (
          <>
            <p className="muted">Your email is verified — you're all set.</p>
            <button className="btn primary" onClick={onDone}>Continue to Claud</button>
          </>
        )}
        {state === "error" && (
          <>
            <div className="error">{error}</div>
            <button className="btn ghost" onClick={onDone}>Back to sign in</button>
          </>
        )}
      </div>
    </div>
  );
}
