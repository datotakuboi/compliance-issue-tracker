"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CircleAlert, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";

type Account = { id: string; name: string; role: string };

export function LoginForm({ accounts, loading, busy, error, onSubmit }: {
  accounts: Account[];
  loading: boolean;
  busy: boolean;
  error?: string;
  onSubmit: (userId: string) => void;
}) {
  const [selected, setSelected] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected && !busy) onSubmit(selected);
  }
  return <div className="login-page">
    <header className="login-brand"><ShieldCheck size={29} strokeWidth={1.7} /><span>compliwise<span className="brand-dot">.</span></span></header>
    <main className="login-main">
      <div className="login-mark"><ShieldCheck size={42} strokeWidth={1.4} /></div>
      <p className="eyebrow">COMPLIANCE WORKSPACE</p>
      <h1>Sign in to Compliwise</h1>
      <div className="demo-label">Simulated role-based login</div>
      <form className="login-form" onSubmit={submit} aria-busy={busy}>
        {error && <div className="alert" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
        {loading && <div className="empty" role="status"><LoaderCircle className="spin" size={22} />Loading accounts...</div>}
        <fieldset className="login-accounts" disabled={busy || loading}>
          <legend className="login-legend">User account</legend>
          {accounts.map((account) => <label className={`account${selected === account.id ? " selected" : ""}`} key={account.id}>
            <span className={`avatar ${account.role.toLowerCase()}`}>{account.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
            <span className="account-name"><strong>{account.name}</strong><small>{account.role[0] + account.role.slice(1).toLowerCase()}</small></span>
            <input className="account-radio" type="radio" name="account" value={account.id} checked={selected === account.id} onChange={() => setSelected(account.id)} aria-label={account.name} required />
          </label>)}
        </fieldset>
        <button className="button primary login-submit" type="submit" disabled={!selected || busy || loading || accounts.length === 0}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
    <footer className="login-footer"><ShieldCheck size={15} />Compliwise issue tracker</footer>
  </div>;
}

export function LogoutDialog({ open, name, busy, error, onCancel, onConfirm }: {
  open: boolean;
  name: string;
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
  return <dialog ref={dialogRef} className="logout-dialog" aria-labelledby="logout-title" aria-describedby="logout-description" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div className="logout-panel" aria-busy={busy}>
      <div className="logout-mark"><LogOut size={23} /></div>
      <h2 id="logout-title">Sign out of Compliwise?</h2>
      <p id="logout-description">You are signed in as <strong>{name}</strong>. You will need to sign in again to access this workspace.</p>
      {error && <div className="alert" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
      <div className="logout-actions"><button ref={cancelRef} className="button secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="button primary" type="button" disabled={busy} onClick={onConfirm}>{busy ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />}{busy ? "Signing out..." : "Sign out"}</button></div>
    </div>
  </dialog>;
}