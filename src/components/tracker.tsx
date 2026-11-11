"use client";

import {
  useDeferredValue,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LoginForm, LogoutDialog } from "./session-controls.tsx";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  LayoutDashboard,
  Link2,
  ListFilter,
  ListTodo,
  LoaderCircle,
  LogOut,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type {
  dashboard,
  getAudit,
  getIssue,
  listIssues,
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
type Counts = Awaited<ReturnType<typeof dashboard>>;
type User = {
  id: string;
  name: string;
  role: "VIEWER" | "ANALYST" | "APPROVER";
};
type View = "dashboard" | "issues" | "approvals";
const statuses = ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"];
const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
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

export function Tracker({
  view,
  issueId,
  initialStatus = "",
  initialOverdue = false,
  loginPage = false,
  returnTo = "/",
}: {
  view: View;
  issueId?: string;
  initialStatus?: string;
  initialOverdue?: boolean;
  loginPage?: boolean;
  returnTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<User | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState(initialStatus);
  const [severity, setSeverity] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(initialOverdue);
  const [page, setPage] = useState(1);
  useEffect(() => {
    api<User>("auth/session")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setSessionLoaded(true));
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
    session && view === "dashboard" && !issueId ? "dashboard" : null,
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
    session && !issueId ? `issues?${filters}` : null,
    revision,
  );
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

  async function perform(
    operation: () => Promise<unknown>,
    success: string,
    refresh = true,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      setMessage(success);
      if (refresh) setRevision((value) => value + 1);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The operation failed.",
      );
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
  const title =
    issueId === "new"
      ? "Create an issue"
      : issueId
        ? "Issue details"
        : view === "dashboard"
          ? "Compliance overview"
          : view === "approvals"
            ? "Pending review"
            : "All issues";
  return (
    <div className="app-shell">
      <LogoutDialog
        open={logoutOpen}
        name={session.name}
        busy={logoutBusy}
        error={logoutError}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={signOut}
      />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <ShieldCheck size={27} strokeWidth={1.7} />
          <span>
            compliwise<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">CW</span>
          <span>
            <strong>Compliance workspace</strong>
            <small>Internal operations</small>
          </span>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <Link
            className={view === "dashboard" ? "active" : ""}
            href="/"
            aria-current={view === "dashboard" ? "page" : undefined}
          >
            <LayoutDashboard size={18} />
            Overview
          </Link>
          <Link
            className={view === "issues" ? "active" : ""}
            href="/issues"
            aria-current={view === "issues" ? "page" : undefined}
          >
            <ListTodo size={18} />
            Issues
          </Link>
          <Link
            className={view === "approvals" ? "active" : ""}
            href="/approvals"
            aria-current={view === "approvals" ? "page" : undefined}
          >
            <ClipboardCheck size={18} />
            Pending review
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="environment">
            <span />
            Development demo
          </div>
          <div className="profile">
            <span className="avatar small">{initials(session.name)}</span>
            <div>
              <strong>{session.name}</strong>
              <small>{label(session.role)}</small>
            </div>
            <button
              className="icon-button"
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
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="topbar-label">Workspace</span>
            <ChevronRight size={14} />
            <span>{issueId ? "Issues" : title}</span>
          </div>
          <span className="topbar-date">{date(new Date().toISOString())}</span>
        </header>
        <main id="main" className="content">
          {issueId && (
            <Link href="/issues" className="back-link">
              <ArrowLeft size={15} />
              All issues
            </Link>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {issueId
                  ? "ISSUE REGISTER"
                  : view === "dashboard"
                    ? "WORKSPACE / OVERVIEW"
                    : "COMPLIANCE / ISSUE REGISTER"}
              </p>
              <h1>{title}</h1>
            </div>
            {!issueId && canWrite && (
              <Link className="button primary" href="/issues/new">
                <Plus size={17} />
                Create issue
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
          {!issueId && (
            <>
              {view === "dashboard" && (
                <>
                  {stats.error && <Alert>{stats.error}</Alert>}
                  <div className="metrics" aria-label="Issue metrics">
                    <Metric
                      title="Open issues"
                      value={stats.data?.open}
                      icon={<ListTodo size={19} />}
                      href="/issues"
                      description="All unresolved issues"
                    />
                    <Metric
                      title="Overdue"
                      value={stats.data?.overdue}
                      icon={<Clock3 size={19} />}
                      href="/issues?overdue=true"
                      description="Past the due date"
                      tone="danger"
                    />
                    <Metric
                      title="Pending review"
                      value={stats.data?.pendingReview}
                      icon={<ClipboardCheck size={19} />}
                      href="/approvals"
                      description="Awaiting a decision"
                      tone="amber"
                    />
                    <Metric
                      title="Completed"
                      value={stats.data?.completed}
                      icon={<CheckCheck size={19} />}
                      href="/issues?status=COMPLETED"
                      description="Approved and closed"
                      tone="green"
                    />
                  </div>
                </>
              )}
              <section className="issue-register" aria-label="Issue register">
                <div className="section-heading">
                  <h2>
                    {view === "dashboard"
                      ? "Issue register"
                      : view === "approvals"
                        ? "Review queue"
                        : "Issue register"}
                  </h2>
                  <span className="count-label">
                    {listing.data?.total ?? "..."} issues
                  </span>
                </div>
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
                      <select
                        aria-label="Filter by status"
                        value={status}
                        onChange={(event) => {
                          setStatus(event.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">All statuses</option>
                        {statuses.map((value) => (
                          <option key={value} value={value}>
                            {label(value)}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      aria-label="Filter by severity"
                      value={severity}
                      onChange={(event) => {
                        setSeverity(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All severities</option>
                      {severities.map((value) => (
                        <option key={value} value={value}>
                          {label(value)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter by owner"
                      value={ownerId}
                      onChange={(event) => {
                        setOwnerId(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All owners</option>
                      {users.data
                        ?.filter((user) => user.role !== "VIEWER")
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                    </select>
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
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Issue</th>
                              <th>Severity</th>
                              <th>Status</th>
                              <th>Owner</th>
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
              </section>
            </>
          )}
          {issueId === "new" &&
            (canWrite ? (
              <section className="editor-section">
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
              </section>
            ) : (
              <Alert>Your role cannot create issues.</Alert>
            ))}
          {issueId && issueId !== "new" && (
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
                      {canWrite && issue.status !== "COMPLETED" ? (
                        <IssueForm
                          key={issue.version}
                          issue={issue}
                          users={users.data ?? []}
                          busy={busy}
                          onSubmit={(body) =>
                            perform(
                              () => api(`issues/${issue.id}`, "PATCH", body),
                              "Issue updated. Earlier proposals may now be stale.",
                            )
                          }
                        />
                      ) : (
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
    <form className="issue-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>
          Title
          <input
            name="title"
            defaultValue={issue?.title}
            required
            minLength={5}
            maxLength={160}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={issue?.description}
            required
            minLength={10}
            maxLength={10000}
            rows={issue ? 5 : 6}
          />
        </label>
        <label>
          Severity
          <select
            aria-label="Severity"
            name="severity"
            defaultValue={issue?.severity ?? "MEDIUM"}
          >
            {severities.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select
            aria-label="Owner"
            name="ownerId"
            defaultValue={issue?.ownerId ?? ""}
          >
            <option value="">Unassigned</option>
            {users
              .filter(
                (user) => user.role === "ANALYST" || user.role === "APPROVER",
              )
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Due date
          <input
            name="dueDate"
            type="date"
            defaultValue={issue?.dueDate.slice(0, 10)}
            required
          />
        </label>
        {issue && (
          <label>
            Status
            <select
              aria-label="Status"
              name="status"
              defaultValue={issue.status}
            >
              {statuses
                .filter((value) => value !== "COMPLETED")
                .map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <button className="button primary" type="submit">
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : issue ? (
            <Check size={16} />
          ) : (
            <Plus size={16} />
          )}
          {issue ? "Save changes" : "Create issue"}
        </button>
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
  onReview: (approved: boolean, note: string) => void;
  onExecute: () => void;
}) {
  const [note, setNote] = useState("");
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
            Review decision note
            <textarea
              id={`note-${run.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              minLength={10}
              maxLength={2000}
              rows={3}
            />
          </label>
          <div className="review-actions">
            <button
              className="button secondary"
              disabled={busy || note.trim().length < 10}
              onClick={() => onReview(false, note)}
            >
              <X size={15} />
              Reject
            </button>
            <button
              className="button primary"
              disabled={busy || note.trim().length < 10}
              onClick={() => onReview(true, note)}
            >
              <Check size={15} />
              Approve closure
            </button>
          </div>
        </div>
      )}
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
