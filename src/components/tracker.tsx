"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LoginForm,
  LogoutDialog,
  RejectProposalDialog,
} from "./session-controls.tsx";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  AlignJustify,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Bell,
  CircleAlert,
  ClipboardCheck,
  Download,
  Clock3,
  ExternalLink,
  FileCheck2,
  Link2,
  ListFilter,
  ListTodo,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  History as HistoryIcon,
  Play,
  Plus,
  SearchCheck,
  Search,
  Rows3,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import type {
  dashboard,
  getAudit,
  getIssue,
  listAuditEvents,
  listIssues,
  reportSummary,
} from "../server/services.ts";

type Serialized<Value> = Value extends Date
  ? string
  : Value extends (infer Item)[]
    ? Serialized<Item>[]
    : Value extends object
      ? { [Key in keyof Value]: Serialized<Value[Key]> }
      : Value;
type Issue = Serialized<Awaited<ReturnType<typeof getIssue>>>;
type IssueList = Serialized<Awaited<ReturnType<typeof listIssues>>>;
type Audit = Serialized<Awaited<ReturnType<typeof getAudit>>>;
type Counts = Serialized<Awaited<ReturnType<typeof dashboard>>>;
type AuditFeed = Serialized<Awaited<ReturnType<typeof listAuditEvents>>>;
type ReportData = Serialized<Awaited<ReturnType<typeof reportSummary>>>;
type User = {
  id: string;
  name: string;
  role: "VIEWER" | "ANALYST" | "APPROVER";
};
type View = "dashboard" | "issues" | "approvals" | "audit" | "reports";
const statuses = ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"];
const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const severityDescriptions: Record<string, string> = {
  CRITICAL: "Immediate remediation required",
  HIGH: "Material control or access risk",
  MEDIUM: "Policy deviation needs follow-up",
  LOW: "Minor hygiene or documentation gap",
};
const label = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
const date = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
const timestamp = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const overdue = (issue: { status: string; dueDate: string }) =>
  issue.status !== "COMPLETED" &&
  issue.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

async function api<Result>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Result> {
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const fields = result.error?.fields
      ?.map(
        (field: { path: string; message: string }) =>
          `${field.path}: ${field.message}`,
      )
      .join(" ");
    throw new Error(
      fields || result.error?.message || "The request could not be completed.",
    );
  }
  return result;
}

function useResource<Result>(path: string | null, revision: number) {
  const [state, setState] = useState<{
    path: string | null;
    data?: Result;
    error?: string;
    loading: boolean;
  }>({ path: null, loading: false });
  useEffect(() => {
    if (!path) return;
    let active = true;
    setState((previous) => ({
      path,
      data: previous.path === path ? previous.data : undefined,
      loading: true,
    }));
    api<Result>(path)
      .then((data) => {
        if (active) setState({ path, data, loading: false });
      })
      .catch((error: Error) => {
        if (active) setState({ path, error: error.message, loading: false });
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return state.path === path
    ? state
    : { path, loading: Boolean(path), data: undefined, error: undefined };
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      <span className="badge-dot" />
      {label(value)}
    </span>
  );
}
function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" size={22} />
      Loading records...
    </div>
  );
}
function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="alert" role="alert">
      <CircleAlert size={18} />
      <span>{children}</span>
    </div>
  );
}

type SelectOption = { value: string; label: string };

