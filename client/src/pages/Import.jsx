import { useEffect, useRef, useState } from "react";
import { api, fmt } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.webp";

export default function Import() {
  const [docs, setDocs] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const inputRef = useRef(null);

  async function load() {
    const d = await api.documents();
    setDocs(d);
  }

  useEffect(() => { load(); }, []);

  async function handleFiles(files) {
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of files) {
        await api.uploadDocument(file);
      }
      await load();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFiles(files);
  }

  function onInputChange(e) {
    const files = Array.from(e.target.files);
    if (files.length) handleFiles(files);
    e.target.value = "";
  }

  async function deleteDoc(id) {
    if (!confirm("Remove this document?")) return;
    await api.deleteDocument(id);
    load();
  }

  return (
    <>
      <PageHeader
        eyebrow="AI-powered setup"
        title="Import documents."
        subtitle="Upload pay stubs, bill statements, or bank statements. Claude reads each document and extracts your income and bills automatically — you review and choose what to add to your budget."
      />

      <div
        className={`drop-zone${dragging ? " drop-zone--dragging" : ""}${uploading ? " uploading" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          style={{ display: "none" }}
          onChange={onInputChange}
        />
        <div className="drop-zone__icon">{uploading ? "⏳" : "↑"}</div>
        <div style={{ fontWeight: 600 }}>
          {uploading ? "Uploading…" : "Drop files here or click to browse"}
        </div>
        <div style={{ fontSize: "0.82rem", color: "var(--ink-faint)", marginTop: "0.4rem" }}>
          Accepts PDF, JPG, PNG · Max 20 MB per file
        </div>
      </div>

      {uploadError && (
        <div className="insight insight--error" style={{ marginTop: "1rem" }}>
          <div className="insight__title">Upload failed</div>
          <div className="insight__body">{uploadError}</div>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--ink-faint)", padding: "3rem", marginTop: "2rem" }}>
          No documents uploaded yet. Drop your first pay stub or bill above to get started.
        </div>
      ) : (
        <div className="grid" style={{ gap: "1rem", marginTop: "2rem" }}>
          {[...docs].reverse().map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onRefresh={load}
              onDelete={() => deleteDoc(doc.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DocumentCard({ doc, onRefresh, onDelete }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [applyIncome, setApplyIncome] = useState(true);
  const [selectedBills, setSelectedBills] = useState([]);
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  useEffect(() => {
    if (doc.analysis?.bills) {
      setSelectedBills(doc.analysis.bills.map((_, i) => i));
    }
  }, [doc.analysis]);

  async function analyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    setApplyResult(null);
    try {
      await api.analyzeDocument(doc.id);
      onRefresh();
    } catch (err) {
      setAnalyzeError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function apply() {
    setApplying(true);
    try {
      const result = await api.applyDocument(doc.id, {
        income: applyIncome && !!doc.analysis?.income,
        billIndices: selectedBills,
      });
      setApplyResult(result);
      setShowApplyPanel(false);
      onRefresh();
    } finally {
      setApplying(false);
    }
  }

  function toggleBill(i) {
    setSelectedBills((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  }

  const { analysis } = doc;
  const statusColor = doc.status === "applied" ? "gain" : doc.status === "analyzed" ? "needs" : "";

  return (
    <div className="card">
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.3rem" }}>
            <h3 style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc.originalName}
            </h3>
            <span className={`pill${statusColor ? ` pill--${statusColor}` : ""}`}>{doc.status}</span>
            {analysis && <span className="pill">{analysis.documentType.replace("_", " ")}</span>}
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--ink-faint)" }}>
            {new Date(doc.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {analysis?.summary && ` · ${analysis.summary}`}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, flexWrap: "wrap" }}>
          {doc.status === "pending" && (
            <button className="btn" onClick={analyze} disabled={analyzing}>
              {analyzing ? "Analyzing…" : "Analyze with AI"}
            </button>
          )}
          {(doc.status === "analyzed" || doc.status === "applied") && (
            <>
              {doc.status === "analyzed" && (
                <button className="btn" onClick={() => setShowApplyPanel((p) => !p)}>
                  Apply to budget
                </button>
              )}
              <button className="btn btn--ghost" onClick={analyze} disabled={analyzing}>
                {analyzing ? "Re-analyzing…" : "Re-analyze"}
              </button>
            </>
          )}
          <button
            className="btn btn--ghost"
            onClick={onDelete}
            style={{ color: "var(--danger)", borderColor: "var(--danger-soft)" }}
          >
            Remove
          </button>
        </div>
      </div>

      {/* Analyze error */}
      {analyzeError && (
        <div className="insight insight--error" style={{ marginTop: "1rem" }}>
          <div className="insight__title">Analysis failed</div>
          <div className="insight__body">{analyzeError}</div>
        </div>
      )}

      {/* Analysis results */}
      {analysis && (
        <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--rule)", paddingTop: "1.25rem" }}>
          {analysis.income && (
            <div style={{ marginBottom: analysis.bills?.length ? "1.25rem" : 0 }}>
              <div className="stat__label" style={{ marginBottom: "0.6rem" }}>Income extracted</div>
              <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                <Stat label="Gross" value={fmt(analysis.income.gross, { cents: true })} mono />
                <Stat label="Net" value={fmt(analysis.income.net, { cents: true })} mono highlight />
                <Stat label="Date" value={analysis.income.date} mono />
                <Stat label="Employer" value={analysis.income.employer} />
                <Stat label="Frequency" value={analysis.income.payFrequency} />
              </div>
            </div>
          )}

          {analysis.bills?.length > 0 && (
            <div>
              <div className="stat__label" style={{ marginBottom: "0.6rem" }}>
                Bills found ({analysis.bills.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {analysis.bills.map((b, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "1rem",
                      alignItems: "center",
                      fontSize: "0.9rem",
                      padding: "0.4rem 0",
                      borderBottom: i < analysis.bills.length - 1 ? "1px solid var(--rule)" : "none",
                    }}
                  >
                    <span className="mono" style={{ fontWeight: 600, minWidth: "72px" }}>
                      {fmt(b.amount, { cents: true })}
                    </span>
                    <span style={{ flex: 1 }}>{b.name}</span>
                    <span style={{ color: "var(--ink-faint)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                      {b.category} · due day {b.dueDay}
                    </span>
                    <span className={`pill pill--${b.type}`}>{b.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!analysis.income && !analysis.bills?.length && (
            <div style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>
              No recognizable financial data found in this document.
            </div>
          )}
        </div>
      )}

      {/* Apply panel */}
      {showApplyPanel && analysis && (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "1.25rem",
            background: "var(--bg-elevated)",
            borderRadius: 8,
            border: "1px solid var(--rule)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "1rem" }}>Choose what to import</div>

          {analysis.income && (
            <label className="apply-row">
              <input
                type="checkbox"
                checked={applyIncome}
                onChange={(e) => setApplyIncome(e.target.checked)}
              />
              <div>
                <span style={{ fontWeight: 500 }}>Paycheck — </span>
                {fmt(analysis.income.net, { cents: true })} net · {analysis.income.date} · {analysis.income.employer}
              </div>
            </label>
          )}

          {analysis.bills?.map((b, i) => (
            <label key={i} className="apply-row">
              <input
                type="checkbox"
                checked={selectedBills.includes(i)}
                onChange={() => toggleBill(i)}
              />
              <div>
                <span style={{ fontWeight: 500 }}>{b.name} — </span>
                {fmt(b.amount, { cents: true })} · due day {b.dueDay} · {b.category}
              </div>
            </label>
          ))}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button className="btn" onClick={apply} disabled={applying}>
              {applying ? "Importing…" : "Import selected"}
            </button>
            <button className="btn btn--ghost" onClick={() => setShowApplyPanel(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Apply result */}
      {applyResult && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.85rem 1rem",
            background: "var(--gain-soft)",
            borderRadius: 6,
            fontSize: "0.88rem",
            color: "var(--gain)",
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
          }}
        >
          {applyResult.appliedIncome && <div>Paycheck added to your income history.</div>}
          {applyResult.appliedBills?.length > 0 && (
            <div>{applyResult.appliedBills.join(", ")} added to bills.</div>
          )}
          {applyResult.skippedBills?.length > 0 && (
            <div style={{ color: "var(--ink-faint)" }}>
              Skipped (already exist): {applyResult.skippedBills.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono, highlight }) {
  return (
    <div>
      <div className="stat__label" style={{ fontSize: "0.62rem" }}>{label}</div>
      <div
        className={mono ? "mono" : ""}
        style={{ fontSize: "1rem", fontWeight: highlight ? 700 : 500, color: highlight ? "var(--ink)" : "var(--ink-soft)" }}
      >
        {value}
      </div>
    </div>
  );
}
