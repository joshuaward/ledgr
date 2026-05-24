import { useEffect, useState } from "react";
import { api, fmt } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";

export default function Savings() {
  const [data, setData] = useState({ goals: [], sinkingFunds: [] });
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    target: 0,
    current: 0,
    priority: 5,
    monthlyContribution: 0,
  });
  const [contribute, setContribute] = useState({});

  async function load() {
    const s = await api.savings();
    setData(s);
  }
  useEffect(() => { load(); }, []);

  async function addGoal() {
    if (!draft.name || !draft.target) return;
    await api.addGoal(draft);
    setShowNew(false);
    setDraft({ name: "", target: 0, current: 0, priority: 5, monthlyContribution: 0 });
    load();
  }

  async function contributeTo(id) {
    const amt = Number(contribute[id] || 0);
    if (!amt) return;
    await api.contributeGoal(id, amt);
    setContribute({ ...contribute, [id]: "" });
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this goal?")) return;
    await api.deleteGoal(id);
    load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Pay yourself first"
        title="Savings goals."
        subtitle="Each goal gets a monthly contribution. The paycheck engine funds them in priority order, before allowance. Sinking funds smooth volatile bills."
      >
        <button className="btn" onClick={() => setShowNew(true)}>+ New goal</button>
      </PageHeader>

      {showNew && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>New savings goal</h3>
          <div className="grid grid-3" style={{ gap: "1rem" }}>
            <div className="field">
              <label className="field__label">Name</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="field">
              <label className="field__label">Target ($)</label>
              <input className="input" type="number" value={draft.target} onChange={(e) => setDraft({ ...draft, target: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="field__label">Current ($)</label>
              <input className="input" type="number" value={draft.current} onChange={(e) => setDraft({ ...draft, current: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="field__label">Monthly contribution ($)</label>
              <input className="input" type="number" value={draft.monthlyContribution} onChange={(e) => setDraft({ ...draft, monthlyContribution: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="field__label">Priority (1 = highest)</label>
              <input className="input" type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button className="btn" onClick={addGoal}>Save goal</button>
            <button className="btn btn--ghost" onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <h2 data-num="α.">Savings goals</h2>
        </div>
        <div className="grid grid-2">
          {data.goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onContribute={(amt) => { setContribute({ ...contribute, [g.id]: amt }); }}
              contributeVal={contribute[g.id] || ""}
              onCommitContribute={() => contributeTo(g.id)}
              onDelete={() => remove(g.id)}
            />
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <h2 data-num="β.">Sinking funds</h2>
          <span className="eyebrow">Smooth out volatile bills</span>
        </div>
        <div className="grid grid-3">
          {data.sinkingFunds.map((f) => (
            <div key={f.id} className="card">
              <h3 style={{ marginBottom: "0.5rem" }}>{f.name}</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                {f.purpose}
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <div className="stat__label" style={{ fontSize: "0.6rem" }}>Balance</div>
                  <div className="mono" style={{ fontWeight: 600, fontSize: "1.4rem" }}>{fmt(f.current)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="stat__label" style={{ fontSize: "0.6rem" }}>Monthly</div>
                  <div className="mono" style={{ fontWeight: 600 }}>{fmt(f.monthlyContribution)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function GoalCard({ goal, onContribute, contributeVal, onCommitContribute, onDelete }) {
  const pct = goal.target ? Math.min(100, (goal.current / goal.target) * 100) : 0;
  const monthsLeft = goal.monthlyContribution > 0 ? Math.ceil((goal.target - goal.current) / goal.monthlyContribution) : null;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3>{goal.name}</h3>
        <span className="eyebrow">Priority {goal.priority}</span>
      </div>

      <div style={{ marginTop: "1.25rem", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
          <span className="mono" style={{ fontWeight: 700, fontSize: "1.3rem" }}>{fmt(goal.current)}</span>
          <span className="mono" style={{ color: "var(--ink-faint)" }}>of {fmt(goal.target)}</span>
        </div>
        <div className="progress">
          <div className="progress__bar progress__bar--gain" style={{ width: `${pct}%` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.4rem", fontSize: "0.8rem", color: "var(--ink-faint)" }}>
          <span>{pct.toFixed(1)}% funded</span>
          {monthsLeft !== null && (
            <span>~{monthsLeft} months at {fmt(goal.monthlyContribution)}/mo</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <input
          className="input"
          type="number"
          placeholder="Contribute amount"
          value={contributeVal}
          onChange={(e) => onContribute(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn" onClick={onCommitContribute}>Add</button>
        <button className="btn btn--ghost" onClick={onDelete} style={{ color: "var(--danger)" }}>×</button>
      </div>
    </div>
  );
}
