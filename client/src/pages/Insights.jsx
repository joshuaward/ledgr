import { useEffect, useState } from "react";
import { api, fmt } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";

export default function Insights() {
  const [dashboard, setDash] = useState(null);
  const [rec, setRec] = useState(null);

  useEffect(() => {
    Promise.all([api.dashboard(), api.allowance()]).then(([d, r]) => {
      setDash(d);
      setRec(r);
    });
  }, []);

  if (!dashboard || !rec) return <div className="loader">Thinking…</div>;

  return (
    <>
      <PageHeader
        eyebrow="The thinking part"
        title="Insights & recommendations."
        subtitle="Generated from your actual income, bills, and savings posture. Updated whenever the data changes."
      />

      <div className="section">
        <div className="section-title">
          <h2 data-num="✦">Allowance recommendation</h2>
          <span className="eyebrow">Calibrated to your savings target</span>
        </div>
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "2rem", alignItems: "start" }}>
            <div>
              <span className="stat__label">Current allowance</span>
              <div className="stat__value" style={{ fontSize: "2rem", marginTop: "0.25rem" }}>
                {fmt(rec.currentAllowance)}<span style={{ fontSize: "0.6rem", color: "var(--ink-faint)" }}>/mo</span>
              </div>
              <p style={{ marginTop: "1rem", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
                Of {fmt(rec.monthlyIncome)} monthly net, after {fmt(rec.obligated)} in obligations and a target of {fmt(rec.savingsTargetMonthly)} in savings.
              </p>
            </div>

            <div>
              <div className="grid grid-2" style={{ gap: "0.75rem" }}>
                <RecCard label="Aggressive saver" sub="5% of net" amount={rec.recommendations.aggressive} tone="gain" />
                <RecCard label="Conservative" sub="7% of net" amount={rec.recommendations.conservative} tone="gain" />
                <RecCard label="Balanced" sub="midpoint" amount={rec.recommendations.balanced} tone="warn" />
                <RecCard label="Generous" sub="15% savings rate" amount={rec.recommendations.generous} tone="accent" />
              </div>
              <ul style={{ marginTop: "1.5rem", paddingLeft: "1rem", color: "var(--ink-soft)", fontSize: "0.9rem", lineHeight: 1.7 }}>
                {rec.rationale.map((line, i) => (
                  <li key={i} style={{ marginBottom: "0.3rem" }}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <h2 data-num="◆">Engine insights</h2>
        </div>
        <div className="grid grid-2">
          {dashboard.insights.map((t, i) => (
            <div key={i} className={`insight insight--${t.severity}`}>
              <div className="insight__title">{t.title}</div>
              <div className="insight__body">{t.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <h2 data-num="◇">Budgeting philosophy</h2>
        </div>
        <div className="card" style={{ padding: "2rem" }}>
          <p style={{ fontSize: "1.05rem", lineHeight: 1.7, color: "var(--ink-soft)" }}>
            <span style={{ fontFamily: "Fraunces, serif", fontSize: "2rem", lineHeight: 0.6, color: "var(--accent)", float: "left", marginRight: "0.4rem", marginTop: "0.3rem" }}>L</span>
            edger is a <strong>hybrid budgeting</strong> tool. It blends three modern approaches:
            <strong> Zero-Based</strong> (every dollar of every paycheck has a job),
            <strong> 50/30/20</strong> (needs / wants / savings as a sanity check),
            and <strong> Pay-Yourself-First</strong> (savings funded before discretionary).
          </p>
          <p style={{ marginTop: "1rem", color: "var(--ink-soft)", lineHeight: 1.7 }}>
            Each paycheck is allocated forward — covering bills due in the next 16 days, half of the monthly groceries
            and allowance, sinking-fund contributions for seasonal bills, and savings goals in priority order. Bills
            are rounded up to the dollar so the change accumulates as effortless extra savings. The "cushion" is your
            unallocated buffer — and the engine flags it when it's too thin.
          </p>
          <p style={{ marginTop: "1rem", color: "var(--ink-soft)", lineHeight: 1.7 }}>
            Sinking funds — set-aside accounts for predictable-but-irregular expenses like winter heating or annual
            insurance — are the secret weapon. Instead of being blindsided by a $224 February gas bill, you've been
            putting $40 a month away all year. The bill arrives. You feel nothing.
          </p>
        </div>
      </div>
    </>
  );
}

function RecCard({ label, sub, amount, tone }) {
  const colorMap = {
    gain: "var(--gain)",
    warn: "var(--warn)",
    accent: "var(--accent)",
  };
  return (
    <div
      className="card"
      style={{
        padding: "1.25rem",
        borderLeft: `3px solid ${colorMap[tone]}`,
        borderRadius: "0 8px 8px 0",
      }}
    >
      <span className="stat__label" style={{ fontSize: "0.65rem" }}>{label}</span>
      <div className="mono" style={{ fontSize: "1.7rem", fontWeight: 700, marginTop: "0.3rem" }}>
        {fmt(amount)}<span style={{ fontSize: "0.55rem", color: "var(--ink-faint)" }}>/mo</span>
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: "0.2rem" }}>{sub}</div>
    </div>
  );
}
