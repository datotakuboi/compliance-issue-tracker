"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Eye,
  FileCheck2,
  FileWarning,
  GitCompare,
  History,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  X,
} from "lucide-react";

type AccountRole = "VIEWER" | "ANALYST" | "APPROVER";
type Account = { id: string; name: string; role: AccountRole };

const roleDetails: Record<
  AccountRole,
  {
    title: string;
    description: string;
    capabilities: { icon: typeof Eye; label: string }[];
  }
> = {
  VIEWER: {
    title: "Viewer",
    description: "Inspect issues, evidence references, and the audit history.",
    capabilities: [
      { icon: Eye, label: "Read-only access" },
      { icon: History, label: "Audit history" },
    ],
  },
  ANALYST: {
    title: "Analyst",
    description:
      "Manage issues, attach evidence references, and request reviews.",
    capabilities: [
      { icon: Link2, label: "Evidence references" },
      { icon: FileCheck2, label: "Remediation proposals" },
    ],
  },
  APPROVER: {
    title: "Approver",
    description:
      "Review evidence and independently approve or reject proposals.",
    capabilities: [
      { icon: ClipboardCheck, label: "Independent review" },
      { icon: CheckCircle2, label: "Required decision note" },
    ],
  },
};

export function LoginForm({
  accounts,
  loading,
  busy,
  error,
  onSubmit,
}: {
  accounts: Account[];
  loading: boolean;
  busy: boolean;
  error?: string;
  onSubmit: (userId: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [personasOpen, setPersonasOpen] = useState(false);
  useEffect(() => {
    if (selected || accounts.length === 0) return;
    setSelected(
      accounts.find((account) => account.role === "ANALYST")?.id ??
        accounts[0].id,
    );
  }, [accounts, selected]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected && !busy) onSubmit(selected);
  }

  const activeAccount = accounts.find((account) => account.id === selected);

  return (
    <div className="login-page">
      <div className="login-layout">
        <header className="login-topbar">
          <div className="login-brand">
            <div className="login-mark">
              <ShieldCheck size={20} strokeWidth={1.8} />
            </div>
            <div className="login-brand-copy">
              <div className="login-brand-title">
                <strong>Compliwise</strong>
                <span>PLATFORM</span>
              </div>
              <p>Compliance Issue Tracker &amp; Governance</p>
            </div>
          </div>
        </header>

        <main className="login-content">
          <section className="login-card" aria-labelledby="login-title">
            <div className="login-card-heading">
              <h1 id="login-title">Welcome back</h1>
              <p>Sign in to your compliance workspace</p>
            </div>

            <form className="login-form" onSubmit={submit} aria-busy={busy}>
            {error && (
              <div className="alert" role="alert">
                <CircleAlert size={18} />
                <span>{error}</span>
              </div>
            )}
            {loading && (
              <div className="empty" role="status">
                <LoaderCircle className="spin" size={22} />
                Loading accounts...
              </div>
            )}

              <div className="login-divider"><span>DEMO ACCESS</span></div>
              <button
                className="login-persona-toggle"
                type="button"
                aria-expanded={personasOpen}
                aria-controls="login-personas"
                disabled={busy || loading}
                onClick={() => setPersonasOpen((open) => !open)}
              >
                <span className="login-persona-icon"><BadgeCheck size={15} /></span>
                <span className="login-persona-copy">
                  <strong>Explore demo personas</strong>
                  <small>
                    {activeAccount
                      ? `${activeAccount.name} · ${roleDetails[activeAccount.role].title} selected`
                      : "Simulated role-based access"}
                  </small>
                </span>
                <ChevronDown className={personasOpen ? "is-open" : ""} size={16} />
              </button>

              {personasOpen && (
                <fieldset
                  className="login-accounts"
                  id="login-personas"
                  disabled={busy || loading}
                >
                  <legend className="login-legend">Choose a demo identity</legend>
                  <div className="account-list">
                    {accounts.map((account) => {
                      const details = roleDetails[account.role];
                      const isSelected = selected === account.id;
                      return (
                        <label
                          className={`account account-${account.role.toLowerCase()}${isSelected ? " selected" : ""}`}
                          key={account.id}
                        >
                          <input
                            className="account-radio"
                            type="radio"
                            name="account"
                            value={account.id}
                            checked={isSelected}
                            onChange={() => setSelected(account.id)}
                            aria-label={account.name}
                            required
                          />
                          <span className="account-content">
                            <span className="account-topline">
                              <span className="account-identity">
                                <strong>{account.name}</strong>
                                {isSelected && <span className="default-tag">SELECTED</span>}
                              </span>
                              <span className="role-chip">
                                <BadgeCheck size={13} />
                                {details.title}
                              </span>
                            </span>
                            <span className="account-description">{details.description}</span>
                            <span className="capability-list">
                              {details.capabilities.map(({ icon: Icon, label }) => (
                                <span className="capability" key={label}>
                                  <Icon size={12} />
                                  {label}
                                </span>
                              ))}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

            <button
              className="button primary login-submit"
              type="submit"
              aria-label="Sign in"
              disabled={!selected || busy || loading || accounts.length === 0}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ArrowRight size={15} />
              )}
              {busy ? "Signing in..." : "Sign In"}
            </button>
            <p className="login-note">
              Demo access uses seeded identities; no password is required.
            </p>
          </form>
          </section>

        <div className="login-trust-list">
          <span><ShieldCheck size={13} />Role enforcement</span>
          <span><History size={13} />Audit trail</span>
        </div>
        </main>
      </div>
    </div>
  );
}
export function LogoutDialog({
  open,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      className="logout-dialog"
      aria-labelledby="logout-title"
      aria-describedby="logout-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="logout-panel" aria-busy={busy}>
        <div className="logout-content">
          <div className="logout-mark">
            <LogOut size={16} />
          </div>
          <div className="logout-copy">
            <h2 id="logout-title">Sign out</h2>
            <p id="logout-description">
              Are you sure you want to sign out? You will need to log back in to
              access Compliwise.
            </p>
          </div>
        </div>
        {error && (
          <div className="alert" role="alert">
            <CircleAlert size={18} />
            <span>{error}</span>
          </div>
        )}
        <div className="logout-actions">
          <button
            ref={cancelRef}
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="button logout-confirm"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <LogOut size={16} />
            )}
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

const rejectionReasons = [
  {
    value: "POLICY_CONFLICT",
    label: "Policy conflict",
    description: "The proposed remediation conflicts with a documented control or policy.",
    icon: ShieldAlert,
  },
  {
    value: "INSUFFICIENT_EVIDENCE",
    label: "Insufficient evidence",
    description: "The submitted references do not adequately support the proposed closure.",
    icon: FileWarning,
  },
  {
    value: "INCORRECT_SCOPE",
    label: "Incorrect scope",
    description: "The change affects assets or controls outside the issue's recorded scope.",
    icon: GitCompare,
  },
  {
    value: "OUTDATED_PROPOSAL",
    label: "Proposal needs reanalysis",
    description: "Issue details changed after analysis; submit a fresh proposal.",
    icon: RefreshCw,
  },
] as const;

export function RejectProposalDialog({
  open,
  proposalId,
  issueId,
  issueTitle,
  severity,
  dueDate,
  requester,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  proposalId: string;
  issueId: string;
  issueTitle: string;
  severity: string;
  dueDate: string;
  requester: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, note: string) => Promise<boolean>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState<(typeof rejectionReasons)[number]["value"]>("POLICY_CONFLICT");
  const [note, setNote] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason("POLICY_CONFLICT");
      setNote("");
      dialog.showModal();
      reasonRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || note.trim().length < 50) return;
    const confirmed = await onConfirm(reason, note.trim());
    if (confirmed) onCancel();
  }

  return (
    <dialog
      ref={dialogRef}
      className="reject-dialog"
      aria-labelledby="reject-title"
      aria-describedby="reject-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <form className="reject-panel" onSubmit={submit} aria-busy={busy}>
        <header className="reject-header">
          <div className="reject-icon"><ShieldAlert size={19} /></div>
          <div>
            <div className="reject-title-line">
              <h2 id="reject-title">Reject remediation proposal</h2>
              <span>ACTION REQUIRED</span>
            </div>
            <p id="reject-description">A recorded reason is required before this proposal returns to the remediation queue.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close rejection dialog" disabled={busy} onClick={onCancel}><X size={17} /></button>
        </header>

        <dl className="reject-context">
          <div><dt>Issue</dt><dd><strong>{issueId}</strong><span>{issueTitle}</span></dd></div>
          <div><dt>Proposal</dt><dd><strong>#{proposalId.slice(-6).toUpperCase()}</strong></dd></div>
          <div><dt>Requester</dt><dd>{requester}</dd></div>
          <div><dt>Severity / due</dt><dd><strong>{severity}</strong><span>{dueDate}</span></dd></div>
        </dl>

        <fieldset className="reject-reasons" disabled={busy}>
          <legend>Primary rejection reason <span className="required-mark">*</span></legend>
          {rejectionReasons.map(({ value, label, description, icon: Icon }, index) => (
            <label className={`reject-reason${reason === value ? " selected" : ""}`} key={value}>
              <input ref={index === 0 ? reasonRef : undefined} type="radio" name={`reject-reason-${proposalId}`} value={value} checked={reason === value} onChange={() => setReason(value)} />
              <span className="reject-reason-copy"><span className="reject-reason-title"><Icon size={14} /><strong>{label}</strong>{index === 0 && <span className="default-reason">DEFAULT</span>}</span><small>{description}</small></span>
            </label>
          ))}
        </fieldset>

        <label className="reject-note-label" htmlFor={`reject-note-${proposalId}`}>
          Mandatory audit note & corrective instructions <span className="required-mark">*</span>
          <span className="reject-note-count">{note.length} / 1000 characters · minimum 50</span>
        </label>
        <textarea id={`reject-note-${proposalId}`} className="reject-note" value={note} onChange={(event) => setNote(event.target.value)} minLength={50} maxLength={1000} required disabled={busy} placeholder="Explain why the proposal is insufficient and what must change before resubmission." />
        <p className="reject-privacy"><ShieldCheck size={13} />This note will be recorded in the issue audit trail and visible to reviewers.</p>

        <div className="reject-consequence"><History size={16} /><div><strong>Audit and workflow impact</strong><p>The proposal will be marked rejected. The issue remains pending review so the analyst can revise and submit a new proposal.</p></div></div>

        <footer className="reject-actions">
          <span className="reject-signer"><LockKeyhole size={13} />Reviewer: {requester}</span>
          <div><button className="button secondary" type="button" disabled={busy} onClick={onCancel}>Cancel and return</button><button className="button danger" type="submit" disabled={busy || note.trim().length < 50}>{busy ? <LoaderCircle size={15} className="spin" /> : <ShieldAlert size={15} />}{busy ? "Recording rejection..." : "Confirm & record rejection"}</button></div>
        </footer>
      </form>
    </dialog>
  );
}
