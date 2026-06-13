import { useState } from "react";
import { api } from "./api.js";
import logo from "./logo.svg";

export default function ResetPassword({ token, onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [state, setState] = useState("form"); // form | done
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (pw.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, pw);
      setState("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="brand brand-center">
          <img src={logo} className="brand-logo" alt="" />
          Claud
        </h1>
        {state === "done" ? (
          <>
            <p className="muted">Your password has been reset. You can sign in now.</p>
            <button className="btn primary" onClick={onDone}>Back to sign in</button>
          </>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <p className="muted">Choose a new password</p>
            <label>New password</label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              required
            />
            <label>Confirm password</label>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              required
            />
            {error && <div className="error">{error}</div>}
            <button className="btn primary" disabled={busy}>
              {busy ? "..." : "Reset password"}
            </button>
            <button type="button" className="link" onClick={onDone}>
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
