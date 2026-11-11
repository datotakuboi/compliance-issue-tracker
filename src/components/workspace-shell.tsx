"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  FileClock,
  FileText,
  LayoutDashboard,
  ListTodo,
  ShieldCheck,
} from "lucide-react";

type Session = { id: string; role: "VIEWER" | "ANALYST" | "APPROVER" };
type Counts = { total: number; pendingReview: number };

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: Session | null) => {
        if (active) setSession(value);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setSessionLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!session) {
      setCounts(null);
      return;
    }
    let active = true;
    fetch("/api/dashboard", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: Counts | null) => {
        if (active) setCounts(value);
      })
      .catch(() => {
        if (active) setCounts(null);
      });
    return () => {
      active = false;
    };
  }, [session?.id]);

  if (!sessionLoaded || !session || pathname === "/login") return children;

  const active = (view: string) => {
    if (view === "dashboard") return pathname === "/";
    if (view === "issues") return pathname.startsWith("/issues");
    return pathname === `/${view}`;
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <ShieldCheck size={27} strokeWidth={1.7} />
          <span>compliwise<span className="brand-dot">.</span></span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">CW</span>
          <span><strong>Compliance workspace</strong><small>Internal operations</small></span>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <Link className={active("dashboard") ? "active" : ""} href="/" aria-current={active("dashboard") ? "page" : undefined}>
            <LayoutDashboard size={18} />Dashboard
          </Link>
          <Link className={active("issues") ? "active" : ""} href="/issues" aria-current={active("issues") ? "page" : undefined}>
            <ListTodo size={18} />Issues
            <span className="nav-count">{counts?.total ?? "…"}</span>
          </Link>
          {session.role === "APPROVER" && (
            <Link className={active("approvals") ? "active" : ""} href="/approvals" aria-current={active("approvals") ? "page" : undefined}>
              <ClipboardCheck size={18} />Approvals
              <span className="nav-count">{counts?.pendingReview ?? "…"}</span>
            </Link>
          )}
          <Link className={active("audit") ? "active" : ""} href="/audit" aria-current={active("audit") ? "page" : undefined}>
            <FileClock size={18} />Audit Logs
          </Link>
          <Link className={active("reports") ? "active" : ""} href="/reports" aria-current={active("reports") ? "page" : undefined}>
            <FileText size={18} />Reports
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="integration-status">
            <ShieldCheck size={14} />
            <span>Role-enforced access</span>
          </div>
        </div>
      </aside>
      {children}
    </div>
  );
}