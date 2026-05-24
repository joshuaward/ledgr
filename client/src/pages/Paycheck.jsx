import { useEffect, useMemo, useState } from "react";
import { api, fmt } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";

export default function Paycheck() {
  const [net, setNet] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recentPaychecks, setRecent] = useState([]);

  useEffect(() => {
    api.paychecks().then((p) => {
      const last = [...p].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
      setRecent(last);
      // Pre-fill with most recent net
      if (last.length && !net) setNet(String(last[0].net));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function calculate() {
    if (!net) return;
    setBusy(true);
    try {
      const r = await api.allocate({ net: Number(net), date, label });
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!result) return;
    await api.allocate({ net: Number(net), date, label, save: true });
    await api.addPaycheck({ net: Number(net), date, source: "Manual entry" });
    alert("Allocation saved & paycheck logged.");
    setNet("");
    setLabel("");
    setResult(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="Step 2 · Allocate"
        title="Where does this paycheck go?"
        subtitle="Enter your current paycheck. The engine maps bills due in the next 16 days, halves your groceries and allowance, funds your sinking funds and savings goals in priority order, and tells you what's left."
      />

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginBottom: "1.25rem" }}>Paycheck details</h3>

          <div className="field">
            <label className="field__label">Net amount</label>
            <input
              type="number"
              className="input input-money"
              value={net}
              onChange={(e) => setNet(e.target.value)}
              placeholder="0.00"
              step="0.01"
            />
          </div>

          <div className="field">
            <label className="field__label">Pay date</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label">Label (optional)</label>
            <input
              type="text"
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. June 1 paycheck"
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button className="btn" onClick={calculate} disabled={busy || !net}>
              {busy ? "Calculating…" : "Calculate allocation"}
            </button>
            {result && (
              <button className="btn btn--ghost" onClick={commit}>
                Save & log paycheck
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>Recent paychecks</h3>
          {recentPaychecks.length === 0 && (
            <p style={{ color: "var(--ink-faint)" }}>No history yet.</p>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th className="right">Net</th>
              </tr>
            </thead>
            <tbody>
              {recentPaychecks.map((p) => (
                <tr key={p.id}>
                  <td className="mono" style={{ fontSize: "0.85rem" }}>
                    {p.date}
                  </td>
                  <td>
                    {p.source}
                    {p.type === "bonus" && (
                      <span className="pill pill--needs" style={{ marginLeft: "0.5rem" }}>
                        Bonus
                      </span>
                    )}
                  </td>
                  <td className="right table__amount">{fmt(p.net, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result && <Result result={result} />}
    </>
  );
}

function Result({ result }) {
  const segments = useMemo(() => {
    const items = [
      { key: "bills",      label: "Bills",      value: result.breakdown.bills,        color: "var(--info)" },
      { key: "groceries",  label: "Groceries",  value: result.breakdown.groceries,    color: "var(--warn)" },
      { key: "allowance",  label: "Allowance",  value: result.breakdown.allowance,    color: "#9a6c43" },
      { key: "sinking",    label: "Sinking",    value: result.breakdown.sinkingFunds, color: "#6b93c0" },
      { key: "savings",    label: "Savings",    value: result.breakdown.savings,      color: "var(--gain)" },
      { key: "cushion",    label: "Cushion",    value: result.breakdown.cushion,      color: "var(--ink-faint)" },
    ].filter((s) => s.value > 0);
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    return items.map((i) => ({ ...i, pct: (i.value / total) * 100 }));
  }, [result]);

  return (
    <div className="section" style={{ marginTop: "2.5rem" }}>
      <div className="section-title">
        <h2 data-num="✦">The allocation</h2>
        <span className="eyebrow">
          {fmt(result.net, { cents: true })} on {result.date}
        </span>
      </div>

      <div className="card">
        <div className="alloc-bar">
          {segments.map((s) => (
            <div
              key={s.key}
              className="alloc-bar__segment"
              style={{ width: `${s.pct}%`, background: s.color }}
              title={`${s.label}: ${fmt(s.value)}`}
            >
              {s.pct > 8 ? s.label : ""}
            </div>
          ))}
        </div>
        <div className="alloc-legend">
          {segments.map((s) => (
            <div key={s.key} className="alloc-legend__item">
              <span className="alloc-legend__swatch" style={{ background: s.color }} />
              <span style={{ flex: 1 }}>{s.label}</span>
              <span className="mono">{fmt(s.value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: "1.5rem" }}>
        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>Bills paid by this paycheck</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Due</th>
                <th className="right">Expected</th>
                <th className="right">Funded</th>
              </tr>
            </thead>
            <tbody>
              {result.bills.map((b) => (
                <tr key={b.billId}>
                  <td>
                    <strong>{b.name}</strong>
                    <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)" }}>
                      {b.category}
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: "0.82rem" }}>
                    {b.dueDate.slice(5)}
                  </td>
                  <td className="right table__amount" style={{ color: "var(--ink-faint)" }}>
                    {fmt(b.expected, { cents: true })}
                  </td>
                  <td className="right table__amount">
                    {fmt(b.funded)}
                    {b.partial && (
                      <span className="pill pill--wants" style={{ marginLeft: "0.4rem" }}>
                        Partial
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.unfundedBills.length > 0 && (
            <div className="insight insight--warning" style={{ marginTop: "1rem" }}>
              <div className="insight__title">⚠ Underfunded bills</div>
              <div className="insight__body">
                Couldn't cover: {result.unfundedBills.map((b) => b.name).join(", ")}.
                Consider increasing this paycheck's coverage or moving to next paycheck.
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>The rest of your money</h3>
          <ResultRow label="Groceries" amount={result.groceries} note="½ of monthly budget" />
          <ResultRow label="Allowance" amount={result.allowance} note="Personal spending money" />
          <hr style={{ border: "none", borderTop: "1px solid var(--rule)", margin: "0.75rem 0" }} />
          {result.sinkingFunds.filter((s) => s.amount > 0).map((s) => (
            <ResultRow key={s.id} label={s.name} amount={s.amount} note="Sinking fund" />
          ))}
          <hr style={{ border: "none", borderTop: "1px solid var(--rule)", margin: "0.75rem 0" }} />
          {result.savings.filter((s) => s.amount > 0).map((s) => (
            <ResultRow key={s.id} label={s.name} amount={s.amount} note="Savings goal" />
          ))}
          <hr style={{ border: "none", borderTop: "1px solid var(--rule)", margin: "0.75rem 0" }} />
          <ResultRow
            label="Round-up savings"
            amount={result.roundUpSavings}
            note="From rounding bills up · auto-set aside"
            accent="gain"
          />
          <ResultRow
            label="Cushion"
            amount={result.cushion}
            note="Unallocated — yours to redirect"
            accent="gain"
          />
        </div>
      </div>
    </div>
  );
}

function ResultRow({ label, amount, note, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.5rem 0" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)" }}>{note}</div>
      </div>
      <div className="mono" style={{ fontWeight: 600, color: accent === "gain" ? "var(--gain)" : "var(--ink)" }}>
        {fmt(amount, { cents: true })}
      </div>
    </div>
  );
}
