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
    <main className="min-h-screen flex items-center justify-center bg-[#f8f7f3] px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-7 shadow-sm sm:p-9">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          The Orbit · Account Recovery
        </p>

        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
          Set a new password<span className="text-orange-500">.</span>
        </h1>

        <p className="mt-3 text-sm leading-6 text-neutral-500">
          Choose a new password for your administrator account.
        </p>

        {loading ? (
          <p className="mt-7 text-sm text-neutral-500">
            Verifying your recovery link...
          </p>
        ) : !ready ? (
          <div className="mt-6">
            <p className="text-sm leading-6 text-red-600">{message}</p>

            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="mt-5 w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              Return to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label
                htmlFor="new-password"
                className="mb-2 block text-sm font-medium text-neutral-700"
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
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="mb-2 block text-sm font-medium text-neutral-700"
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
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                placeholder="Enter password again"
              />
            </div>

            {message && (
              <p role="status" className="text-sm leading-5 text-neutral-600">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Updating password..." : "Update password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