function SelectField({
  ariaLabel,
  className = "",
  disabled = false,
  name,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function showMenu(index = selectedIndex) {
    setActiveIndex(index);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      showMenu(event.key === "ArrowDown" ? selectedIndex : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex);
      else showMenu();
    }
  }

  function handleOptionKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown") nextIndex = (index + 1) % options.length;
    else if (event.key === "ArrowUp") nextIndex = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (nextIndex !== undefined) {
      event.preventDefault();
      setActiveIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`select-control ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        disabled={disabled || options.length === 0}
        onClick={() => (open ? setOpen(false) : showMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{options[selectedIndex]?.label ?? "Select an option"}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${id}-options`}
          className="select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option, index) => (
            <button
              ref={(element) => { optionRefs.current[index] = element; }}
              id={`${id}-option-${index}`}
              data-value={option.value}
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={value === option.value ? "selected" : ""}
              onClick={() => choose(index)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Tracker({
  view,
  issueId,
  initialStatus = "",
  initialOverdue = false,
  initialQuery = "",
  loginPage = false,
  editPage = false,
  returnTo = "/",
}: {
  view: View;
  issueId?: string;
  initialStatus?: string;
  initialOverdue?: boolean;
  initialQuery?: string;
  loginPage?: boolean;
  editPage?: boolean;
  returnTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const globalSearchRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<User | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [globalQuery, setGlobalQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState(initialStatus);
  const [severity, setSeverity] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(initialOverdue);
  const [page, setPage] = useState(1);
  const [compact, setCompact] = useState(false);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditView, setAuditView] = useState<"table" | "timeline">("table");
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const [attentionTab, setAttentionTab] = useState<"critical" | "review" | "sla">("critical");
  useEffect(() => {
    api<User>("auth/session")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setSessionLoaded(true));
  }, []);
  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        globalSearchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);
  useEffect(() => {
    if (!sessionLoaded) return;
    if (!session && !loginPage)
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (session && loginPage) router.replace(returnTo);
  }, [sessionLoaded, session, loginPage, pathname, returnTo, router]);
  const demo = useResource<User[]>(
    sessionLoaded && !session && loginPage ? "auth/demo-users" : null,
    0,
  );
  const users = useResource<User[]>(session ? "users" : null, 0);
  const stats = useResource<Counts>(
    session && !issueId ? "dashboard" : null,
    revision,
  );
  const reports = useResource<ReportData>(
    session && ["reports", "dashboard"].includes(view) ? "reports" : null,
    revision,
  );
  const approvalQueue = useResource<IssueList>(
    session && view === "dashboard"
      ? "issues?status=PENDING_REVIEW&pageSize=3"
      : null,
    revision,
  );
  const filters = new URLSearchParams({
    page: String(page),
    pageSize: "10",
    ...(deferredQuery ? { query: deferredQuery } : {}),
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(onlyOverdue ? { overdue: "true" } : {}),
  });
  const listing = useResource<IssueList>(
    session && !issueId && ["dashboard", "issues", "approvals"].includes(view)
      ? `issues?${filters}`
      : null,
    revision,
  );
  const activeApprovalId =
    selectedApprovalId || listing.data?.items[0]?.id || "";
  const approvalDetail = useResource<Issue>(
    session && view === "approvals" && activeApprovalId
      ? `issues/${encodeURIComponent(activeApprovalId)}`
      : null,
    revision,
  );
  const auditFilters = new URLSearchParams({
    page: String(auditPage),
    pageSize: "25",
    ...(auditQuery ? { query: auditQuery } : {}),
    ...(auditAction ? { action: auditAction } : {}),
  });
  const auditFeed = useResource<AuditFeed>(
    session && view === "audit" ? `audit?${auditFilters}` : null,
    revision,
  );
  const reportActivity = useResource<AuditFeed>(
    session && view === "reports" ? "audit?page=1&pageSize=5" : null,
    revision,
  );
  const selectedAuditEvent =
    auditFeed.data?.items.find((event) => event.id === selectedAuditId) ??
    auditFeed.data?.items[0];
  const detail = useResource<Issue>(
    session && issueId && issueId !== "new"
      ? `issues/${encodeURIComponent(issueId)}`
      : null,
    revision,
  );
  const history = useResource<Audit>(
    session && issueId && issueId !== "new"
      ? `issues/${encodeURIComponent(issueId)}/audit`
      : null,
    revision,
  );
  const [olderAudit, setOlderAudit] = useState<Audit["items"]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null | undefined>(
    undefined,
  );
  useEffect(() => {
    setOlderAudit([]);
    setAuditCursor(undefined);
  }, [issueId, revision]);
  const canWrite = session?.role === "ANALYST" || session?.role === "APPROVER";
  const attentionIssues = stats.data?.attention ?? [];
  const activeFilters = [
    ...(query
      ? [
          {
            label: `Search: ${query}`,
            clear: () => {
              setQuery("");
              setGlobalQuery("");
            },
          },
        ]
      : []),
    ...(status
      ? [{ label: `Status: ${label(status)}`, clear: () => setStatus("") }]
      : []),
    ...(severity
      ? [
          {
            label: `Severity: ${label(severity)}`,
            clear: () => setSeverity(""),
          },
        ]
      : []),
    ...(ownerId
      ? [
          {
            label: `Owner: ${users.data?.find((user) => user.id === ownerId)?.name ?? ownerId}`,
            clear: () => setOwnerId(""),
          },
        ]
      : []),
    ...(onlyOverdue
      ? [{ label: "Overdue only", clear: () => setOnlyOverdue(false) }]
      : []),
  ];

  async function exportFilteredIssues() {
    const items = listing.data?.items;
    if (!items) return;
    const cell = (value: string | number | null | undefined) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Issue ID", "Title", "Severity", "Status", "Owner", "Evidence links", "Due date"],
      ...items.map((item) => [
        item.id,
        item.title,
        item.severity,
        item.status,
        item.owner?.name ?? "Unassigned",
        item._count.evidence,
        item.dueDate.slice(0, 10),
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.map(cell).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "compliwise-issues.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function perform(
    operation: () => Promise<unknown>,
    success: string,
    refresh = true,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      setMessage(success);
      if (refresh) setRevision((value) => value + 1);
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The operation failed.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError("");
    try {
      await api("auth/session", "DELETE");
      setLogoutOpen(false);
      setSession(null);
      setError("");
      setMessage("");
    } catch (failure) {
      setLogoutError(
        failure instanceof Error
          ? failure.message
          : "Unable to sign out. Try again.",
      );
    } finally {
      setLogoutBusy(false);
    }
  }

  function submitGlobalSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = globalQuery.trim();
    if (value) router.push(`/issues?query=${encodeURIComponent(value)}`);
  }

  if (!sessionLoaded || (!session && !loginPage) || (session && loginPage))
    return (
      <main className="standalone">
        <Loading />
      </main>
    );
  if (!session)
    return (
      <LoginForm
        accounts={demo.data ?? []}
        loading={demo.loading}
        busy={busy}
        error={error || demo.error}
        onSubmit={(userId) =>
          perform(
            async () => {
              await api("auth/session", "POST", { userId });
              setSession(await api<User>("auth/session"));
            },
            "",
            false,
          )
        }
      />
    );

  const issue = detail.data;
  const title = issueId === "new"
    ? "Create an issue"
    : issueId
      ? "Issue details"
      : view === "dashboard"
        ? "Dashboard"
        : view === "approvals"
          ? "Pending review"
          : view === "audit"
            ? "Audit logs"
            : view === "reports"
                ? "Compliance reports"
              : "All issues";
  return (
    <>
      <LogoutDialog
        open={logoutOpen}
        busy={logoutBusy}
        error={logoutError}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={signOut}
      />
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="main-shell">
        <header className="topbar">
          <form
            className="global-search"
            role="search"
            onSubmit={submitGlobalSearch}
          >
            <Search size={16} />
            <input
              aria-label="Search issues globally"
              placeholder="Search issues by ID, title, owner..."
              value={globalQuery}
              onChange={(event) => setGlobalQuery(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </form>
          <div className="topbar-actions">
            <Link
              className="icon-button notification-button"
              href="/approvals"
              title="Open approvals"
              aria-label="Open approvals"
            >
              <Bell size={18} />
              {(stats.data?.pendingReview ?? 0) > 0 && (
                <span className="notification-dot" />
              )}
            </Link>
            <span className="topbar-avatar">{initials(session.name)}</span>
            <span className="topbar-user">
              <strong>{session.name}</strong>
              <small>{label(session.role)}</small>
            </span>
            <button
              className="icon-button topbar-signout"
              title="Sign out"
              aria-label="Sign out"
              disabled={busy}
              onClick={() => {
                setLogoutError("");
                setLogoutOpen(true);
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main id="main" className="content">
          {issueId && (
            <Link href={editPage ? `/issues/${issueId}` : "/issues"} className="back-link">
              <ArrowLeft size={15} />
              {editPage ? "Issue details" : "All issues"}
            </Link>
          )}
          <div className={`page-heading${view === "reports" ? " report-page-heading" : ""}`}>
            <div>
              <p className="eyebrow">
                {issueId
                  ? issueId === "new"
                    ? "COMPLIANCE ISSUES / NEW RECORD"
                    : "COMPLIANCE ISSUES / ISSUE RECORD"
                  : view === "dashboard"
                    ? "WORKSPACE / OVERVIEW"
                    : view === "issues"
                      ? "COMPLIANCE / ISSUE REGISTER"
                      : view === "audit"
                        ? "GOVERNANCE / EVENT LEDGER"
                        : view === "reports"
                          ? "WORKSPACE / REPORTING"
                          : "GOVERNANCE / HUMAN APPROVALS"}
              </p>
              <h1>{title}</h1>
              {!issueId && view === "dashboard" && (
                <p className="page-description">
                  Portfolio health and actions requiring attention.
                </p>
              )}
              {!issueId && view === "reports" && (
                <p className="page-description">
                  Current issue state, upcoming deadlines, and recorded activity.
                </p>
              )}
            </div>
            {!issueId && ["dashboard", "issues"].includes(view) && canWrite && (
              <Link className="button primary" href="/issues/new">
                <Plus size={17} />
                Create issue
              </Link>
            )}
            {!issueId && view === "reports" && (
              <div className="report-quick-actions">
                <Link className="button secondary" href="/audit">
                  <HistoryIcon size={15} />
                  View audit log
                </Link>
                <Link className="button primary" href="/issues">
                  <ListTodo size={15} />
                  Browse issues
                </Link>
              </div>
            )}
            {issueId && editPage && issue && canWrite && <span className="edit-version">Version {issue.version}</span>}
            {issueId && !editPage && issue && canWrite && issue.status !== "COMPLETED" && (
              <Link className="button secondary" href={`/issues/${issue.id}/edit`}>
                <Check size={15} />
                Edit issue details
              </Link>
            )}
          </div>
          {message && (
            <div className="notice" role="status">
              <Check size={18} />
              <span>{message}</span>
              <button
                aria-label="Dismiss message"
                className="icon-button"
                onClick={() => setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          {users.error && <Alert>{users.error}</Alert>}
          {!issueId && ["dashboard", "issues", "approvals"].includes(view) && (
            <>
              {view === "dashboard" && (
                <>
                  {stats.error && <Alert>{stats.error}</Alert>}
                  {reports.error && <Alert>{reports.error}</Alert>}
                  <DashboardOverview
                    stats={stats.data}
                    reports={reports.data}
                    issues={attentionIssues}
                    approvals={approvalQueue.data?.items ?? []}
                    loading={stats.loading || reports.loading || approvalQueue.loading}
                    activeTab={attentionTab}
                    onTabChange={setAttentionTab}
                  />
                </>
              )}
              {view !== "dashboard" && <section className="issue-register" aria-label="Issue register">
                <div className="section-heading">
                  <h2>
                    {view === "approvals" ? "Review queue" : "Issue register"}
                  </h2>
                  <span className="count-label">
                    {listing.data?.total ?? "..."} issues
                  </span>
                </div>
                {view === "issues" && (
                  <div className="register-actions">
                    <button
                      className="button secondary compact"
                      disabled={busy || !listing.data}
                      onClick={() =>
                        perform(
                          exportFilteredIssues,
                          "CSV export downloaded.",
                          false,
                        )
                      }
                    >
                      <Download size={15} />
                      Export CSV
                    </button>
                    <div
                      className="view-switch"
                      role="group"
                      aria-label="Issue display mode"
                    >
                      <button
                        className={!compact ? "selected" : ""}
                        aria-pressed={!compact}
                        title="Table view"
                        onClick={() => setCompact(false)}
                      >
                        <Rows3 size={15} />
                        <span>Table</span>
                      </button>
                      <button
                        className={compact ? "selected" : ""}
                        aria-pressed={compact}
                        title="Compact view"
                        onClick={() => setCompact(true)}
                      >
                        <AlignJustify size={15} />
                        <span>Compact</span>
                      </button>
                    </div>
                  </div>
                )}
                <div className="filters">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      type="search"
                      aria-label="Search issues"
                      placeholder="Search issues..."
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  <div className="filter-fields">
                    <ListFilter size={16} className="filter-icon" />
                    {view !== "approvals" && (
                      <SelectField
                        className="filter-select"
                        ariaLabel="Filter by status"
                        value={status}
                        onChange={(value) => {
                          setStatus(value);
                          setPage(1);
                        }}
                        options={[
                          { value: "", label: "All statuses" },
                          ...statuses.map((value) => ({ value, label: label(value) })),
                        ]}
                      />
                    )}
                    <SelectField
                      className="filter-select"
                      ariaLabel="Filter by severity"
                      value={severity}
                      onChange={(value) => {
                        setSeverity(value);
                        setPage(1);
                      }}
                      options={[
                        { value: "", label: "All severities" },
                        ...severities.map((value) => ({ value, label: label(value) })),
                      ]}
                    />
                    <SelectField
                      className="filter-select"
                      ariaLabel="Filter by owner"
                      value={ownerId}
                      onChange={(value) => {
                        setOwnerId(value);
                        setPage(1);
                      }}
                      options={[
                        { value: "", label: "All owners" },
                        ...(users.data
                          ?.filter((user) => user.role !== "VIEWER")
                          .map((user) => ({ value: user.id, label: user.name })) ?? []),
                      ]}
                    />
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={onlyOverdue}
                        onChange={(event) => {
                          setOnlyOverdue(event.target.checked);
                          setPage(1);
                        }}
                      />
                      Overdue
                    </label>
                  </div>
                </div>
                {activeFilters.length > 0 && (
                  <div className="active-filters">
                    <span>ACTIVE FILTERS</span>
                    {activeFilters.map((filter) => (
                      <button
                        key={filter.label}
                        onClick={() => {
                          filter.clear();
                          setPage(1);
                        }}
                      >
                        {filter.label}
                        <X size={12} />
                      </button>
                    ))}
                    <button
                      className="reset-filters"
                      onClick={() => {
                        setQuery("");
                        setGlobalQuery("");
                        setStatus("");
                        setSeverity("");
                        setOwnerId("");
                        setOnlyOverdue(false);
                        setPage(1);
                      }}
                    >
                      Reset filters
                    </button>
                  </div>
                )}
                {listing.error ? (
                  <Alert>{listing.error}</Alert>
                ) : !listing.data ? (
                  <Loading />
                ) : (
                  <>
                    {listing.data.items.length === 0 ? (
                      <div className="empty">
                        <ListTodo size={26} />
                        <h3>No matching issues</h3>
                      </div>
                    ) : (
                      <div
                        className={`table-scroll${compact ? " compact-view" : ""}`}
                      >
                        <table>
                          <thead>
                            <tr>
                              <th>Issue</th>
                              <th>Severity</th>
                              <th>Status</th>
                              <th>Owner</th>
                              <th>Evidence</th>
                              <th>Due date</th>
                              <th>
                                <span className="sr-only">Open issue</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {listing.data.items.map((item) => (
                              <tr key={item.id}>
                                <td>
                                  <Link
                                    className="issue-link"
                                    href={`/issues/${item.id}`}
                                  >
                                    <span className="record-id">
                                      {item.id.startsWith("CW-")
                                        ? item.id
                                        : `CW-${item.id.slice(-6).toUpperCase()}`}
                                    </span>
                                    <strong>{item.title}</strong>
                                  </Link>
                                </td>
                                <td>
                                  <Badge value={item.severity} />
                                </td>
                                <td>
                                  <Badge value={item.status} />
                                </td>
                                <td>
                                  {item.owner ? (
                                    <span className="owner-cell">
                                      <span className="avatar tiny">
                                        {initials(item.owner.name)}
                                      </span>
                                      {item.owner.name}
                                    </span>
                                  ) : (
                                    <span className="muted">Unassigned</span>
                                  )}
                                </td>
                                <td>
                                  <span className="evidence-count">
                                    <Link2 size={13} />
                                    {item._count.evidence}{" "}
                                    {item._count.evidence === 1
                                      ? "link"
                                      : "links"}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={
                                      overdue(item) ? "due overdue-text" : "due"
                                    }
                                  >
                                    {overdue(item) && <Clock3 size={13} />}
                                    {date(item.dueDate)}
                                  </span>
                                </td>
                                <td>
                                  <Link
                                    className="icon-button"
                                    title={`Open ${item.title}`}
                                    aria-label={`Open ${item.title}`}
                                    href={`/issues/${item.id}`}
                                  >
                                    <ArrowRight size={17} />
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="pagination">
                      <span>
                        {listing.data.total === 0
                          ? "0"
                          : `${(page - 1) * 10 + 1}-${Math.min(page * 10, listing.data.total)}`}{" "}
                        of {listing.data.total} issues
                      </span>
                      <div>
                        <button
                          className="icon-button"
                          aria-label="Previous page"
                          title="Previous page"
                          disabled={page === 1 || listing.loading}
                          onClick={() => setPage((value) => value - 1)}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <span>Page {page}</span>
                        <button
                          className="icon-button"
                          aria-label="Next page"
                          title="Next page"
                          disabled={
                            page * 10 >= listing.data.total || listing.loading
                          }
                          onClick={() => setPage((value) => value + 1)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>}
            </>
          )}
          {!issueId && view === "audit" && (
            <section className="module-panel" aria-label="Audit logs">
              <div className="module-heading">
                <div>
                  <p className="eyebrow">GOVERNANCE / EVENT LEDGER</p>
                  <h2>Audit logs</h2>
                  <p>Recorded issue, evidence, and remediation actions.</p>
                </div>
                <span className="count-label">
                  {auditFeed.data?.total ?? "..."} events
                </span>
              </div>
              <div className="audit-metrics">
                <article className="audit-metric">
                  <span>EVENTS MATCHING FILTERS</span>
                  <strong>{auditFeed.data?.total ?? "—"}</strong>
                  <small>Across all result pages</small>
                </article>
                <article className="audit-metric">
                  <span>EVENT TYPES ON THIS PAGE</span>
                  <strong>{auditFeed.data ? new Set(auditFeed.data.items.map((event) => event.action)).size : "—"}</strong>
                  <small>Current page only</small>
                </article>
                <article className="audit-metric">
                  <span>ACTORS ON THIS PAGE</span>
                  <strong>{auditFeed.data ? new Set(auditFeed.data.items.map((event) => event.actor.id)).size : "—"}</strong>
                  <small>Attributed people</small>
                </article>
                <article className="audit-metric audit-integrity">
                  <span>INTEGRITY VERIFICATION</span>
                  <strong>Not configured</strong>
                  <small>No cryptographic or WORM verification</small>
                </article>
              </div>
              <div className="module-filters">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    type="search"
                    aria-label="Search audit logs"
                    placeholder="Search issue, actor, or action..."
                    value={auditQuery}
                    onChange={(event) => {
                      setAuditQuery(event.target.value);
                      setAuditPage(1);
                    }}
                  />
                </label>
                <SelectField
                  className="audit-action-select"
                  ariaLabel="Filter audit action"
                  value={auditAction}
                  onChange={(value) => {
                    setAuditAction(value);
                    setAuditPage(1);
                  }}
                  options={[
                    { value: "", label: "All actions" },
                    ...[
                    "ISSUE_CREATED",
                    "ISSUE_UPDATED",
                    "EVIDENCE_ADDED",
                    "PLAYBOOK_ANALYZED",
                    "PLAN_APPROVED",
                    "PLAN_REJECTED",
                    "PLAN_EXECUTED",
                    ].map((action) => ({ value: action, label: label(action) })),
                  ]}
                />
                <div className="audit-view-switch" role="group" aria-label="Audit display mode">
                  <button type="button" className={auditView === "table" ? "selected" : ""} aria-pressed={auditView === "table"} onClick={() => setAuditView("table")}>
                    <Rows3 size={14} />Table
                  </button>
                  <button type="button" className={auditView === "timeline" ? "selected" : ""} aria-pressed={auditView === "timeline"} onClick={() => setAuditView("timeline")}>
                    <Clock3 size={14} />Timeline
                  </button>
                </div>
                {auditAction && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setAuditAction("");
                      setAuditPage(1);
                    }}
                  >
                    Reset filter
                  </button>
                )}
              </div>
              {auditFeed.error ? (
                <Alert>{auditFeed.error}</Alert>
              ) : !auditFeed.data ? (
                <Loading />
              ) : auditFeed.data.items.length === 0 ? (
                <div className="empty">
                  <HistoryIcon size={25} />
                  <h3>No matching audit events</h3>
                </div>
              ) : (
                <div className="audit-workspace">
                  <div className="audit-event-list">
                    <div className={`table-scroll audit-table-scroll${auditView === "timeline" ? " audit-table-hidden" : ""}`}>
                    <table>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Action</th>
                          <th>Issue</th>
                          <th>Actor</th>
                          <th>Correlation</th>
                          <th>
                            <span className="sr-only">Details</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditFeed.data.items.map((event) => (
                          <tr
                            key={event.id}
                            className={selectedAuditEvent?.id === event.id ? "selected" : ""}
                            onClick={() => setSelectedAuditId(event.id)}
                          >
                            <td className="audit-time">
                              {timestamp(event.createdAt)}
                            </td>
                            <td>
                              <span
                                className={`audit-action ${event.action.toLowerCase()}`}
                              >
                                {label(event.action)}
                              </span>
                            </td>
                            <td>
                              <Link
                                className="audit-issue-link"
                                href={`/issues/${event.issue.id}`}
                                onClick={(click) => click.stopPropagation()}
                              >
                                <span className="record-id">
                                  {event.issue.id}
                                </span>
                                <strong>{event.issue.title}</strong>
                              </Link>
                            </td>
                            <td>
                              {event.actor.name}
                              <small className="audit-actor-role">
                                {label(event.actor.role)}
                              </small>
                            </td>
                            <td>
                              <code className="correlation-id">
                                {event.correlationId}
                              </code>
                            </td>
                            <td>
                              <details className="event-details">
                                <summary
                                  aria-label={`View ${event.action} details`}
                                >
                                  Details
                                </summary>
                                <pre>
                                  {JSON.stringify(event.details, null, 2)}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {auditView === "timeline" && (
                    <ol className="audit-timeline">
                      {auditFeed.data.items.map((event) => (
                        <li key={event.id} className={selectedAuditEvent?.id === event.id ? "selected" : ""}>
                          <span className={`audit-timeline-dot ${event.action.toLowerCase()}`} />
                          <button type="button" className="audit-timeline-item" aria-pressed={selectedAuditEvent?.id === event.id} onClick={() => setSelectedAuditId(event.id)}>
                            <span className="audit-timeline-top"><span className={`audit-action ${event.action.toLowerCase()}`}>{label(event.action)}</span><time>{timestamp(event.createdAt)}</time></span>
                            <strong>{event.issue.id} · {event.issue.title}</strong>
                            <small>{event.actor.name} · {label(event.actor.role)}</small>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                  <div className="pagination">
                    <span>
                      {auditFeed.data.total === 0
                        ? "0"
                        : `${(auditPage - 1) * 25 + 1}-${Math.min(auditPage * 25, auditFeed.data.total)}`}{" "}
                      of {auditFeed.data.total} events
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="Previous audit page"
                        disabled={auditPage === 1 || auditFeed.loading}
                        onClick={() => setAuditPage((value) => value - 1)}
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <span>Page {auditPage}</span>
                      <button
                        className="icon-button"
                        aria-label="Next audit page"
                        disabled={
                          auditPage * 25 >= auditFeed.data.total ||
                          auditFeed.loading
                        }
                        onClick={() => setAuditPage((value) => value + 1)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </div>
                  </div>
                  {selectedAuditEvent && (
                    <aside className="audit-inspector" aria-label="Selected audit event details">
                      <div className="audit-inspector-heading"><div><span>RECORD INSPECTION</span><h3>Event details</h3></div><HistoryIcon size={17} /></div>
                      <span className={`audit-action ${selectedAuditEvent.action.toLowerCase()}`}>{label(selectedAuditEvent.action)}</span>
                      <time className="audit-inspector-time">{timestamp(selectedAuditEvent.createdAt)}</time>
                      <div className="audit-detail-group"><span>TARGET ENTITY & STATE</span><Link href={`/issues/${selectedAuditEvent.issue.id}`}><strong>{selectedAuditEvent.issue.id}</strong><small>{selectedAuditEvent.issue.title}</small><span className="audit-state">{label(selectedAuditEvent.issue.status)} · {label(selectedAuditEvent.issue.severity)}</span></Link></div>
                      <div className="audit-detail-group"><span>ACTOR IDENTITY</span><strong>{selectedAuditEvent.actor.name}</strong><small>{label(selectedAuditEvent.actor.role)}</small></div>
                      <div className="audit-detail-group"><span>CORRELATION ID</span><code>{selectedAuditEvent.correlationId}</code></div>
                      <div className="audit-detail-group"><span>RECORDED DETAILS</span><pre>{JSON.stringify(selectedAuditEvent.details, null, 2)}</pre></div>
                      <div className="audit-integrity-note"><ShieldCheck size={15} /><p>Application audit record. Cryptographic integrity attestation and WORM storage are not configured.</p></div>
                    </aside>
                  )}
                </div>
              )}
            </section>
          )}
          {!issueId && view === "reports" && (
            <section className="module-panel reports-panel" aria-label="Compliance reports">
              {reports.error && <Alert>{reports.error}</Alert>}
              {!reports.data ? (
                <Loading />
              ) : (
                <>
                  <div className="report-metrics">
                    <Metric
                      title="Total issues"
                      value={reports.data.total}
                      icon={<ListTodo size={18} />}
                      href="/issues"
                      description="All registered findings"
                    />
                    <Metric
                      title="Overdue"
                      value={reports.data.overdue}
                      icon={<Clock3 size={18} />}
                      href="/issues?overdue=true"
                      description="Past due, not completed"
                      tone="danger"
                    />
                    <Metric
                      title="Due in 30 days"
                      value={reports.data.dueSoon}
                      icon={<CalendarDays size={18} />}
                      href="/issues"
                      description="Upcoming deadlines"
                      tone="amber"
                    />
                    <Metric
                      title="Audit events"
                      value={reports.data.auditEvents}
                      icon={<HistoryIcon size={18} />}
                      href="/audit"
                      description="Recorded activity"
                      tone="green"
                    />
                  </div>
                  <div className="report-breakdowns">
                    <ReportBreakdown
                      title="Issues by severity"
                      values={reports.data.severity}
                      order={severities}
                      kind="severity"
                    />
                    <ReportBreakdown
                      title="Issues by status"
                      values={reports.data.status}
                      order={statuses}
                      kind="status"
                    />
                  </div>
                  <div className="report-scope-banner">
                    <ShieldCheck size={17} />
                    <span>
                      Counts reflect the current single-workspace issue
                      register. Audit history is application-level and is not
                      tamper-proof storage.
                    </span>
                  </div>
                  <section className="report-activity" aria-label="Recent audit activity">
                    <div className="report-activity-heading">
                      <div>
                        <p className="eyebrow">RECORDED WORKSPACE EVENTS</p>
                        <h2>Recent issue activity</h2>
                      </div>
                      <Link className="text-button" href="/audit">View all activity <ArrowRight size={14} /></Link>
                    </div>
                    {reportActivity.error ? (
                      <Alert>{reportActivity.error}</Alert>
                    ) : !reportActivity.data ? (
                      <Loading />
                    ) : reportActivity.data.items.length === 0 ? (
                      <div className="empty"><HistoryIcon size={22} /><p>No issue activity recorded yet.</p></div>
                    ) : (
                      <div className="table-scroll report-ledger">
                        <table>
                          <thead>
                            <tr><th>Event</th><th>Issue</th><th>Actor</th><th>Recorded</th><th>Correlation ID</th></tr>
                          </thead>
                          <tbody>
                            {reportActivity.data.items.map((event) => (
                              <tr key={event.id}>
                                <td><span className={`audit-action ${event.action.toLowerCase()}`}>{label(event.action)}</span></td>
                                <td><Link className="report-issue-link" href={`/issues/${event.issue.id}`}><strong>{event.issue.id}</strong><span>{event.issue.title}</span></Link></td>
                                <td><span className="report-actor">{event.actor.name}</span><small className="audit-actor-role">{label(event.actor.role)}</small></td>
                                <td className="report-ledger-time">{timestamp(event.createdAt)}</td>
                                <td><code className="correlation-id">{event.correlationId}</code></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                  <div className="report-footer">
                    <span className="report-generated">Updated {timestamp(reports.data.generatedAt)}</span>
                    <Link className="text-button" href="/audit">Open audit log <ArrowRight size={14} /></Link>
                  </div>
                </>
              )}
            </section>
          )}
          {issueId === "new" &&
            (canWrite ? (
              <section className="editor-section">
                <div className="editor-intro">
                  <div>
                    <span className="draft-protocol">Draft protocol</span>
                    <p>
                      Create the finding record first. Add evidence references and request independent review after remediation is documented.
                    </p>
                  </div>
                  <span className="reviewer-note"><UsersRound size={15} /> Human approval required for closure</span>
                </div>
                <div className="editor-layout">
                  <IssueForm
                    users={users.data ?? []}
                    busy={busy}
                    onSubmit={(body) =>
                      perform(async () => {
                        const created = await api<Issue>("issues", "POST", body);
                        router.push(`/issues/${created.id}`);
                      }, "Issue created.")
                    }
                  />
                  <aside className="editor-aside">
                    <section className="editor-side-panel">
                      <div className="editor-side-heading"><ShieldCheck size={16} /><h2>Resolution gate</h2></div>
                      <div className="editor-side-callout"><LockKeyhole size={16} /><p>A completed status cannot be set during issue creation. Closure requires evidence and a separate approver.</p></div>
                      <div className="lifecycle-state"><span className="status-dot open" /><div><strong>Open</strong><small>Initial operating status</small></div><Badge value="OPEN" /></div>
                    </section>
                    <section className="editor-side-panel">
                      <div className="editor-side-heading"><Link2 size={16} /><h2>Evidence references</h2></div>
                      <p>Add HTTP(S) evidence links from the issue detail page after creating the record. References are not fetched or independently verified.</p>
                    </section>
                    <section className="editor-side-panel">
                      <div className="editor-side-heading"><Clock3 size={16} /><h2>Due-date tracking</h2></div>
                      <p>Overdue status is based on the UTC calendar date. Set a target date appropriate to the finding’s severity.</p>
                    </section>
                  </aside>
                </div>
              </section>
            ) : (
              <Alert>Your role cannot create issues.</Alert>
            ))}
          {issueId && editPage && issue && (
            canWrite && issue.status !== "COMPLETED" ? (
              <section className="editor-section">
                <div className="editor-intro">
                  <div>
                    <span className="draft-protocol">Versioned update</span>
                    <p>Changes increment the issue version and may invalidate pending remediation approvals.</p>
                  </div>
                  <Badge value={issue.status} />
                </div>
                <div className="editor-layout">
                  <IssueForm
                    issue={issue}
                    users={users.data ?? []}
                    busy={busy}
                    onSubmit={(body) => perform(async () => {
                      await api(`issues/${issue.id}`, "PATCH", body);
                      router.push(`/issues/${issue.id}`);
                    }, "Issue updated. Earlier proposals may now be stale.")}
                  />
                  <aside className="editor-aside">
                    <section className="editor-side-panel">
                      <div className="editor-side-heading"><ShieldCheck size={16} /><h2>Resolution gate</h2></div>
                      <div className="editor-side-callout"><LockKeyhole size={16} /><p>Completed status cannot be set here. An independent approver must authorize a current proposal.</p></div>
                    </section>
                    <section className="editor-side-panel">
                      <div className="editor-side-heading"><HistoryIcon size={16} /><h2>Approval integrity</h2></div>
                      <p>Editing issue details increments the version. Any prior approval for a different version can no longer be executed.</p>
                    </section>
                  </aside>
                </div>
              </section>
            ) : (
              <section className="module-panel" aria-label="Completed issue">
                <h2>This issue cannot be edited</h2>
                <p>Completed issues are read-only. Reopen or correction workflows are not configured in this demo.</p>
              </section>
            )
          )}
          {issueId && issueId !== "new" && !editPage && (
            <>
              {detail.error && <Alert>{detail.error}</Alert>}
              {!issue && !detail.error && <Loading />}
              {issue && (
                <>
                  <div className="issue-title">
                    <span className="record-id">
                      {issue.id.startsWith("CW-")
                        ? issue.id
                        : `CW-${issue.id.slice(-6).toUpperCase()}`}
                    </span>
                    <h2>{issue.title}</h2>
                    <div className="issue-title-meta">
                      <Badge value={issue.severity} />
                      <Badge value={issue.status} />
                      <span className="muted">Version {issue.version}</span>
                      {overdue(issue) && (
                        <span className="overdue-text">
                          <Clock3 size={14} />
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="description">{issue.description}</p>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-main">
                      <section className="detail-section">
                        <div className="section-heading">
                          <h2>
                            <Link2 size={18} />
                            Evidence
                          </h2>
                          <span className="count-label">
                            {issue.evidence.length} references
                          </span>
                        </div>
                        {issue.evidence.length === 0 ? (
                          <p className="muted section-empty">
                            No evidence attached.
                          </p>
                        ) : (
                          <ul className="evidence-list">
                            {issue.evidence.map((evidence) => (
                              <li key={evidence.id}>
                                <FileCheck2 size={19} />
                                <div>
                                  <a
                                    href={evidence.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {evidence.description}
                                    <ExternalLink size={13} />
                                  </a>
                                  <small>
                                    {evidence.submitter.name} &middot;{" "}
                                    {date(evidence.createdAt)}
                                  </small>
                                  <span className="evidence-url">
                                    {evidence.url}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        {canWrite && issue.status !== "COMPLETED" && (
                          <form
                            className="evidence-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = event.currentTarget;
                              const data = new FormData(form);
                              void perform(async () => {
                                await api(
                                  `issues/${issue.id}/evidence`,
                                  "POST",
                                  {
                                    url: data.get("url"),
                                    description: data.get("description"),
                                    version: issue.version,
                                  },
                                );
                                form.reset();
                              }, "Evidence reference attached.");
                            }}
                          >
                            <label>
                              Evidence URL
                              <input
                                name="url"
                                type="url"
                                placeholder="https://"
                                required
                                maxLength={2048}
                              />
                            </label>
                            <label>
                              Description
                              <input
                                name="description"
                                placeholder="Signed access review, November"
                                required
                                minLength={5}
                                maxLength={1000}
                              />
                            </label>
                            <button
                              className="button secondary"
                              disabled={busy}
                            >
                              <Plus size={16} />
                              Attach reference
                            </button>
                          </form>
                        )}
                      </section>
                      <section className="detail-section">
                        <div className="section-heading">
                          <h2>
                            <Sparkles size={18} />
                            Remediation playbook
                          </h2>
                          {canWrite && issue.status !== "COMPLETED" && (
                            <button
                              className="button secondary compact"
                              disabled={busy}
                              onClick={() =>
                                perform(
                                  () =>
                                    api(`issues/${issue.id}/analyze`, "POST", {
                                      version: issue.version,
                                    }),
                                  "Analysis recorded.",
                                )
                              }
                            >
                              <Play size={14} />
                              Run analysis
                            </button>
                          )}
                        </div>
                        {issue.runs.length === 0 && (
                          <p className="muted section-empty">
                            No analysis recorded.
                          </p>
                        )}
                        {issue.runs.map((run) => (
                          <Proposal
                            key={run.id}
                            run={run}
                            issue={issue}
                            session={session}
                            busy={busy}
                            onReview={(approved, note) =>
                              perform(
                                () =>
                                  api(`plans/${run.id}/review`, "POST", {
                                    approved,
                                    note,
                                  }),
                                approved
                                  ? "Proposal approved. It can now be executed."
                                  : "Proposal rejected.",
                              )
                            }
                            onExecute={() =>
                              perform(
                                () => api(`plans/${run.id}/execute`, "POST"),
                                "Approved plan executed. Issue completed.",
                              )
                            }
                          />
                        ))}
                      </section>
                      <section className="detail-section">
                        <div className="section-heading">
                          <h2>
                            <Clock3 size={18} />
                            Audit trail
                          </h2>
                          <span className="count-label">Latest activity</span>
                        </div>
                        {history.error && <Alert>{history.error}</Alert>}
                        {history.loading && !history.data && <Loading />}
                        <ol className="audit-list">
                          {[...(history.data?.items ?? []), ...olderAudit].map(
                            (event) => (
                              <li key={event.id}>
                                <span className="audit-dot" />
                                <div>
                                  <strong>{label(event.action)}</strong>
                                  <p>
                                    {event.actor.name}
                                    <span>
                                      {" "}
                                      &middot; {timestamp(event.createdAt)}
                                    </span>
                                  </p>
                                  <details>
                                    <summary>Event details</summary>
                                    <pre>
                                      {JSON.stringify(
                                        {
                                          ...(event.details as object),
                                          correlationId: event.correlationId,
                                        },
                                        null,
                                        2,
                                      )}
                                    </pre>
                                  </details>
                                </div>
                              </li>
                            ),
                          )}
                        </ol>
                        {(auditCursor === undefined
                          ? history.data?.nextCursor
                          : auditCursor) && (
                          <button
                            className="button secondary compact"
                            disabled={busy}
                            onClick={() =>
                              perform(
                                async () => {
                                  const cursor =
                                    auditCursor === undefined
                                      ? history.data?.nextCursor
                                      : auditCursor;
                                  const next = await api<Audit>(
                                    `issues/${issue.id}/audit?cursor=${cursor}`,
                                  );
                                  setOlderAudit((previous) => [
                                    ...previous,
                                    ...next.items,
                                  ]);
                                  setAuditCursor(next.nextCursor);
                                },
                                "Earlier events loaded.",
                                false,
                              )
                            }
                          >
                            Load earlier events
                          </button>
                        )}
                      </section>
                    </div>
                    <aside className="issue-properties">
                      <div className="section-heading">
                        <h2>Issue properties</h2>
                      </div>
                      <dl>
                          <dt>Owner</dt>
                          <dd>{issue.owner?.name ?? "Unassigned"}</dd>
                          <dt>Due date</dt>
                          <dd>{date(issue.dueDate)}</dd>
                          <dt>Severity</dt>
                          <dd>
                            <Badge value={issue.severity} />
                          </dd>
                          <dt>Status</dt>
                          <dd>
                            <Badge value={issue.status} />
                          </dd>
                          <dt>Created</dt>
                          <dd>{date(issue.createdAt)}</dd>
                      </dl>
                      {canWrite && issue.status !== "COMPLETED" && (
                        <Link className="button secondary issue-edit-link" href={`/issues/${issue.id}/edit`}>
                          <Check size={15} /> Edit issue details
                        </Link>
                      )}
                    </aside>
                  </div>
                </>
              )}
            </>
          )}
          <footer className="content-footer">
            <span>
              <ShieldCheck size={14} />
              Compliwise
            </span>
            <span>Compliance issue register</span>
          </footer>
        </main>
      </div>
    </>
  );
}

function DashboardOverview({
  stats,
  reports,
  issues,
  approvals,
  loading,
  activeTab,
  onTabChange,
}: {
  stats?: Counts;
  reports?: ReportData;
  issues: Counts["attention"];
  approvals: IssueList["items"];
  loading: boolean;
  activeTab: "critical" | "review" | "sla";
  onTabChange: (tab: "critical" | "review" | "sla") => void;
}) {
  const priorityIssues = issues.filter((issue) => {
    if (activeTab === "review") return issue.status === "PENDING_REVIEW";
    if (activeTab === "sla") return overdue(issue);
    return issue.severity === "CRITICAL" || overdue(issue);
  });
  const severityTotal = severities.reduce(
    (total, severity) => total + (reports?.severity[severity] ?? 0),
    0,
  );
  const severityTabs = [
    { key: "CRITICAL", label: "Critical" },
    { key: "HIGH", label: "High" },
    { key: "MEDIUM", label: "Medium" },
    { key: "LOW", label: "Low" },
  ];
  const tabs = [
    { key: "critical" as const, label: "Critical & overdue", count: issues.filter((issue) => issue.severity === "CRITICAL" || overdue(issue)).length },
    { key: "review" as const, label: "Awaiting review", count: stats?.pendingReview ?? 0 },
    { key: "sla" as const, label: "Overdue", count: stats?.overdue ?? 0 },
  ];

  return (
    <div className="dashboard-overview">
      <div className="dashboard-metrics" aria-label="Compliance issue metrics">
        <Metric title="Open issues" value={stats?.open} icon={<ListTodo size={19} />} href="/issues" description="All unresolved issues" />
        <Metric title="Overdue" value={stats?.overdue} icon={<Clock3 size={19} />} href="/issues?overdue=true" description="Past the due date" tone="danger" />
        <Metric title="Completed" value={stats?.completed} icon={<CheckCheck size={19} />} href="/issues?status=COMPLETED" description="Tracked as completed" tone="green" />
      </div>

      <section className="severity-triage" aria-label="Issue severity distribution">
        <div className="severity-triage-title"><ListFilter size={15} /><strong>Issue severity distribution</strong><span>({severityTotal} tracked)</span></div>
        <div className="severity-triage-items">
          {severityTabs.map(({ key, label: severityLabel }) => (
            <Link href={`/issues?severity=${key}`} className={`severity-summary ${key.toLowerCase()}`} key={key}>
              <span className="severity-marker" />{severityLabel} ({reports?.severity[key] ?? 0})
            </Link>
          ))}
        </div>
        <div className="severity-track" aria-hidden="true">
          {severityTabs.map(({ key }) => {
            const count = reports?.severity[key] ?? 0;
            return <span className={key.toLowerCase()} key={key} style={{ width: `${severityTotal ? (count / severityTotal) * 100 : 0}%` }} />;
          })}
        </div>
      </section>

      <div className="dashboard-main-grid">
        <section className="attention-panel" aria-label="Needs attention">
          <div className="attention-panel-heading">
            <div className="attention-title"><ShieldCheck size={18} /><div><h2>Needs attention</h2><p>{stats?.open ?? 0} open items requiring action</p></div></div>
            <div className="attention-tabs" role="group" aria-label="Filter priority issues">
              {tabs.map((tab) => <button key={tab.key} className={activeTab === tab.key ? "selected" : ""} aria-pressed={activeTab === tab.key} onClick={() => onTabChange(tab.key)}><span>{tab.label}</span><strong>{tab.count}</strong></button>)}
            </div>
          </div>
          {loading && !stats ? <Loading /> : priorityIssues.length === 0 ? (
            <p className="attention-empty">No issues match this priority view.</p>
          ) : (
            <div className="table-scroll dashboard-table-scroll">
              <table className="dashboard-issue-table">
                <thead><tr><th>Issue ID & title</th><th>Severity</th><th>Owner</th><th>Due / SLA</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>{priorityIssues.map((issue) => (
                  <tr key={issue.id}>
                    <td><Link className="dashboard-issue-link" href={`/issues/${issue.id}`}><span className="record-id">{issue.id}</span><strong>{issue.title}</strong></Link></td>
                    <td><Badge value={issue.severity} /></td>
                    <td><span className="dashboard-owner"><span className="avatar tiny">{issue.owner ? initials(issue.owner.name) : "?"}</span>{issue.owner?.name ?? "Unassigned"}</span></td>
                    <td><span className={overdue(issue) ? "due overdue-text" : "due"}>{overdue(issue) && <Clock3 size={13} />}{date(issue.dueDate)}{overdue(issue) && <small className="overdue-caption">Past due</small>}</span></td>
                    <td><Badge value={issue.status} /></td>
                    <td><Link className="button secondary compact" href={`/issues/${issue.id}`}>{issue.status === "PENDING_REVIEW" ? "Review" : "Open"}<ArrowRight size={13} /></Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="attention-panel-footer"><span>Showing {priorityIssues.length} priority items</span><Link href="/issues">View all issues <ArrowRight size={14} /></Link></div>
        </section>

        <aside className="dashboard-side-panels">
          <section className="approval-panel" aria-label="Pending human approvals">
            <div className="side-panel-heading"><div><ClipboardCheck size={17} /><h2>Pending approvals</h2></div><span className="count-label">{stats?.pendingReview ?? 0} queued</span></div>
            <p className="side-panel-description">Human review is required before a remediation proposal can execute.</p>
            {approvals.slice(0, 3).map((issue) => <Link className="approval-queue-item" key={issue.id} href={`/issues/${issue.id}`}><span className="record-id">{issue.id} · {issue.owner?.name ?? "Unassigned"}</span><strong>{issue.title}</strong><span>Review evidence <ArrowRight size={13} /></span></Link>)}
            {approvals.length === 0 && <p className="queue-empty">No proposals are awaiting review.</p>}
            <Link className="button secondary compact queue-link" href="/approvals">Go to approvals queue <ArrowRight size={13} /></Link>
          </section>

          <section className="mcp-status-panel" aria-label="MCP safeguards">
            <div className="side-panel-heading"><div><SearchCheck size={17} /><h2>MCP agent tools</h2></div><span className="mcp-scope-indicator">Scoped stdio</span></div>
            <p>Agents can inspect issues and prepare remediation proposals. A human approver must authorize completion.</p>
            <div className="mcp-guardrail"><LockKeyhole size={15} /><span>No agent self-approval. Actions are version-checked and audited.</span></div>
            <Link href="/audit" className="mcp-audit-link">View audit log <ArrowRight size={13} /></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({
  title,
  value,
  icon,
  href,
  description,
  tone = "neutral",
}: {
  title: string;
  value?: number;
  icon: ReactNode;
  href: string;
  description: string;
  tone?: string;
}) {
  return (
    <Link href={href} className={`metric ${tone}`}>
      <div className="metric-label">
        {title}
        <span>{icon}</span>
      </div>
      <strong>
        {value ?? <span className="skeleton-number">&nbsp;</span>}
      </strong>
      <div className="metric-footer">
        <span>{description}</span>
        <ArrowDownLeft size={15} />
      </div>
    </Link>
  );
}

function ReportBreakdown({
  title,
  values,
  order,
  kind,
}: {
  title: string;
  values: Record<string, number>;
  order: string[];
  kind: "severity" | "status";
}) {
  const maximum = Math.max(1, ...Object.values(values));
  return (
    <section className="report-breakdown">
      <h3>{title}</h3>
      <div className="report-bars">
        {order.map((key) => {
          const value = values[key] ?? 0;
          return (
            <Link
              className="report-bar-row"
              href={`/issues?${kind}=${key}`}
              key={key}
            >
              <span className="report-bar-label">
                <Badge value={key} />
              </span>
              <span className="report-track">
                <span style={{ width: `${(value / maximum) * 100}%` }} />
              </span>
              <strong>{value}</strong>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function IssueForm({
  issue,
  users,
  busy,
  onSubmit,
}: {
  issue?: Issue;
  users: User[];
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [ownerId, setOwnerId] = useState(issue?.ownerId ?? "");
  const [issueStatus, setIssueStatus] = useState(issue?.status ?? statuses[0]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    onSubmit({
      ...data,
      ownerId: data.ownerId || null,
      ...(issue ? { version: issue.version } : {}),
    });
  }
  return (
    <form className={`issue-form${issue ? " is-edit" : " is-create"}`} onSubmit={submit}>
      {!issue && (
        <div className="editor-card-heading">
          <div>
            <FileCheck2 size={17} />
            <h2>Deficiency specification</h2>
          </div>
          <span>ISSUE DETAILS</span>
        </div>
      )}
      <fieldset disabled={busy}>
        <label className="title-field">
          Issue title <span className="required-mark">*</span>
          <input
            name="title"
            aria-label="Title"
            defaultValue={issue?.title}
            required
            minLength={5}
            maxLength={160}
            placeholder="Summarize the control deficiency and affected system"
          />
          <small>Specify the target environment and scope of the deviation.</small>
        </label>
        <fieldset className="severity-field" aria-label="Severity">
          <legend>Risk severity <span className="required-mark">*</span></legend>
          <div className="severity-options">
            {severities.slice().reverse().map((value) => (
              <label className={`severity-option ${value.toLowerCase()}`} key={value}>
                <input type="radio" name="severity" value={value} defaultChecked={value === (issue?.severity ?? "HIGH")} required />
                <span className="severity-option-mark" />
                <span><strong>{label(value)}</strong><small>{severityDescriptions[value]}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="issue-owner-due">
          <label>
            Designated owner <span className="field-optional">Optional</span>
            <SelectField
              className="form-select"
              ariaLabel="Owner"
              name="ownerId"
              value={ownerId}
              onChange={setOwnerId}
              options={[
                { value: "", label: "Unassigned" },
                ...users
                  .filter(
                    (user) => user.role === "ANALYST" || user.role === "APPROVER",
                  )
                  .map((user) => ({ value: user.id, label: user.name })),
              ]}
            />
          </label>
          <label>
            Target resolution date <span className="required-mark">*</span>
            <input
              aria-label="Target resolution date"
              name="dueDate"
              type="date"
              defaultValue={issue?.dueDate.slice(0, 10)}
              required
            />
          </label>
        </div>
        <label className="description-field">
          Detailed finding and context <span className="required-mark">*</span>
          <textarea
            name="description"
            aria-label="Description"
            defaultValue={issue?.description}
            required
            minLength={10}
            maxLength={10000}
            rows={issue ? 5 : 7}
            placeholder="Describe the observed control gap, affected assets, impact, and known remediation context."
          />
          <small>Include enough context for an independent reviewer to assess the finding.</small>
        </label>
        {issue && (
          <label>
            Status
            <SelectField
              className="form-select"
              ariaLabel="Status"
              name="status"
              value={issueStatus}
              onChange={setIssueStatus}
              options={statuses
                .filter((value) => value !== "COMPLETED")
                .map((value) => ({ value, label: label(value) }))}
            />
          </label>
        )}
        <div className="editor-form-actions">
          {!issue && (
            <Link className="button secondary" href="/issues">
              <X size={15} />
              Cancel
            </Link>
          )}
          <button className="button primary" type="submit">
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : issue ? (
              <Check size={16} />
            ) : (
              <Plus size={16} />
            )}
            {issue ? "Save changes" : "Save and register issue"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function Proposal({
  run,
  issue,
  session,
  busy,
  onReview,
  onExecute,
}: {
  run: Issue["runs"][number];
  issue: Issue;
  session: User;
  busy: boolean;
  onReview: (approved: boolean, note: string) => Promise<boolean>;
  onExecute: () => void;
}) {
  const [note, setNote] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const findings =
    run.findings &&
    typeof run.findings === "object" &&
    !Array.isArray(run.findings)
      ? run.findings
      : {};
  const recommendations = stringArray(findings.recommendations ?? run.findings);
  const blockers = stringArray(findings.blockers);
  const stale =
    run.state !== "EXECUTED" && run.analyzedVersion !== issue.version;
  const canReview =
    session.role === "APPROVER" &&
    run.requesterId !== session.id &&
    run.state === "PROPOSED" &&
    !stale;
  return (
    <article className="proposal">
      <div className="proposal-heading">
        <Badge value={stale ? "STALE" : run.state} />
        <span className="muted">Version {run.analyzedVersion}</span>
      </div>
      <small className="proposal-byline">
        {run.requester.name} &middot; {timestamp(run.createdAt)}
      </small>
      {blockers.length > 0 && (
        <div className="blockers">
          <strong>Required before review</strong>
          <ul>
            {blockers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <details open={run.state === "PROPOSED" || run.state === "BLOCKED"}>
        <summary>Recommendations</summary>
        <ul className="recommendations">
          {recommendations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
      {stringArray(run.actions).length > 0 && (
        <div className="proposed-action">
          <ArrowRight size={15} />
          <span>
            Proposed change: <strong>Mark issue completed</strong>
          </span>
        </div>
      )}
      {stale && (
        <p className="stale-note">
          Issue changed after analysis. A new analysis and approval are
          required.
        </p>
      )}
      {run.approval && (
        <div className="approval-record">
          <CheckCheck size={16} />
          <div>
            <strong>
              {run.approval.approved ? "Approved" : "Rejected"} by{" "}
              {run.approval.reviewer.name}
            </strong>
            <p>{run.approval.note}</p>
          </div>
        </div>
      )}
      {canReview && (
        <div className="review-form">
          <label htmlFor={`note-${run.id}`}>
            Approval rationale
            <textarea
              id={`note-${run.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              minLength={10}
              maxLength={2000}
              rows={3}
              placeholder="Explain why the evidence supports this closure."
            />
          </label>
          <div className="review-actions">
            <button
              className="button danger-outline"
              type="button"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
            >
              <X size={15} />
              Reject proposal
            </button>
            <button
              className="button primary"
              type="button"
              disabled={busy || note.trim().length < 10}
              onClick={() => onReview(true, note)}
            >
              <Check size={15} />
              Approve closure
            </button>
          </div>
        </div>
      )}
      <RejectProposalDialog
        open={rejectOpen}
        proposalId={run.id}
        issueId={issue.id}
        issueTitle={issue.title}
        severity={label(issue.severity)}
        dueDate={date(issue.dueDate)}
        requester={run.requester.name}
        busy={busy}
        onCancel={() => setRejectOpen(false)}
        onConfirm={(reason, rejectionNote) =>
          onReview(false, `${reason}: ${rejectionNote}`)
        }
      />
      {run.state === "PROPOSED" && run.requesterId === session.id && !stale && (
        <p className="muted">Awaiting an independent approver.</p>
      )}
      {run.state === "APPROVED" && !stale && session.role !== "VIEWER" && (
        <button className="button primary" disabled={busy} onClick={onExecute}>
          <Play size={15} />
          Execute approved plan
        </button>
      )}
      {run.state === "EXECUTED" && (
        <p className="executed-label">
          <CheckCheck size={16} />
          Executed {run.executedAt ? timestamp(run.executedAt) : ""}
        </p>
      )}
    </article>
  );
}
