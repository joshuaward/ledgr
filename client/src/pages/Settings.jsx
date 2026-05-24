import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft]       = useState({});
  const [saved, setSaved]       = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    api.settings().then(({ settings }) => {
      setSettings(settings);
      setDraft(settings);
    });
  }, []);

  async function save() {
    const updated = await api.updateSettings(draft);
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) return <div className="loader">Loading…</div>;

  return (
    <>
      <PageHeader
        eyebrow="Preferences"
        title="Settings."
        subtitle="Adjust the targets the engine uses to compute your savings rate, allowance, and emergency fund status."
      />

      {/* Pay Schedule */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Pay Schedule</h3>
        <div className="grid grid-3" style={{ gap: "1rem" }}>
          <div className="field">
            <label className="field__label">Pay frequency</label>
            <select
              className="select"
              value={draft.payFrequency || "biweekly"}
              onChange={(e) => setDraft({ ...draft, payFrequency: e.target.value })}
            >
              <option value="biweekly">Biweekly (every 2 weeks)</option>
              <option value="semimonthly">Semimonthly (1st &amp; 15th)</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="field">
            <label className="field__label">Next pay date</label>
            <input
              className="input"
              type="date"
              value={draft.nextPayDate || ""}
              onChange={(e) => setDraft({ ...draft, nextPayDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field__label">Typical take-home pay</label>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={draft.lastPayAmount || ""}
              onChange={(e) => setDraft({ ...draft, lastPayAmount: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: "1.5rem" }}>
        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>Budgeting</h3>

          <div className="field">
            <label className="field__label">Savings rate target (%)</label>
            <input
              className="input"
              type="number"
              min="0"
              max="50"
              value={draft.savingsRatePctTarget}
              onChange={(e) => setDraft({ ...draft, savingsRatePctTarget: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label className="field__label">Needs target (%)</label>
            <input
              className="input"
              type="number"
              value={draft.needsRatePctTarget}
              onChange={(e) => setDraft({ ...draft, needsRatePctTarget: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label className="field__label">Wants target (%)</label>
            <input
              className="input"
              type="number"
              value={draft.wantsRatePctTarget}
              onChange={(e) => setDraft({ ...draft, wantsRatePctTarget: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label className="field__label">Emergency fund target (months)</label>
            <input
              className="input"
              type="number"
              min="0"
              max="24"
              value={draft.emergencyFundTargetMonths}
              onChange={(e) => setDraft({ ...draft, emergencyFundTargetMonths: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>Behaviour</h3>

          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={draft.roundUp}
                onChange={(e) => setDraft({ ...draft, roundUp: e.target.checked })}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Round bills up to the nearest dollar</div>
                <div style={{ fontSize: "0.82rem", color: "var(--ink-faint)" }}>
                  The change accumulates in your bill account as a passive savings stream.
                </div>
              </div>
            </label>
          </div>

          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={draft.sinkingFundsEnabled}
                onChange={(e) => setDraft({ ...draft, sinkingFundsEnabled: e.target.checked })}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Enable sinking funds</div>
                <div style={{ fontSize: "0.82rem", color: "var(--ink-faint)" }}>
                  Smooth volatile bills (gas, electric) by setting aside a small amount monthly.
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <button className="btn" onClick={save}>Save changes</button>
        {saved && <span style={{ color: "var(--gain)", fontWeight: 600 }}>✓ Saved</span>}
      </div>

      {/* Danger zone */}
      <div className="section" style={{ marginTop: "3rem" }}>
        <div className="section-title">
          <h2 data-num="⚠.">Danger Zone</h2>
        </div>
        <div className="card" style={{ borderColor: "var(--warn-soft)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: "0.3rem" }}>Reset this budget</div>
              <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)", maxWidth: "50ch" }}>
                Wipe all bills, paychecks, and savings from this budget and start fresh with the setup wizard.
                A full backup is saved to <code style={{ fontFamily: "JetBrains Mono", background: "var(--bg-elevated)", padding: "1px 5px", borderRadius: "3px" }}>server/data/backups/</code> first.
              </div>
            </div>
            <button
              className="btn btn--ghost"
              style={{ color: "var(--warn)", borderColor: "var(--warn-soft)", flexShrink: 0 }}
              disabled={resetting}
              onClick={async () => {
                if (!confirm("Back up and reset this budget? All data will be wiped and the setup wizard will restart.")) return;
                setResetting(true);
                try {
                  await api.resetBudget();
                  window.location.reload();
                } finally {
                  setResetting(false);
                }
              }}
            >
              {resetting ? "Resetting…" : "Reset budget"}
            </button>
          </div>
        </div>
      </div>

      <div className="section" style={{ marginTop: "1.5rem" }}>
        <div className="section-title">
          <h2 data-num="δ.">About</h2>
        </div>
        <div className="card">
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}>
            <strong>Ledgr</strong> is a local-first budget application. All your data lives in
            <code style={{ fontFamily: "JetBrains Mono", background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: "3px", margin: "0 4px" }}>server/data/</code>
            on your machine. Nothing is uploaded, nothing is tracked, nothing is shared.
          </p>
          <p style={{ marginTop: "1rem", color: "var(--ink-soft)", lineHeight: 1.7 }}>
            Each budget is its own JSON file. Deleted or reset budgets are backed up to
            <code style={{ fontFamily: "JetBrains Mono", background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: "3px", margin: "0 4px" }}>server/data/backups/</code>
            automatically.
          </p>
        </div>
      </div>
    </>
  );
}
