import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../lib/theme.jsx";
import { api } from "../lib/api.js";

const NAV = [
  { num: "01", label: "Dashboard",  to: "/" },
  { num: "02", label: "Paycheck",   to: "/paycheck" },
  { num: "03", label: "Bills",      to: "/bills" },
  { num: "04", label: "Savings",    to: "/savings" },
  { num: "05", label: "Insights",   to: "/insights" },
  { num: "06", label: "Import",     to: "/import" },
  { num: "07", label: "Settings",   to: "/settings" },
];

export default function Sidebar({ onBudgetSwitch }) {
  const { theme, toggle } = useTheme();
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">Ledgr</div>
        <div className="sidebar__tagline">Est. 2026</div>
      </div>

      <BudgetSwitcher onBudgetSwitch={onBudgetSwitch} />

      <nav className="sidebar__nav">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            className={({ isActive }) =>
              "sidebar__nav-link" + (isActive ? " sidebar__nav-link--active" : "")
            }
          >
            <span className="sidebar__nav-num">{n.num}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button className="sidebar__theme-toggle" onClick={toggle}>
          <span>{theme === "light" ? "◐" : "◑"}</span>
          <span>{theme === "light" ? "Lights out" : "Daylight"}</span>
        </button>
      </div>
    </aside>
  );
}

// ─── Budget Switcher ────────────────────────────────────────────────────────

function BudgetSwitcher({ onBudgetSwitch }) {
  const [meta, setMeta]         = useState(null);
  const [open, setOpen]         = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName]   = useState("");
  const [busy, setBusy]         = useState(false);
  const dropdownRef             = useRef(null);
  const createInputRef          = useRef(null);

  async function load() {
    try {
      const data = await api.budgets();
      setMeta(data);
    } catch { /* server might not be ready */ }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
        setCreating(false);
        setRenaming(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (creating) setTimeout(() => createInputRef.current?.focus(), 50);
  }, [creating]);

  async function switchTo(id) {
    if (id === meta?.active || busy) return;
    setBusy(true);
    try {
      await api.switchBudget(id);
      setOpen(false);
      onBudgetSwitch?.();
    } finally {
      setBusy(false);
    }
  }

  async function createNew() {
    const name = newName.trim() || "New Budget";
    setBusy(true);
    try {
      await api.createBudget(name);
      setCreating(false);
      setNewName("");
      setOpen(false);
      onBudgetSwitch?.();
    } finally {
      setBusy(false);
    }
  }

  async function startRename(id, currentName) {
    setRenaming(id);
    setNewName(currentName);
  }

  async function confirmRename(id) {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api.renameBudget(id, newName.trim());
      await load();
      setRenaming(null);
      setNewName("");
    } finally {
      setBusy(false);
    }
  }

  async function deleteBudget(id) {
    if (!confirm("Back up and delete this budget? It cannot be recovered from the app.")) return;
    setBusy(true);
    try {
      await api.deleteBudget(id);
      await load();
      setOpen(false);
      onBudgetSwitch?.();
    } finally {
      setBusy(false);
    }
  }

  if (!meta) return null;

  const active = meta.budgets.find((b) => b.id === meta.active);

  return (
    <div className="budget-switcher" ref={dropdownRef}>
      <button
        className="budget-switcher__toggle"
        onClick={() => { setOpen((o) => !o); setCreating(false); setRenaming(null); }}
        title="Switch or manage budgets"
      >
        <span className="budget-switcher__name">{active?.name ?? "Budget"}</span>
        <span className="budget-switcher__arrow">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="budget-switcher__dropdown">
          {meta.budgets.map((b) => (
            <div
              key={b.id}
              className={`budget-switcher__item${b.id === meta.active ? " budget-switcher__item--active" : ""}`}
            >
              {renaming === b.id ? (
                <div className="budget-switcher__rename-row">
                  <input
                    className="input"
                    style={{ fontSize: "0.82rem", padding: "0.35rem 0.6rem" }}
                    value={newName}
                    autoFocus
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename(b.id);
                      if (e.key === "Escape") { setRenaming(null); setNewName(""); }
                    }}
                  />
                  <button className="budget-switcher__action" onClick={() => confirmRename(b.id)} title="Save">✓</button>
                  <button className="budget-switcher__action" onClick={() => { setRenaming(null); setNewName(""); }} title="Cancel">✕</button>
                </div>
              ) : (
                <>
                  <button
                    className="budget-switcher__item-label"
                    onClick={() => switchTo(b.id)}
                    disabled={busy}
                  >
                    {b.id === meta.active && <span className="budget-switcher__active-dot" />}
                    {b.name}
                  </button>
                  <div className="budget-switcher__item-actions">
                    <button
                      className="budget-switcher__action"
                      onClick={() => startRename(b.id, b.name)}
                      title="Rename"
                    >✎</button>
                    {meta.budgets.length > 1 && (
                      <button
                        className="budget-switcher__action budget-switcher__action--danger"
                        onClick={() => deleteBudget(b.id)}
                        title="Delete (backed up)"
                        disabled={busy}
                      >✕</button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="budget-switcher__divider" />

          {creating ? (
            <div className="budget-switcher__create-row">
              <input
                ref={createInputRef}
                className="input"
                style={{ fontSize: "0.82rem", padding: "0.35rem 0.6rem" }}
                placeholder="Budget name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createNew();
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
                }}
              />
              <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.4rem" }}>
                <button className="btn" style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }} onClick={createNew} disabled={busy}>
                  {busy ? "Creating…" : "Create"}
                </button>
                <button className="btn btn--ghost" style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }} onClick={() => { setCreating(false); setNewName(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="budget-switcher__new-btn" onClick={() => setCreating(true)}>
              + New budget
            </button>
          )}
        </div>
      )}
    </div>
  );
}
