import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabaseClient } from "../services/supabase.js";

export default function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const previousTitle = document.title;
    document.title = "Reset administrator password | ORBIT";
    const robots = document.querySelector('meta[name="robots"]');
    const previousRobots = robots?.content;
    if (robots) robots.setAttribute("content", "noindex, nofollow");
    else {
      const tag = document.createElement("meta");
      tag.name = "robots";
      tag.content = "noindex, nofollow";
      document.head.appendChild(tag);
    }

    async function verifyRecoverySession() {
      const { data, error } = await getSupabaseClient().auth.getSession();

      if (!active) return;

      if (error || !data.session) {
        setMessage(
          "Reset link invalid ya expired hai. Please naya reset link request karein.",
        );
      } else {
        setReady(true);
      }

      setLoading(false);
    }

    verifyRecoverySession();

    return () => {
      active = false;
      document.title = previousTitle;
      const tag = document.querySelector('meta[name="robots"]');
      if (previousRobots != null) tag?.setAttribute("content", previousRobots);
      else tag?.remove();
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("Password kam se kam 8 characters ka hona chahiye.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Dono passwords match nahi kar rahe.");
      return;
    }

    setSaving(true);

    const { error } = await getSupabaseClient().auth.updateUser({
      password,
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Password successfully update ho gaya!");

    setTimeout(async () => {
      await getSupabaseClient().auth.signOut();
      navigate("/admin", { replace: true });
    }, 1500);
  }

  return (
    <main className="reset-password-page">
      <section className="reset-password-card">
        <a href="/" className="wordmark" aria-label="ORBIT home">
          ORBIT
        </a>
        <p className="reset-password-eyebrow">Account recovery</p>

        <h1>Set a new password<span>.</span></h1>

        <p className="reset-password-intro">
          Choose a new password for your administrator account.
        </p>

        {loading ? (
          <p className="reset-password-message" role="status">
            Verifying your recovery link...
          </p>
        ) : !ready ? (
          <div className="reset-password-message">
            <p role="alert">{message}</p>

            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="reset-password-submit"
            >
              Return to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="reset-password-form">
            <div>
              <label
                htmlFor="new-password"
              >
                New password
              </label>

              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
              >
                Confirm new password
              </label>

              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Enter password again"
              />
            </div>

            {message && (
              <p role="status" className="reset-password-message">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="reset-password-submit"
            >
              {saving ? "Updating password..." : "Update password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
