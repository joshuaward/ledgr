import { useEffect, useRef, useState } from "react";
import { api, fmt } from "../lib/api.js";

const CATEGORIES = [
  "Housing", "Transportation", "Utilities", "Subscriptions",
  "Health", "Credit Cards", "Insurance", "Other",
];

const EMPTY_BILL = {
  name: "", category: "Other", dueDay: 1,
  amount: "", type: "needs", essential: false, seasonal: false,
};

// ─── Main Onboarding Shell ──────────────────────────────────────────────────

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);

  const [payFrequency, setPayFrequency]   = useState("biweekly");
  const [nextPayDate, setNextPayDate]     = useState("");
  const [lastPayAmount, setLastPayAmount] = useState("");

  const [allowance, setAllowance] = useState("");
  const [groceries, setGroceries] = useState("");
  const [autoSave, setAutoSave]   = useState("");

  const [addedBills, setAddedBills] = useState([]);
  const [saving, setSaving]         = useState(false);

  function enterIncomeStep() {
    setStep(2);
  }

  async function enterSpendingStep() {
    // Seed synthetic paychecks from the manual entry if no real stubs were uploaded
    if (lastPayAmount && Number(lastPayAmount) > 0) {
      try {
        await api.seedPaychecks({
          net: Number(lastPayAmount),
          nextPayDate: nextPayDate || null,
          frequency: payFrequency,
          count: 6,
        });
      } catch (e) {
        console.warn("Could not seed paychecks:", e.message);
      }
    }
    setStep(3);
  }

  async function enterBillsStep() {
    try {
      const b = await api.bills();
      setAddedBills(b);
    } catch { /* ignore */ }
    setStep(4);
  }

  async function onBillAdded() {
    const b = await api.bills();
    setAddedBills(b);
  }

  async function finish() {
    setSaving(true);
    try {
      try {
        const varPayload = {};
        if (groceries) varPayload.groceries = Number(groceries);
        if (allowance) varPayload.allowance = Number(allowance);
        if (Object.keys(varPayload).length > 0) {
          await api.updateVariableExpenses(varPayload);
        }
        if (autoSave && Number(autoSave) > 0) {
          await api.addGoal({
            id: "auto-savings",
            name: "Auto-Savings",
            target: 0,
            current: 0,
            monthlyContribution: Number(autoSave) * 2,
            priority: 1,
          });
        }
      } catch (e) {
        console.warn("Could not save spending/savings during onboarding:", e.message);
      }
      await api.updateSettings({
        onboarded: true,
        payFrequency,
        nextPayDate: nextPayDate || null,
        lastPayAmount: lastPayAmount ? Number(lastPayAmount) : null,
      });
      onComplete();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding__container">

        {(step >= 1 && step <= 4) && (
          <div className="onboarding__dots">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={
                  "onboarding__dot" +
                  (step === s ? " onboarding__dot--active" : step > s ? " onboarding__dot--done" : "")
                }
              />
            ))}
          </div>
        )}

        {step === 0 && <StepWelcome onStart={() => setStep(1)} onSkip={finish} />}

        {step === 1 && (
          <StepPaySchedule
            payFrequency={payFrequency}   setPayFrequency={setPayFrequency}
            nextPayDate={nextPayDate}     setNextPayDate={setNextPayDate}
            lastPayAmount={lastPayAmount} setLastPayAmount={setLastPayAmount}
            onBack={() => setStep(0)}
            onNext={enterIncomeStep}
          />
        )}

        {step === 2 && (
          <StepIncome
            onBack={() => setStep(1)}
            onNext={enterSpendingStep}
          />
        )}

        {step === 3 && (
          <StepSpending
            allowance={allowance}   setAllowance={setAllowance}
            groceries={groceries}   setGroceries={setGroceries}
            autoSave={autoSave}     setAutoSave={setAutoSave}
            onBack={() => setStep(2)}
            onNext={enterBillsStep}
          />
        )}

        {step === 4 && (
          <StepBills
            addedBills={addedBills}
            onBillAdded={onBillAdded}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}

        {step === 5 && (
          <StepDone
            addedBills={addedBills}
            payAmount={lastPayAmount}
            nextPayDate={nextPayDate}
            allowance={allowance}
            groceries={groceries}
            autoSave={autoSave}
            saving={saving}
            onFinish={finish}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 0: Welcome ────────────────────────────────────────────────────────

function StepWelcome({ onStart, onSkip }) {
  return (
    <div className="onboarding__step onboarding__step--welcome">
      <div className="onboarding__brand">Ledgr</div>

      <h1 className="onboarding__headline">
        Your money, <em>organised.</em>
      </h1>
      <p className="onboarding__sub">
        Ledgr tracks your bills against your bi‑weekly paychecks so you always
        know exactly what's due this pay period — and what's left over.
      </p>

      <div className="onboarding__choice-grid">
        <button className="onboarding__choice-card onboarding__choice-card--primary" onClick={onStart}>
          <span className="onboarding__choice-icon">✦</span>
          <span className="onboarding__choice-title">Set up my budget</span>
          <span className="onboarding__choice-desc">
            Takes about 2 minutes. Add your pay schedule and bills.
          </span>
        </button>

        <button className="onboarding__choice-card" onClick={onSkip}>
          <span className="onboarding__choice-icon">→</span>
          <span className="onboarding__choice-title">Skip for now</span>
          <span className="onboarding__choice-desc">
            Go straight to the dashboard. You can set up later.
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Step 1: Pay Schedule ───────────────────────────────────────────────────

function StepPaySchedule({
  payFrequency, setPayFrequency,
  nextPayDate,  setNextPayDate,
  lastPayAmount, setLastPayAmount,
  onBack, onNext,
}) {
  const canContinue = !!nextPayDate;

  return (
    <div className="onboarding__step">
      <button className="onboarding__back" onClick={onBack}>← Back</button>

      <div className="onboarding__step-header">
        <span className="eyebrow">Step 1 of 4</span>
        <h2 className="onboarding__step-title">When do you get paid?</h2>
        <p className="onboarding__step-desc">
          Ledgr uses your pay schedule to calculate which bills are due each paycheck.
        </p>
      </div>

      <div className="onboarding__form-card">
        <div className="field">
          <label className="field__label">Pay frequency</label>
          <select
            className="select"
            value={payFrequency}
            onChange={(e) => setPayFrequency(e.target.value)}
          >
            <option value="biweekly">Biweekly (every 2 weeks)</option>
            <option value="semimonthly">Semimonthly (1st & 15th)</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div className="field">
          <label className="field__label">Next pay date</label>
          <input
            className="input"
            type="date"
            value={nextPayDate}
            onChange={(e) => setNextPayDate(e.target.value)}
          />
          <div className="field__hint">Pick the date your next paycheck arrives.</div>
        </div>

        <div className="field">
          <label className="field__label">Typical take‑home pay</label>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: "0.9rem", top: "50%",
              transform: "translateY(-50%)", color: "var(--ink-faint)",
              fontFamily: "JetBrains Mono, monospace", pointerEvents: "none",
            }}>$</span>
            <input
              className="input input--money"
              type="number"
              min="0"
              step="1"
              placeholder="3,600"
              value={lastPayAmount}
              onChange={(e) => setLastPayAmount(e.target.value)}
              style={{ paddingLeft: "2rem" }}
            />
          </div>
          <div className="field__hint">Your net (after-tax) amount per paycheck.</div>
        </div>
      </div>

      <div className="onboarding__actions">
        <button
          className="btn"
          onClick={onNext}
          disabled={!canContinue}
          style={{ opacity: canContinue ? 1 : 0.45 }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Verify Income ──────────────────────────────────────────────────

function StepIncome({ onBack, onNext }) {
  const uploadRef                   = useRef(null);
  const [uploading, setUploading]   = useState(false);
  const [stubs, setStubs]           = useState([]);

  async function handleFiles(files) {
    if (stubs.length >= 6) return;
    setUploading(true);
    try {
      for (const f of files) {
        if (stubs.length >= 6) break;
        const doc = await api.uploadDocument(f);
        setStubs((prev) => [...prev, { doc, analyzing: false, applied: false }]);
        analyzeStub(doc.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function analyzeStub(id) {
    setStubs((prev) => prev.map((s) => s.doc.id === id ? { ...s, analyzing: true } : s));
    try {
      await api.analyzeDocument(id);
      const all = await api.documents();
      const analyzed = all.find((d) => d.id === id);

      if (analyzed?.analysis?.income) {
        await api.applyDocument(id, { income: true, billIndices: [] });
        const inc = analyzed.analysis.income;
        setStubs((prev) => prev.map((s) => s.doc.id === id ? {
          ...s, analyzing: false, applied: true,
          net: inc.net, date: inc.date, employer: inc.employer,
        } : s));
      } else {
        setStubs((prev) => prev.map((s) => s.doc.id === id ? {
          ...s, analyzing: false, noIncome: true,
        } : s));
      }
    } catch (err) {
      setStubs((prev) => prev.map((s) => s.doc.id === id ? {
        ...s, analyzing: false, error: err.message,
      } : s));
    }
  }

  const appliedCount = stubs.filter((s) => s.applied).length;

  return (
    <div className="onboarding__step">
      <button className="onboarding__back" onClick={onBack}>← Back</button>

      <div className="onboarding__step-header">
        <span className="eyebrow">Step 2 of 4</span>
        <h2 className="onboarding__step-title">Verify your income</h2>
        <p className="onboarding__step-desc">
          Upload up to 6 recent pay stubs. Claude reads each one and adds it to your
          income history so the dashboard can show accurate numbers.
        </p>
      </div>

      {stubs.length < 6 && (
        <div
          className={`drop-zone${uploading ? " drop-zone--uploading" : ""}`}
          onClick={() => !uploading && uploadRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            if (files.length) handleFiles(files);
          }}
        >
          <input
            ref={uploadRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files);
              if (files.length) handleFiles(files);
              e.target.value = "";
            }}
          />
          <div className="drop-zone__icon">{uploading ? "⏳" : "↑"}</div>
          <div style={{ fontWeight: 600 }}>
            {uploading ? "Uploading…" : "Drop pay stubs here or click to browse"}
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--ink-faint)", marginTop: "0.4rem" }}>
            PDF, JPG, PNG · Up to 6 stubs · Max 20 MB each
          </div>
        </div>
      )}

      {stubs.length > 0 && (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {stubs.map((s) => (
            <StubRow key={s.doc.id} stub={s} />
          ))}
        </div>
      )}

      <div className="onboarding__actions">
        <button className="btn" onClick={onNext}>
          {appliedCount > 0
            ? `Continue with ${appliedCount} stub${appliedCount !== 1 ? "s" : ""} →`
            : "Skip for now →"}
        </button>
      </div>

      {appliedCount === 0 && (
        <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--ink-faint)", marginTop: "0.75rem" }}>
          We'll use your manually entered take-home pay as a baseline if you skip.
        </p>
      )}
    </div>
  );
}

function StubRow({ stub }) {
  const { doc, analyzing, applied, noIncome, net, date, employer, error } = stub;
  return (
    <div style={{
      background: "var(--bg-elevated)", borderRadius: 8,
      border: "1px solid var(--rule)", padding: "0.75rem 1rem",
      display: "flex", alignItems: "center", gap: "0.75rem",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.originalName}
        </div>
        {applied && (
          <div style={{ fontSize: "0.78rem", color: "var(--gain)", marginTop: 2 }}>
            {fmt(net, { cents: true })} net · {date}{employer ? ` · ${employer}` : ""}
          </div>
        )}
        {noIncome && (
          <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: 2 }}>
            No income data found in this document
          </div>
        )}
        {error && (
          <div style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: 2 }}>{error}</div>
        )}
      </div>
      <div style={{ flexShrink: 0, minWidth: 24, textAlign: "center" }}>
        {analyzing && <span style={{ fontSize: "0.78rem", color: "var(--ink-faint)" }}>…</span>}
        {applied && <span style={{ color: "var(--gain)", fontWeight: 700, fontSize: "1.1rem" }}>✓</span>}
        {(noIncome || error) && <span style={{ color: "var(--ink-faint)" }}>—</span>}
      </div>
    </div>
  );
}

// ─── Step 3: Spending & Savings ─────────────────────────────────────────────

function StepSpending({
  allowance, setAllowance,
  groceries, setGroceries,
  autoSave,  setAutoSave,
  onBack, onNext,
}) {
  return (
    <div className="onboarding__step">
      <button className="onboarding__back" onClick={onBack}>← Back</button>

      <div className="onboarding__step-header">
        <span className="eyebrow">Step 3 of 4</span>
        <h2 className="onboarding__step-title">Spending &amp; savings</h2>
        <p className="onboarding__step-desc">
          Tell Ledgr how you typically allocate each paycheck. These amounts help the
          dashboard show an accurate picture of what's really left over.
        </p>
      </div>

      <div className="onboarding__form-card">
        <MoneyField
          label="Allowance per pay period"
          hint="Fun money — eating out, entertainment, personal spending."
          placeholder="200"
          value={allowance}
          onChange={setAllowance}
        />
        <MoneyField
          label="Groceries per pay period"
          hint="Your estimated grocery budget each paycheck."
          placeholder="250"
          value={groceries}
          onChange={setGroceries}
        />
        <MoneyField
          label="Auto-save per pay period"
          hint="Amount automatically moved to savings each paycheck. Skip if you handle savings manually."
          placeholder="100"
          value={autoSave}
          onChange={setAutoSave}
        />
      </div>

      <div className="onboarding__actions">
        <button className="btn" onClick={onNext}>
          Continue →
        </button>
      </div>
    </div>
  );
}

function MoneyField({ label, hint, placeholder, value, onChange }) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: "0.9rem", top: "50%",
          transform: "translateY(-50%)", color: "var(--ink-faint)",
          fontFamily: "JetBrains Mono, monospace", pointerEvents: "none",
        }}>$</span>
        <input
          className="input input--money"
          type="number"
          min="0"
          step="1"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingLeft: "2rem" }}
        />
      </div>
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

