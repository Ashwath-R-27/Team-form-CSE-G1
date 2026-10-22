"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, KeyRound, Lock, Shield } from "lucide-react";
import GlassInput from "@/app/components/GlassInput";
import {
  adminChangePassword,
  AdminUser,
  ApiClientError,
  fetchAdminMe,
} from "@/lib/api";

export default function AdminAccountPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchAdminMe()
      .then((res) => {
        setAdmin(res.admin);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          router.replace("/admin/login");
          return;
        }
        setLoading(false);
      });
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAlert(null);

    if (!currentPassword || !newPassword) {
      setAlert({ type: "error", text: "Please fill in both current and new password." });
      return;
    }
    if (newPassword.length < 6) {
      setAlert({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setAlert({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    setSaving(true);
    try {
      const res = await adminChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setAlert({ type: "success", text: res.message || "Password updated successfully." });
    } catch (err: any) {
      setAlert({ type: "error", text: err?.message || "Failed to update password." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative min-h-screen pb-16 font-sans">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/60 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
              aria-label="Back to Admin Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-extrabold text-white">Account Settings</h1>
              <p className="text-xs text-white/50">
                Manage your administrator credentials
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto mt-10 max-w-lg px-6">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[30px] border border-white/10 bg-slate-950/65 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
        >
          {loading ? (
            <div className="space-y-4">
              <div className="h-14 animate-pulse rounded-2xl bg-white/5" />
              <div className="h-14 animate-pulse rounded-2xl bg-white/5" />
              <div className="h-12 animate-pulse rounded-2xl bg-white/10" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] text-white">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{admin?.email}</p>
                  <p className="text-xs text-[#FF9FFC]">
                    Role: {admin?.role === "super_admin" ? "Super Admin" : "Admin"}
                  </p>
                </div>
              </div>

              <h2 className="mt-6 flex items-center gap-2 text-base font-bold text-white">
                <KeyRound className="h-4 w-4 text-[#FF9FFC]" />
                Change Password
              </h2>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
                <GlassInput
                  label="Current Password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  icon={<Lock className="h-4 w-4" />}
                  autoComplete="current-password"
                  required
                />

                <GlassInput
                  label="New Password (min 6 chars)"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  icon={<Lock className="h-4 w-4" />}
                  autoComplete="new-password"
                  required
                />

                <GlassInput
                  label="Confirm New Password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  icon={<Lock className="h-4 w-4" />}
                  autoComplete="new-password"
                  required
                />

                {alert && (
                  <div
                    role="alert"
                    className={`rounded-2xl border px-4 py-3 text-xs font-medium ${
                      alert.type === "success"
                        ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                        : "border-rose-400/35 bg-rose-500/10 text-rose-200"
                    }`}
                  >
                    {alert.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
                >
                  {saving ? "Updating Password…" : "Update Password"}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

