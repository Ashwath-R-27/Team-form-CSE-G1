"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Shield, Lock, Mail, ArrowLeft } from "lucide-react";
import GlassInput from "@/app/components/GlassInput";
import { adminLogin, fetchAdminMe } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminMe()
      .then(() => {
        router.replace("/admin");
      })
      .catch(() => {
        setCheckingSession(false);
      });
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter both your admin email and password.");
      return;
    }

    setLoading(true);
    try {
      await adminLogin(email.trim(), password);
      router.push("/admin");
    } catch (err: any) {
      setError(err?.message || "Invalid admin credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6 font-sans">
      <div className="fixed top-6 left-6 z-50">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-xs font-semibold text-white/75 backdrop-blur-xl transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Public Portal
        </Link>
      </div>

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-md rounded-[30px] border border-white/10 bg-slate-950/65 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] text-white shadow-[0_8px_28px_-4px_rgba(177,92,255,0.65)]">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Admin Portal
          </h1>
          <p className="mt-1 text-xs text-white/55">
            Sign in to manage team registration forms, responses & exports
          </p>
        </div>

        <hr className="my-6 border-white/10" />

        {checkingSession ? (
          <div className="space-y-4 py-4">
            <div className="h-14 w-full animate-pulse rounded-2xl bg-white/5" />
            <div className="h-14 w-full animate-pulse rounded-2xl bg-white/5" />
            <div className="h-12 w-full animate-pulse rounded-2xl bg-white/10" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <GlassInput
              label="Admin Email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              icon={<Mail className="h-4 w-4" />}
              autoComplete="email"
              required
            />

            <GlassInput
              label="Password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              icon={<Lock className="h-4 w-4" />}
              autoComplete="current-password"
              required
            />

            {error && (
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-200"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={!loading && !prefersReducedMotion ? { scale: 1.015 } : {}}
              whileTap={!loading && !prefersReducedMotion ? { scale: 0.985 } : {}}
              className="group relative mt-2 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_rgba(82,39,255,0.65)] transition-all duration-300 hover:shadow-[0_8px_40px_-6px_rgba(255,159,252,0.7)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <span className="relative flex items-center justify-center gap-2">
                {loading && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                  </svg>
                )}
                {loading ? "Signing in…" : "Sign In to Dashboard"}
              </span>
            </motion.button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

