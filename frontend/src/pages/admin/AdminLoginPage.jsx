import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getSupabaseClient } from "../../services/supabase.js";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Admin sign in | ORBIT";
    const robots = document.querySelector('meta[name="robots"]');
    const previousContent = robots?.content
    if (robots) robots.setAttribute('content', 'noindex, nofollow')
    else {
      const tag = document.createElement('meta')
      tag.name = 'robots'
      tag.content = 'noindex, nofollow'
      document.head.appendChild(tag)
    }
    try {
      const supabase = getSupabaseClient();
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) navigate("/admin", { replace: true });
      });
    } catch {
      setConfigured(false);
    }
    return () => {
      document.title = previousTitle;
      const tag = document.querySelector('meta[name="robots"]')
      if (previousContent != null) tag?.setAttribute('content', previousContent)
      else tag?.remove()
    }
  }, [navigate]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data, error: signInError } =
        await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      if (!data.session) throw new Error("Sign-in did not create a session.");
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset(event) {
    event.preventDefault();
    setError("");
    setResetMessage("");

    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );

      if (error) throw error;

      setResetMessage(
        "If an account exists for this email, a password reset link will be sent.",
      );
    } catch (err) {
      setError(err.message || "Unable to send the password reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-aside">
        <Link to="/" className="wordmark">ORBIT</Link>
        <div>
          <span className="admin-eyebrow">ORBIT / OPERATIONS</span>
          <h1>
            Gather the
            <br />
            <em>good stuff.</em>
          </h1>
        </div>
        <span className="admin-login-foot">
          A quieter way to bring the community together.
        </span>
      </div>
      <section className="admin-login-form-wrap">
        <Link to="/" className="admin-back">
          <ArrowLeft size={14} /> Back to the public site
        </Link>
        <form
          className="admin-login-form"
          onSubmit={resetMode ? handlePasswordReset : submit}
        >
          <span className="admin-eyebrow">PRIVATE WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p>
            {resetMode
              ? "Enter your email and we’ll send you a secure reset link."
              : "Sign in to manage the weekend."}
          </p>
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {!resetMode && (
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
          )}
          <button
            type="button"
            className="admin-forgot-password"
            onClick={() => {
              setError("");
              setResetMessage("");
              setResetMode(true);
            }}
          >
            Forgot password?
          </button>
          {error && (
            <p className="admin-form-error" role="alert">
              {error}
            </p>
          )}

          {resetMessage && (
            <p className="admin-form-hint" role="status">
              {resetMessage}
            </p>
          )}
          {!configured && (
            <p className="admin-form-hint">
              Check your Supabase configuration and owner account.
            </p>
          )}
          <button
            className="admin-primary-button"
            type="submit"
            disabled={busy}
          >
            {busy
              ? resetMode
                ? "Sending link…"
                : "Signing in…"
              : resetMode
                ? "Send reset link"
                : "Sign in"}
            <ArrowUpRight size={15} />
          </button>

          {resetMode && (
            <button
              type="button"
              className="admin-forgot-password"
              onClick={() => {
                setResetMode(false);
                setError("");
                setResetMessage("");
              }}
            >
              Back to sign in
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
