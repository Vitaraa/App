// Transactional email via Resend (https://resend.com). Uses the global fetch
// (Node 18+) so there's no extra dependency.
//
// Required env vars (see .env.example):
//   RESEND_API_KEY  – your Resend API key (re_...)
//   EMAIL_FROM      – verified sender, e.g. "Claud <noreply@yourdomain.com>"
//                     (for quick testing, "Claud <onboarding@resend.dev>" works
//                     but only delivers to your own Resend account email)
//
// If RESEND_API_KEY is missing we don't hard-fail: we log the email (including
// any action link) to the server console so local/dev flows still work.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function fromAddress() {
  return process.env.EMAIL_FROM || "Claud <onboarding@resend.dev>";
}

export async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(
      `[email] RESEND_API_KEY not set — not sending. Would email ${to}: "${subject}"`
    );
    if (text) console.warn(`[email] body:\n${text}`);
    return { ok: false, skipped: true };
  }
  if (typeof fetch !== "function") {
    console.error("[email] global fetch unavailable — Node 18+ required to send email");
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email] Resend error ${res.status}: ${detail}`);
      return { ok: false, error: `Email provider error (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] send failed:", e.message);
    return { ok: false, error: "Could not reach email provider" };
  }
}

// Shared, minimal HTML shell so both emails look consistent.
function shell(title, bodyHtml) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1d24">
    <h2 style="margin:0 0 12px">${title}</h2>
    ${bodyHtml}
    <p style="color:#8a909c;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
  </div>`;
}

function button(href, label) {
  return `<p style="margin:20px 0">
    <a href="${href}" style="background:#4f7cff;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;display:inline-block;font-weight:600">${label}</a>
  </p>
  <p style="color:#8a909c;font-size:12px;word-break:break-all">Or paste this link into your browser:<br>${href}</p>`;
}

export function sendVerificationEmail(to, link) {
  return sendEmail({
    to,
    subject: "Verify your email for Claud",
    text: `Welcome to Claud! Verify your email by opening this link:\n${link}\n\nThis link expires in 24 hours.`,
    html: shell(
      "Verify your email",
      `<p>Welcome to Claud! Confirm this address to activate your account.</p>
       ${button(link, "Verify email")}
       <p style="color:#8a909c;font-size:12px">This link expires in 24 hours.</p>`
    ),
  });
}

export function sendPasswordResetEmail(to, link) {
  return sendEmail({
    to,
    subject: "Reset your Claud password",
    text: `Reset your Claud password by opening this link:\n${link}\n\nThis link expires in 1 hour.`,
    html: shell(
      "Reset your password",
      `<p>We received a request to reset your Claud password.</p>
       ${button(link, "Reset password")}
       <p style="color:#8a909c;font-size:12px">This link expires in 1 hour.</p>`
    ),
  });
}
