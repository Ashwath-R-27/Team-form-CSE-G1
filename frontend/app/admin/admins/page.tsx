"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  KeyRound,
  Mail,
  Plus,
  Shield,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import GlassInput from "@/app/components/GlassInput";
import {
  AdminRole,
  AdminUser,
  ApiClientError,
  createNewAdmin,
  deleteAdminAccount,
  fetchAdminList,
  fetchAdminMe,
  resetAdminPassword,
} from "@/lib/api";

export default function ManageAdminsPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add Admin Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("admin");
  const [addingBusy, setAddingBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Reset Password Modal State
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Delete Admin Confirm Modal State
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadAdmins = useCallback(async () => {
    try {
      const meRes = await fetchAdminMe();
      setCurrentAdmin(meRes.admin);
      if (meRes.admin.role !== "super_admin") {
        router.replace("/admin");
        return;
      }
      const listRes = await fetchAdminList();
      setAdmins(listRes.admins);
      setLoading(false);
    } catch (err: any) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  async function handleCreateAdmin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddError(null);

    if (!newEmail.trim() || !newPassword) {
      setAddError("Email and password are required.");
      return;
    }
    if (newPassword.length < 6) {
      setAddError("Password must be at least 6 characters.");
      return;
    }

    setAddingBusy(true);
    try {
      const { admin } = await createNewAdmin({
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
      });
      setAdmins((prev) => [...prev, admin]);
      setAddModalOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewRole("admin");
      setAlert({
        type: "success",
        text: `Added ${admin.email} (${admin.role === "super_admin" ? "Super Admin" : "Admin"}).`,
      });
    } catch (err: any) {
      setAddError(err?.message || "Failed to create admin.");
    } finally {
      setAddingBusy(false);
    }
  }

  async function handleResetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);

    if (resetPasswordValue.length < 6) {
      setResetError("New password must be at least 6 characters.");
      return;
    }

    setResetBusy(true);
    try {
      await resetAdminPassword(resetTarget.id, resetPasswordValue);
      setAlert({
        type: "success",
        text: `Password reset for ${resetTarget.email}.`,
      });
      setResetTarget(null);
      setResetPasswordValue("");
    } catch (err: any) {
      setResetError(err?.message || "Failed to reset password.");
    } finally {
      setResetBusy(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setAlert(null);
    try {
      await deleteAdminAccount(deleteTarget.id);
      setAdmins((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setAlert({
        type: "success",
        text: `Removed admin ${deleteTarget.email}.`,
      });
      setDeleteTarget(null);
    } catch (err: any) {
      setAlert({
        type: "error",
        text: err?.message || "Failed to remove admin.",
      });
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const superAdminCount = admins.filter((a) => a.role === "super_admin").length;

  return (
    <div className="relative min-h-screen pb-16 font-sans">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/60 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
              aria-label="Back to Admin Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-extrabold text-white">Manage Admins</h1>
              <p className="text-xs text-white/50">
                Super Admin Portal • Add, remove, or reset passwords for administrators
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewEmail("");
              setNewPassword("");
              setNewRole("admin");
              setAddError(null);
              setAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Add Admin
          </button>
        </div>
      </header>

      <div className="mx-auto mt-8 max-w-5xl space-y-6 px-6">
        {alert && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-medium ${
              alert.type === "success"
                ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                : "border-rose-400/35 bg-rose-500/10 text-rose-200"
            }`}
          >
            <span>{alert.text}</span>
            <button
              type="button"
              onClick={() => setAlert(null)}
              className="text-white/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[30px] border border-white/10 bg-slate-950/65 p-6 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#B15CFF]/30 bg-[#5227FF]/20 text-[#FF9FFC]">
                <UserCog className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  Administrator Accounts ({admins.length})
                </h2>
                <p className="text-xs text-white/50">
                  All admins can manage forms and responses; only super admins can manage accounts
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="mt-5 space-y-3">
              {[1, 2].map((n) => (
                <div key={n} className="h-16 w-full animate-pulse rounded-2xl bg-white/5" />
              ))}
            </div>
          ) : (
            <div className="mt-4 divide-y divide-white/10">
              {admins.map((a) => {
                const isSelf = currentAdmin?.id === a.id;
                const isLastSuper = a.role === "super_admin" && superAdminCount <= 1;
                const cannotDelete = isSelf || isLastSuper;

                return (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#FF9FFC]">
                        <Shield className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-white">
                            {a.email}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              a.role === "super_admin"
                                ? "border-[#B15CFF]/40 bg-[#5227FF]/25 text-[#FF9FFC]"
                                : "border-sky-400/30 bg-sky-500/15 text-sky-300"
                            }`}
                          >
                            {a.role === "super_admin" ? "Super Admin" : "Admin"}
                          </span>
                          {isSelf && (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                              You
                            </span>
                          )}
                        </div>
                        {a.created_at && (
                          <p className="mt-0.5 text-[11px] text-white/45">
                            Added{" "}
                            {new Date(a.created_at).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setResetTarget(a);
                          setResetPasswordValue("");
                          setResetError(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                      >
                        <KeyRound className="h-3.5 w-3.5 text-[#FF9FFC]" />
                        Reset Password
                      </button>

                      <button
                        type="button"
                        disabled={cannotDelete}
                        title={
                          isSelf
                            ? "You cannot delete your own account"
                            : isLastSuper
                            ? "Cannot delete the last super admin"
                            : `Remove ${a.email}`
                        }
                        onClick={() => setDeleteTarget(a)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* Add Admin Modal */}
      <AnimatePresence>
        {addModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setAddModalOpen(false)}
          >
            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? {} : { scale: 0.95, opacity: 0, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[30px] border border-white/15 bg-slate-950/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Add Administrator</h2>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="rounded-xl p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateAdmin} className="mt-5 space-y-4">
                <GlassInput
                  label="Admin Email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  icon={<Mail className="h-4 w-4" />}
                  required
                />

                <GlassInput
                  label="Initial Password (min 6 chars)"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  icon={<KeyRound className="h-4 w-4" />}
                  required
                />

                <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-3.5">
                  <span className="block text-xs font-semibold text-white">Role</span>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewRole("admin")}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        newRole === "admin"
                          ? "border-[#FF9FFC]/60 bg-[#5227FF]/30 text-white"
                          : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                      }`}
                    >
                      Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRole("super_admin")}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        newRole === "super_admin"
                          ? "border-[#FF9FFC]/60 bg-[#5227FF]/30 text-white"
                          : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                      }`}
                    >
                      Super Admin
                    </button>
                  </div>
                </div>

                {addError && (
                  <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                    {addError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingBusy}
                    className="rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-6 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
                  >
                    {addingBusy ? "Creating…" : "Create Admin"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
      <AnimatePresence>
        {resetTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setResetTarget(null)}
          >
            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? {} : { scale: 0.95, opacity: 0, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[30px] border border-white/15 bg-slate-950/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Reset Admin Password</h2>
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="rounded-xl p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1 text-xs text-white/55">
                Setting a new password for{" "}
                <span className="font-semibold text-white">{resetTarget.email}</span>
              </p>

              <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
                <GlassInput
                  label="New Password (min 6 chars)"
                  type="password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  icon={<KeyRound className="h-4 w-4" />}
                  required
                />

                {resetError && (
                  <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                    {resetError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetTarget(null)}
                    className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-6 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
                  >
                    {resetBusy ? "Saving…" : "Reset Password"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Admin Confirm Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={prefersReducedMotion ? {} : { scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[30px] border border-white/15 bg-slate-950/95 p-6 text-center shadow-2xl backdrop-blur-xl"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/15 text-rose-300">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Remove Administrator?</h3>
              <p className="mt-2 text-xs text-white/60">
                Are you sure you want to remove{" "}
                <span className="font-semibold text-white">{deleteTarget.email}</span>? Forms created by this admin will remain intact.
              </p>

              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={handleConfirmDelete}
                  className="rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-rose-500 disabled:opacity-50"
                >
                  {deleteBusy ? "Removing…" : "Remove Admin"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

