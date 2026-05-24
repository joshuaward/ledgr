import { useEffect, useState } from "react";
import { api, fmt } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const EMPTY = {
  name: "",
  category: "Other",
  dueDay: 1,
  amount: 0,
  type: "needs",
  essential: false,
  seasonal: false,
};

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(EMPTY);

  async function load() {
    const b = await api.bills();
    setBills(b);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(bill) {
    setEditing(bill?.id || "new");
    setDraft(bill ? { ...bill } : EMPTY);
  }

  async function save() {
    await api.addBill(draft);
    setEditing(null);
    setDraft(EMPTY);
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this bill?")) return;
    await api.deleteBill(id);
    load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Recurring obligations"
        title="The bills."
        subtitle="Every recurring bill, with its 6-month history. Volatile bills earn a sinking-fund recommendation. Bills are rounded up to the nearest dollar — the extra change accumulates in your bill account."
      >
        <button className="btn" onClick={() => startEdit(null)}>
          + Add bill
        </button>
      </PageHeader>

      {editing && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>
            {editing === "new" ? "New bill" : "Edit bill"}
          </h3>
          <div className="grid grid-3" style={{ gap: "1rem" }}>
            <div className="field">
              <label className="field__label">Name</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="field">
              <label className="field__label">Category</label>
              <select className="select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                <option>Housing</option>
                <option>Transportation</option>
                <option>Utilities</option>
                <option>Subscriptions</option>
                <option>Health</option>
                <option>Credit Cards</option>
                <option>Insurance</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label">Type</label>
              <select className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                <option value="needs">Needs</option>
                <option value="wants">Wants</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label">Due day of month</label>
              <input className="input" type="number" min="1" max="31" value={draft.dueDay} onChange={(e) => setDraft({ ...draft, dueDay: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="field__label">Typical amount</label>
              <input className="input" type="number" step="0.01" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="field__label">Flags</label>
              <div style={{ display: "flex", gap: "1rem", paddingTop: "0.5rem" }}>
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.9rem" }}>
                  <input type="checkbox" checked={draft.essential} onChange={(e) => setDraft({ ...draft, essential: e.target.checked })} />
                  Essential
                </label>
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.9rem" }}>
                  <input type="checkbox" checked={draft.seasonal} onChange={(e) => setDraft({ ...draft, seasonal: e.target.checked })} />
                  Seasonal
                </label>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button className="btn" onClick={save}>
              Save
            </button>
            <button className="btn btn--ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid" style={{ gap: "1rem" }}>
        {bills.map((b) => (
          <BillCard key={b.id} bill={b} onEdit={() => startEdit(b)} onDelete={() => remove(b.id)} />
        ))}
      </div>
    </>
  );
}

function BillCard({ bill, onEdit, onDelete }) {
  const history = (bill.history || []).map((h) => ({
    date: h.date.slice(5),
    amount: h.amount,
  }));
  const amts = (bill.history || []).map((h) => h.amount);
  const lo = amts.length ? Math.min(...amts) : 0;
  const hi = amts.length ? Math.max(...amts) : 0;
  const avg = amts.length ? amts.reduce((s, n) => s + n, 0) / amts.length : 0;
  const latest = amts.length ? amts[amts.length - 1] : bill.amount;
  const fluctuation = hi - lo;

  return (
    <div className="card" style={{ display: "grid", gridTemplateColumns: "1.5fr 2fr auto", gap: "1.5rem", alignItems: "center" }}>
      <div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
          <h3 style={{ margin: 0 }}>{bill.name}</h3>
          <span className={`pill pill--${bill.type}`}>{bill.type}</span>
          {bill.seasonal && (
            <span className="pill pill--wants" title="Seasonal">
              Seasonal
            </span>
          )}
        </div>
        <div style={{ fontSize: "0.82rem", color: "var(--ink-faint)" }}>
          {bill.category} · Due day {bill.dueDay}
        </div>
        <div style={{ marginTop: "0.8rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div className="stat__label" style={{ fontSize: "0.62rem" }}>Latest</div>
            <div className="mono" style={{ fontSize: "1.1rem", fontWeight: 600 }}>{fmt(latest, { cents: true })}</div>
          </div>
          <div>
            <div className="stat__label" style={{ fontSize: "0.62rem" }}>Avg</div>
            <div className="mono" style={{ fontSize: "1.1rem", color: "var(--ink-soft)" }}>{fmt(avg, { cents: true })}</div>
          </div>
          <div>
            <div className="stat__label" style={{ fontSize: "0.62rem" }}>Range</div>
            <div className="mono" style={{ fontSize: "1.1rem", color: fluctuation > 50 ? "var(--warn)" : "var(--ink-soft)" }}>
              ±{fmt(fluctuation, { cents: true })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 100 }}>
        {history.length > 1 ? (
          <ResponsiveContainer>
            <LineChart data={history} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" stroke="var(--ink-faint)" tick={{ fontSize: 10 }} />
              <YAxis stroke="var(--ink-faint)" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={45} />
              <Tooltip
                contentStyle={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 6, fontSize: 12 }}
                formatter={(v) => fmt(v, { cents: true })}
              />
              <Line type="monotone" dataKey="amount" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)" }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: "var(--ink-faint)", fontSize: "0.85rem", textAlign: "center", paddingTop: "2rem" }}>
            Not enough history to chart yet.
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <button className="btn btn--ghost" onClick={onEdit}>Edit</button>
        <button className="btn btn--ghost" onClick={onDelete} style={{ color: "var(--danger)", borderColor: "var(--danger-soft)" }}>
          Delete
        </button>
      </div>
    </div>
  );
}
