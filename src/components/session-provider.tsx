"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/access";

const Context = createContext<AuthUser | null>(null);
export function SessionProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (response.status === 401) { router.replace("/login?expired=1"); router.refresh(); }
      } catch { /* Interactive requests expose connection errors; temporary offline checks do not discard work. */ }
    };
    const timer = setInterval(check, 60_000);
    const onFocus = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onFocus); };
  }, [router]);
  return <Context.Provider value={user}>{children}</Context.Provider>;
}
export function useSession() {
  const user = useContext(Context);
  if (!user) throw new Error("An authenticated session is required");
  return user;
}
