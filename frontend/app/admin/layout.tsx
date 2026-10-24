"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearAdminToken, fetchAdminMe, getAdminToken } from "@/lib/api";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === "/admin/login";

  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (isLoginRoute) {
      setAuthorized(true);
      return;
    }

    const token = getAdminToken();
    if (!token) {
      clearAdminToken();
      setAuthorized(false);
      router.replace("/admin/login");
      return;
    }

    let cancelled = false;
    fetchAdminMe()
      .then(() => {
        if (!cancelled) {
          setAuthorized(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearAdminToken();
          setAuthorized(false);
          router.replace("/admin/login");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLoginRoute, pathname, router]);

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
