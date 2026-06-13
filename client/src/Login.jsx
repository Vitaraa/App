import { useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { api } from "./api.js";
import logo from "./logo.svg";

export default function Login() {
  const { login, register } = useAuth();
  // view: login | register | verifySent | forgot | resetSent
  const [view, setView] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false); // login blocked: unverified

  function go(next) {
    setView(next);
    setError("");
    setNotice("");
    setNeedsVerify(false);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setNeedsVerify(false);
    setBusy(true);
    try {
      if (view === "login") {
        await login(username, password);
      } else {
        const res = await register(username, email, password);
        if (res?.warning) setNotice(res.warning);
        setView("verifySent");
      }
    } catch (err) {
      if (err.code === "unverified") {
        setNeedsVerify(true);
        setError("Your email isn't verified yet. Check your inbox for the verification link.");
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setError("");
    try {
      await api.resendVerification(username);
      setNotice("Verification email sent. Check your inbox.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.forgotPassword(email);
      setView("resetSent");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // --- Confirmation screens ------------------------------------------------
  if (view === "verifySent") {
    return (
      <Shell sub="Verify your email">
        <p className="muted">
          We sent a verification link to <strong>{email}</strong>. Open it to activate your account,
          then sign in.
        </p>
        {notice && <div className="notice">{notice}</div>}
        {error && <div className="error">{error}</div>}
        <button className="btn ghost" disabled={busy} onClick={resendVerification}>
          {busy ? "..." : "Resend email"}
        </button>
        <button type="button" className="link" onClick={() => go("login")}>
          Back to sign in
        </button>
      </Shell>
    );
  }

  if (view === "resetSent") {
    return (
      <Shell sub="Check your email">
        <p className="muted">
          If an account exists for <strong>{email}</strong>, a password-reset link is on its way.
          The link expires in 1 hour.
        </p>
        <button type="button" className="link" onClick={() => go("login")}>
          Back to sign in
        </button>
      </Shell>
    );
  }

  if (view === "forgot") {
    return (
      <Shell sub="Reset your password">
        <form className="auth-form" onSubmit={submitForgot}>
          <p className="muted">Enter your account email and we'll send you a reset link.</p>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {error && <div className="error">{error}</div>}
          <button className="btn primary" disabled={busy}>
            {busy ? "..." : "Send reset link"}
          </button>
          <button type="button" className="link" onClick={() => go("login")}>
            Back to sign in
          </button>
        </form>
      </Shell>
    );
  }

  // --- Login / Register ----------------------------------------------------
  return (
    <Shell sub={view === "login" ? "Sign in to your account" : "Create an account"}>
      <form className="auth-form" onSubmit={submit}>
        <label>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

        {view === "register" && (
          <>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </>
        )}

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={view === "login" ? "current-password" : "new-password"}
          required
        />

        {notice && <div className="notice">{notice}</div>}
        {error && <div className="error">{error}</div>}

        {needsVerify && (
          <button type="button" className="btn ghost" disabled={busy} onClick={resendVerification}>
            {busy ? "..." : "Resend verification email"}
          </button>
        )}

        <button className="btn primary" disabled={busy}>
          {busy ? "..." : view === "login" ? "Sign in" : "Create account"}
        </button>

        {view === "login" && (
          <button type="button" className="link" onClick={() => go("forgot")}>
            Forgot password?
          </button>
        )}

        <button type="button" className="link" onClick={() => go(view === "login" ? "register" : "login")}>
          {view === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ sub, children }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="brand brand-center">
          <img src={logo} className="brand-logo" alt="" />
          Claud
        </h1>
        <p className="muted">{sub}</p>
        {children}
      </div>
    </div>
  );
}