// ─── Step 3: Bills ──────────────────────────────────────────────────────────

function StepBills({ addedBills, onBillAdded, onBack, onNext }) {
  const [mode, setMode]           = useState(null);
  const [billDraft, setBillDraft] = useState(EMPTY_BILL);
  const [saving, setSaving]       = useState(false);
  const [deleteId, setDeleteId]   = useState(null);

  const uploadRef                       = useRef(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [analyzingId, setAnalyzingId]   = useState(null);

  async function addBill() {
    if (!billDraft.name || !billDraft.amount) return;
    setSaving(true);
    try {
      await api.addBill({ ...billDraft, amount: Number(billDraft.amount) });
      await onBillAdded();
      setBillDraft(EMPTY_BILL);
      setMode(null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteBill(id) {
    setDeleteId(id);
    try {
      await api.deleteBill(id);
      await onBillAdded();
    } finally {
      setDeleteId(null);
    }
  }

  async function handleFiles(files) {
    setUploading(true);
    try {
      const docs = [];
      for (const f of files) {
        const doc = await api.uploadDocument(f);
        docs.push(doc);
      }
      setUploadedDocs((prev) => [...prev, ...docs]);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function analyzeDoc(id) {
    setAnalyzingId(id);
    try {
      await api.analyzeDocument(id);
      const all = await api.documents();
      setUploadedDocs((prev) =>
        prev.map((d) => all.find((a) => a.id === d.id) || d)
      );
    } finally {
      setAnalyzingId(null);
    }
  }

  async function applyDoc(docId, billIndices) {
    await api.applyDocument(docId, { income: false, billIndices });
    await onBillAdded();
    setUploadedDocs((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: "applied" } : d))
    );
  }

  return (
    <div className="onboarding__step">
      <button className="onboarding__back" onClick={onBack}>← Back</button>

      <div className="onboarding__step-header">
        <span className="eyebrow">Step 4 of 4</span>
        <h2 className="onboarding__step-title">Your recurring bills</h2>
        <p className="onboarding__step-desc">
          Add every monthly bill — housing, utilities, subscriptions, insurance, loans.
          You can add more or remove them any time from the Bills page.
        </p>
      </div>

      <div className="onboarding__bill-actions">
        <button
          className={`onboarding__bill-action-btn${mode === "manual" ? " onboarding__bill-action-btn--active" : ""}`}
          onClick={() => setMode(mode === "manual" ? null : "manual")}
        >
          <span>✚</span> Add manually
        </button>
        <button
          className={`onboarding__bill-action-btn${mode === "upload" ? " onboarding__bill-action-btn--active" : ""}`}
          onClick={() => setMode(mode === "upload" ? null : "upload")}
        >
          <span>↑</span> Upload a statement
        </button>
      </div>

      {mode === "manual" && (
        <div className="onboarding__form-card" style={{ marginBottom: "1rem" }}>
          <div className="grid grid-2" style={{ gap: "0.85rem" }}>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label className="field__label">Bill name</label>
              <input
                className="input"
                placeholder="e.g. Mortgage, Verizon, Spotify"
                value={billDraft.name}
                onChange={(e) => setBillDraft({ ...billDraft, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addBill()}
              />
            </div>
            <div className="field">
              <label className="field__label">Typical amount</label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: "0.9rem", top: "50%",
                  transform: "translateY(-50%)", color: "var(--ink-faint)",
                  fontFamily: "JetBrains Mono, monospace", pointerEvents: "none",
                }}>$</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={billDraft.amount}
                  onChange={(e) => setBillDraft({ ...billDraft, amount: e.target.value })}
                  style={{ paddingLeft: "2rem" }}
                />
              </div>
            </div>
            <div className="field">
              <label className="field__label">Due day of month</label>
              <input
                className="input"
                type="number"
                min="1"
                max="31"
                value={billDraft.dueDay}
                onChange={(e) => setBillDraft({ ...billDraft, dueDay: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label className="field__label">Category</label>
              <select
                className="select"
                value={billDraft.category}
                onChange={(e) => setBillDraft({ ...billDraft, category: e.target.value })}
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field__label">Type</label>
              <select
                className="select"
                value={billDraft.type}
                onChange={(e) => setBillDraft({ ...billDraft, type: e.target.value })}
              >
                <option value="needs">Needs</option>
                <option value="wants">Wants</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
            <button
              className="btn"
              onClick={addBill}
              disabled={saving || !billDraft.name || !billDraft.amount}
            >
              {saving ? "Adding…" : "Add bill"}
            </button>
            <button className="btn btn--ghost" onClick={() => { setMode(null); setBillDraft(EMPTY_BILL); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "upload" && (
        <div className="onboarding__form-card" style={{ marginBottom: "1rem" }}>
          <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)", marginBottom: "1rem" }}>
            Drop a bill statement (PDF or image) and AI will extract the bill details automatically.
          </p>

          <div
            className={`drop-zone${uploading ? " drop-zone--uploading" : ""}`}
            style={{ padding: "1.5rem 1rem" }}
            onClick={() => !uploading && uploadRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files);
              if (files.length) handleFiles(files);
            }}
          >
            <input
              ref={uploadRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files);
                if (files.length) handleFiles(files);
                e.target.value = "";
              }}
            />
            <div className="drop-zone__icon">{uploading ? "⏳" : "↑"}</div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {uploading ? "Uploading…" : "Drop files here or click to browse"}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: "0.3rem" }}>
              PDF, JPG, PNG · Max 20 MB
            </div>
          </div>

          {uploadedDocs.length > 0 && (
            <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {uploadedDocs.map((doc) => (
                <UploadDocRow
                  key={doc.id}
                  doc={doc}
                  analyzing={analyzingId === doc.id}
                  onAnalyze={() => analyzeDoc(doc.id)}
                  onApply={(indices) => applyDoc(doc.id, indices)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="onboarding__bills-list">
        {addedBills.length === 0 ? (
          <div className="onboarding__bills-empty">
            No bills added yet — use the buttons above to get started.
          </div>
        ) : (
          <>
            <div className="onboarding__bills-list-header">
              {addedBills.length} bill{addedBills.length !== 1 ? "s" : ""} added
            </div>
            {addedBills.map((b) => (
              <div key={b.id} className="onboarding__bill-row">
                <div className="onboarding__bill-row-info">
                  <span className="onboarding__bill-name">{b.name}</span>
                  <span className="onboarding__bill-meta">
                    {b.category} · due {ordinal(b.dueDay)}
                  </span>
                </div>
                <span className="onboarding__bill-amount mono">{fmt(b.amount)}</span>
                <button
                  className="onboarding__bill-delete"
                  onClick={() => deleteBill(b.id)}
                  disabled={deleteId === b.id}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="onboarding__actions">
        <button className="btn" onClick={onNext}>
          {addedBills.length === 0 ? "Skip for now →" : "Finish setup →"}
        </button>
      </div>
    </div>
  );
}

// ─── Inline Upload Doc Row ──────────────────────────────────────────────────

function UploadDocRow({ doc, analyzing, onAnalyze, onApply }) {
  const [selected, setSelected]     = useState([]);
  const [applying, setApplying]     = useState(false);
  const [applied, setApplied]       = useState(doc.status === "applied");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (doc.analysis?.bills) {
      setSelected(doc.analysis.bills.map((_, i) => i));
    }
  }, [doc.analysis]);

  async function apply() {
    setApplying(true);
    try {
      await onApply(selected);
      setApplied(true);
      setShowPicker(false);
    } finally {
      setApplying(false);
    }
  }

  const bills = doc.analysis?.bills || [];

  return (
    <div style={{
      background: "var(--bg-elevated)", borderRadius: 8,
      border: "1px solid var(--rule)", padding: "0.85rem 1rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{doc.originalName}</div>
          {doc.analysis?.summary && (
            <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: "2px" }}>
              {doc.analysis.summary}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          {applied ? (
            <span style={{ color: "var(--gain)", fontWeight: 600, fontSize: "0.85rem" }}>✓ Applied</span>
          ) : doc.status === "pending" ? (
            <button className="btn" onClick={onAnalyze} disabled={analyzing} style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}>
              {analyzing ? "Analyzing…" : "Analyze with AI"}
            </button>
          ) : bills.length > 0 ? (
            <button className="btn" onClick={() => setShowPicker((p) => !p)} style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}>
              Add {bills.length} bill{bills.length !== 1 ? "s" : ""}
            </button>
          ) : (
            <span style={{ color: "var(--ink-faint)", fontSize: "0.82rem" }}>No bills found</span>
          )}
        </div>
      </div>

      {showPicker && bills.length > 0 && (
        <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--rule)", paddingTop: "0.75rem" }}>
          {bills.map((b, i) => (
            <label key={i} className="apply-row">
              <input
                type="checkbox"
                checked={selected.includes(i)}
                onChange={() =>
                  setSelected((prev) =>
                    prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                  )
                }
              />
              <span>
                <strong>{b.name}</strong> — {fmt(b.amount, { cents: true })} · due day {b.dueDay} · {b.category}
              </span>
            </label>
          ))}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button className="btn" onClick={apply} disabled={applying || selected.length === 0}
              style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}>
              {applying ? "Adding…" : `Add ${selected.length} selected`}
            </button>
            <button className="btn btn--ghost" onClick={() => setShowPicker(false)}
              style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Done ───────────────────────────────────────────────────────────

function StepDone({ addedBills, payAmount, nextPayDate, allowance, groceries, autoSave, saving, onFinish }) {
  const totalMonthly  = addedBills.reduce((s, b) => s + (b.amount || 0), 0);
  const perPeriodSpend = (Number(allowance) || 0) + (Number(groceries) || 0);
  const remaining     = payAmount
    ? Number(payAmount) - totalMonthly / 2 - perPeriodSpend - (Number(autoSave) || 0)
    : null;

  const fmtDate = nextPayDate
    ? new Date(nextPayDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <div className="onboarding__step onboarding__step--done">
      <div className="onboarding__done-check">✓</div>

      <h2 className="onboarding__step-title" style={{ textAlign: "center" }}>
        You're all set!
      </h2>
      <p className="onboarding__step-desc" style={{ textAlign: "center" }}>
        Your budget is ready. Here's a quick summary of what you've set up.
      </p>

      <div className="onboarding__form-card onboarding__summary">
        <div className="onboarding__summary-row">
          <span>Bills tracked</span>
          <strong>{addedBills.length}</strong>
        </div>
        {totalMonthly > 0 && (
          <div className="onboarding__summary-row">
            <span>Total monthly bills</span>
            <strong>{fmt(totalMonthly)}</strong>
          </div>
        )}
        {fmtDate && (
          <div className="onboarding__summary-row">
            <span>Next paycheck</span>
            <strong>{fmtDate}</strong>
          </div>
        )}
        {payAmount && (
          <div className="onboarding__summary-row">
            <span>Expected take-home</span>
            <strong>{fmt(payAmount)}</strong>
          </div>
        )}
        {groceries && Number(groceries) > 0 && (
          <div className="onboarding__summary-row">
            <span>Groceries / period</span>
            <strong>{fmt(groceries)}</strong>
          </div>
        )}
        {allowance && Number(allowance) > 0 && (
          <div className="onboarding__summary-row">
            <span>Allowance / period</span>
            <strong>{fmt(allowance)}</strong>
          </div>
        )}
        {autoSave && Number(autoSave) > 0 && (
          <div className="onboarding__summary-row">
            <span>Auto-save / period</span>
            <strong>{fmt(autoSave)}</strong>
          </div>
        )}
        {remaining !== null && remaining > 0 && (
          <div className="onboarding__summary-row" style={{ color: "var(--gain)" }}>
            <span>Est. per-period surplus</span>
            <strong>{fmt(remaining)}</strong>
          </div>
        )}
      </div>

      <div className="onboarding__actions">
        <button className="btn" onClick={onFinish} disabled={saving}>
          {saving ? "Saving…" : "Go to dashboard →"}
        </button>
      </div>

      <p style={{ textAlign: "center", fontSize: "0.82rem", color: "var(--ink-faint)", marginTop: "1rem" }}>
        You can always add or remove bills from the Bills page, and update your pay schedule in Settings.
      </p>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
