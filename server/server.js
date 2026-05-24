import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import {
  computeStats,
  recommendAllowance,
  allocatePaycheck,
  forecastUpcomingBills,
  insights,
  ceilDollar,
} from "./engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR    = path.join(__dirname, "data");
const BUDGETS_PATH = path.join(DATA_DIR, "budgets.json");
const BACKUPS_DIR  = path.join(DATA_DIR, "backups");
const UPLOADS_DIR  = path.join(DATA_DIR, "uploads");

// Load .env without relying on the dotenv package (avoids dotenvx interception)
try {
  const envLines = fs.readFileSync(path.join(__dirname, ".env"), "utf-8").split("\n");
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env is optional */ }

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

// ---------- Multi-budget registry ----------

function createEmptyDB(ownerName = "") {
  return {
    meta: { owner: ownerName, createdAt: new Date().toISOString().slice(0, 10) },
    bills: [],
    paychecks: [],
    savingsGoals: [],
    sinkingFunds: [],
    allocations: [],
    snapshots: [],
    documents: [],
    variableExpenses: [],
    settings: {
      roundUp: true,
      sinkingFundsEnabled: true,
      emergencyFundTargetMonths: 6,
      savingsRatePctTarget: 20,
      needsRatePctTarget: 50,
      wantsRatePctTarget: 30,
      onboarded: false,
    },
  };
}

function loadBudgetsMeta() {
  if (!fs.existsSync(BUDGETS_PATH)) {
    // First run — migrate existing db.json if present, else start fresh
    const legacyPath = path.join(DATA_DIR, "db.json");
    const id   = "budget-" + Date.now();
    const file = `db-${id}.json`;
    const meta = {
      active: id,
      budgets: [{ id, name: "My Budget", createdAt: new Date().toISOString().slice(0, 10), file }],
    };
    if (fs.existsSync(legacyPath)) {
      fs.copyFileSync(legacyPath, path.join(DATA_DIR, file));
    } else {
      fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(createEmptyDB(), null, 2));
    }
    fs.writeFileSync(BUDGETS_PATH, JSON.stringify(meta, null, 2));
    return meta;
  }
  return JSON.parse(fs.readFileSync(BUDGETS_PATH, "utf-8"));
}

function saveBudgetsMeta(meta) {
  fs.writeFileSync(BUDGETS_PATH, JSON.stringify(meta, null, 2));
}

function getActiveDBPath() {
  const meta   = loadBudgetsMeta();
  const budget = meta.budgets.find((b) => b.id === meta.active);
  if (!budget) throw new Error("Active budget not found");
  return path.join(DATA_DIR, budget.file);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------- JSON file "database" ----------
function loadDB() {
  const raw = fs.readFileSync(getActiveDBPath(), "utf-8");
  const db  = JSON.parse(raw);
  if (!db.documents)        db.documents = [];
  if (!db.variableExpenses) db.variableExpenses = [];
  return db;
}

function saveDB(db) {
  const dbPath = getActiveDBPath();
  const tmp    = dbPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbPath);
}

function withDB(handler) {
  return (req, res) => {
    try {
      const db = loadDB();
      const result = handler(req, db);
      if (result && result.mutated) saveDB(db);
      res.json(result?.body ?? {});
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  };
}

function asyncWithDB(handler) {
  return async (req, res) => {
    try {
      const db = loadDB();
      const result = await handler(req, db);
      if (result && result.mutated) saveDB(db);
      res.json(result?.body ?? {});
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  };
}

// ---------- Core read endpoints ----------
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get("/api/db", withDB((_req, db) => ({ body: db })));

app.get("/api/dashboard", withDB((_req, db) => {
  const stats = computeStats(db);
  const upcoming = forecastUpcomingBills(db, 30);
  const tips = insights(db, stats);
  return { body: { stats, upcoming, insights: tips } };
}));

app.get("/api/bills", withDB((_req, db) => ({ body: db.bills })));

app.get("/api/paychecks", withDB((_req, db) => ({ body: db.paychecks })));

app.get("/api/savings", withDB((_req, db) => ({
  body: { goals: db.savingsGoals, sinkingFunds: db.sinkingFunds },
})));

app.get("/api/allocations", withDB((_req, db) => ({ body: db.allocations })));

app.get("/api/settings", withDB((_req, db) => ({
  body: { settings: db.settings, meta: db.meta },
})));

// ---------- Bills ----------
app.post("/api/bills", withDB((req, db) => {
  const incoming = req.body || {};
  if (!incoming.name || !incoming.amount) {
    throw new Error("Bill requires at least name and amount");
  }
  const id = incoming.id || incoming.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const bill = {
    id,
    name: incoming.name,
    category: incoming.category || "Other",
    dueDay: incoming.dueDay ?? 1,
    amount: Number(incoming.amount),
    type: incoming.type || "needs",
    essential: !!incoming.essential,
    seasonal: !!incoming.seasonal,
    history: incoming.history || [],
  };
  const existingIdx = db.bills.findIndex((b) => b.id === id);
  if (existingIdx >= 0) db.bills[existingIdx] = { ...db.bills[existingIdx], ...bill };
  else db.bills.push(bill);
  return { mutated: true, body: bill };
}));

app.delete("/api/bills/:id", withDB((req, db) => {
  const before = db.bills.length;
  db.bills = db.bills.filter((b) => b.id !== req.params.id);
  return { mutated: db.bills.length !== before, body: { removed: before - db.bills.length } };
}));

// ---------- Paychecks ----------
// Seed synthetic historical paychecks from a known net amount.
// Only runs if db.paychecks is empty — safe to call even if stubs were already applied.
app.post("/api/paychecks/seed", withDB((req, db) => {
  if (db.paychecks.length > 0) return { mutated: false, body: { seeded: 0 } };

  const { net, gross, source, nextPayDate, frequency, count = 6 } = req.body || {};
  if (!net) throw new Error("net required");

  const intervals = { biweekly: 14, weekly: 7, semimonthly: 15, monthly: 30 };
  const interval = intervals[frequency] || 14;
  const n = Math.min(Number(count), 12);

  const anchor = nextPayDate ? new Date(nextPayDate + "T00:00:00") : new Date();
  const today  = new Date();
  let seeded = 0;

  for (let i = 0; i < n; i++) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i * interval);
    if (d > today) continue; // skip future dates
    db.paychecks.push({
      id: `p-seed-${Date.now()}-${i}`,
      date: d.toISOString().slice(0, 10),
      gross: Number(gross || net),
      net: Number(net),
      source: source || "Employer",
      type: "regular",
    });
    seeded++;
  }

  db.paychecks.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { mutated: seeded > 0, body: { seeded } };
}));

app.post("/api/paychecks", withDB((req, db) => {
  const p = req.body || {};
  if (!p.net || !p.date) throw new Error("Paycheck requires date and net amount");
  const paycheck = {
    id: p.id || `p-${Date.now()}`,
    date: p.date,
    gross: Number(p.gross || p.net),
    net: Number(p.net),
    source: p.source || "Employer",
    type: p.type || "regular",
  };
  db.paychecks.push(paycheck);
  db.paychecks.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { mutated: true, body: paycheck };
}));

// ---------- Savings Goals ----------
app.post("/api/savings/goals", withDB((req, db) => {
  const g = req.body || {};
  const id = g.id || `goal-${Date.now()}`;
  const goal = {
    id,
    name: g.name,
    target: Number(g.target || 0),
    current: Number(g.current || 0),
    priority: Number(g.priority || 99),
    monthlyContribution: Number(g.monthlyContribution || 0),
    createdAt: g.createdAt || new Date().toISOString().slice(0, 10),
  };
  const idx = db.savingsGoals.findIndex((x) => x.id === id);
  if (idx >= 0) db.savingsGoals[idx] = { ...db.savingsGoals[idx], ...goal };
  else db.savingsGoals.push(goal);
  return { mutated: true, body: goal };
}));

app.delete("/api/savings/goals/:id", withDB((req, db) => {
  const before = db.savingsGoals.length;
  db.savingsGoals = db.savingsGoals.filter((g) => g.id !== req.params.id);
  return { mutated: db.savingsGoals.length !== before, body: { removed: before - db.savingsGoals.length } };
}));

app.post("/api/savings/goals/:id/contribute", withDB((req, db) => {
  const amount = Number(req.body?.amount || 0);
  const goal = db.savingsGoals.find((g) => g.id === req.params.id);
  if (!goal) throw new Error("Goal not found");
  goal.current += amount;
  return { mutated: true, body: goal };
}));

// ---------- Variable Expenses ----------
app.put("/api/variable-expenses", withDB((req, db) => {
  const { allowance, groceries } = req.body || {};

  function upsert(id, name, perPeriodValue) {
    const monthlyTarget = Math.round(Number(perPeriodValue) * 2);
    const entry = { id, name, monthlyTarget, category: "Lifestyle" };
    const idx = db.variableExpenses.findIndex((v) => v.id === id);
    if (idx >= 0) db.variableExpenses[idx] = { ...db.variableExpenses[idx], ...entry };
    else db.variableExpenses.push(entry);
  }

  if (allowance !== undefined && allowance !== "") upsert("allowance", "Allowance", allowance);
  if (groceries !== undefined && groceries !== "") upsert("groceries", "Groceries", groceries);

  return { mutated: true, body: db.variableExpenses };
}));

// ---------- Settings ----------
app.put("/api/settings", withDB((req, db) => {
  db.settings = { ...db.settings, ...(req.body || {}) };
  return { mutated: true, body: db.settings };
}));

// ---------- Paycheck allocation engine ----------
app.post("/api/allocate", withDB((req, db) => {
  const { net, date, label, save = false } = req.body || {};
  if (!net) throw new Error("net pay required");
  const result = allocatePaycheck(db, Number(net), date || new Date().toISOString().slice(0, 10));
  if (save) {
    db.allocations.push({
      id: `alloc-${Date.now()}`,
      date: date || new Date().toISOString().slice(0, 10),
      label: label || null,
      net: Number(net),
      result,
    });
  }
  return { mutated: save, body: result };
}));

app.get("/api/allowance/recommendation", withDB((_req, db) => {
  const rec = recommendAllowance(db);
  return { body: rec };
}));

// ---------- Snapshots ----------
app.post("/api/snapshots", withDB((_req, db) => {
  const stats = computeStats(db);
  const snap = {
    id: `snap-${Date.now()}`,
    date: new Date().toISOString(),
    stats,
  };
  db.snapshots.push(snap);
  return { mutated: true, body: snap };
}));

app.get("/api/snapshots", withDB((_req, db) => ({ body: db.snapshots })));

// ---------- Utility ----------
app.get("/api/round-up", (req, res) => {
  const amt = Number(req.query.amount || 0);
  res.json({ amount: amt, rounded: ceilDollar(amt), savings: ceilDollar(amt) - amt });
});

// ---------- Documents ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const id = `doc-${Date.now()}`;
      const ext = path.extname(file.originalname).toLowerCase() || ".bin";
      cb(null, id + ext);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.get("/api/documents", withDB((_req, db) => ({ body: db.documents })));

app.post("/api/documents/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded or unsupported type" });
    const db = loadDB();
    const id = path.basename(req.file.filename, path.extname(req.file.filename));
    const doc = {
      id,
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      status: "pending",
      analysis: null,
    };
    db.documents.push(doc);
    saveDB(db);
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const ANALYSIS_PROMPT = `You are a financial document parser. Analyze this document and extract all financial information precisely.

Return ONLY valid JSON — no markdown fences, no explanation, no extra text. Use this exact structure:
{
  "documentType": "paystub" | "bill" | "bank_statement" | "unknown",
  "summary": "one-sentence description of what this document is",
  "income": null | {
    "gross": <number>,
    "net": <number>,
    "date": "<YYYY-MM-DD pay date>",
    "employer": "<employer name>",
    "payFrequency": "weekly" | "biweekly" | "semimonthly" | "monthly"
  },
  "bills": [
    {
      "name": "<service or creditor name>",
      "amount": <number — the amount due on this statement>,
      "dueDay": <1-31, day of month the bill is typically due>,
      "category": "Housing" | "Transportation" | "Utilities" | "Subscriptions" | "Health" | "Credit Cards" | "Insurance" | "Other",
      "type": "needs" | "wants",
      "essential": <boolean>
    }
  ]
}

Rules:
- For a paystub: populate income with gross/net from this specific paycheck; bills should be []
- For a bill or statement: income should be null; bills should contain EXACTLY ONE entry representing the total amount due on the statement — do NOT break out individual line items or charges; the amount should be the total/amount due shown on the statement
- For a bank statement: income should be null (unless a clear paycheck deposit is shown); bills should list recurring debits that appear to be subscriptions or fixed payments, one entry per payee (not per transaction)
- dueDay should be the day of month extracted from the due date on the bill (e.g. "Due June 15" → 15)
- All dollar amounts must be positive numbers (no $ sign, no commas)
- If a field cannot be determined, use the closest reasonable estimate or null`;

app.post("/api/documents/:id/analyze", asyncWithDB(async (req, db) => {
  const doc = db.documents.find((d) => d.id === req.params.id);
  if (!doc) throw new Error("Document not found");

  const filePath = path.join(UPLOADS_DIR, doc.filename);
  if (!fs.existsSync(filePath)) throw new Error("File not found on disk");

  const fileData = fs.readFileSync(filePath);
  const base64 = fileData.toString("base64");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const contentBlock =
    doc.mimetype === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: doc.mimetype, data: base64 } };

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: [contentBlock, { type: "text", text: ANALYSIS_PROMPT }] }],
  });

  const rawText = message.content[0].text.trim();
  let analysis;
  try {
    analysis = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      analysis = JSON.parse(match[0]);
    } else {
      analysis = { documentType: "unknown", summary: "Could not parse document", income: null, bills: [] };
    }
  }

  doc.analysis = analysis;
  doc.status = "analyzed";
  return { mutated: true, body: doc };
}));

app.post("/api/documents/:id/apply", withDB((req, db) => {
  const doc = db.documents.find((d) => d.id === req.params.id);
  if (!doc) throw new Error("Document not found");
  if (!doc.analysis) throw new Error("Document has not been analyzed yet");

  const { income: applyIncome = false, billIndices = [] } = req.body || {};
  const { income, bills = [] } = doc.analysis;

  let appliedIncome = false;
  const appliedBills = [];
  const skippedBills = [];

  if (applyIncome && income) {
    const duplicate = db.paychecks.find(
      (p) => p.date === income.date && p.source === income.employer
    );
    if (!duplicate) {
      db.paychecks.push({
        id: `p-${Date.now()}`,
        date: income.date,
        gross: Number(income.gross),
        net: Number(income.net),
        source: income.employer,
        type: "regular",
      });
      db.paychecks.sort((a, b) => new Date(a.date) - new Date(b.date));
      appliedIncome = true;
    }
  }

  for (const idx of billIndices) {
    const bill = bills[idx];
    if (!bill) continue;
    const id = bill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (db.bills.find((b) => b.id === id)) {
      skippedBills.push(bill.name);
    } else {
      db.bills.push({
        id,
        name: bill.name,
        category: bill.category || "Other",
        dueDay: Number(bill.dueDay) || 1,
        amount: Number(bill.amount),
        type: bill.type || "needs",
        essential: !!bill.essential,
        history: [],
      });
      appliedBills.push(bill.name);
    }
  }

  doc.status = "applied";
  return { mutated: true, body: { appliedIncome, appliedBills, skippedBills } };
}));

app.delete("/api/documents/:id", withDB((req, db) => {
  const idx = db.documents.findIndex((d) => d.id === req.params.id);
  if (idx < 0) return { body: { removed: 0 } };
  const [doc] = db.documents.splice(idx, 1);
  const filePath = path.join(UPLOADS_DIR, doc.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { mutated: true, body: { removed: 1 } };
}));

// ---------- Budget management ----------

app.get("/api/budgets", (req, res) => {
  try {
    const meta = loadBudgetsMeta();
    res.json({ active: meta.active, budgets: meta.budgets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/budgets", (req, res) => {
  try {
    const { name = "New Budget" } = req.body || {};
    const id   = "budget-" + Date.now();
    const file = `db-${id}.json`;
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(createEmptyDB(), null, 2));
    const meta = loadBudgetsMeta();
    meta.budgets.push({ id, name, createdAt: new Date().toISOString().slice(0, 10), file });
    meta.active = id;
    saveBudgetsMeta(meta);
    res.json({ id, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/budgets/active", (req, res) => {
  try {
    const { id } = req.body || {};
    const meta = loadBudgetsMeta();
    if (!meta.budgets.find((b) => b.id === id)) throw new Error("Budget not found");
    meta.active = id;
    saveBudgetsMeta(meta);
    res.json({ active: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/budgets/:id/rename", (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) throw new Error("Name is required");
    const meta   = loadBudgetsMeta();
    const budget = meta.budgets.find((b) => b.id === req.params.id);
    if (!budget) throw new Error("Budget not found");
    budget.name = name.trim();
    saveBudgetsMeta(meta);
    res.json({ id: req.params.id, name: budget.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/budgets/:id", (req, res) => {
  try {
    const meta = loadBudgetsMeta();
    if (meta.budgets.length <= 1) throw new Error("Cannot delete the only budget — reset it instead.");
    const budget = meta.budgets.find((b) => b.id === req.params.id);
    if (!budget) throw new Error("Budget not found");

    // Back up then remove the db file
    const srcPath    = path.join(DATA_DIR, budget.file);
    const backupFile = `${budget.id}-backup-${Date.now()}.json`;
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(BACKUPS_DIR, backupFile));
      fs.unlinkSync(srcPath);
    }

    meta.budgets = meta.budgets.filter((b) => b.id !== req.params.id);
    if (meta.active === req.params.id) meta.active = meta.budgets[0].id;
    saveBudgetsMeta(meta);
    res.json({ deleted: req.params.id, backup: backupFile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset current budget: backs up data and wipes it clean
app.post("/api/budgets/active/reset", (req, res) => {
  try {
    const meta   = loadBudgetsMeta();
    const budget = meta.budgets.find((b) => b.id === meta.active);
    const dbPath = getActiveDBPath();

    const backupFile = `${budget.id}-backup-${Date.now()}.json`;
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(BACKUPS_DIR, backupFile));
    }
    fs.writeFileSync(dbPath, JSON.stringify(createEmptyDB(), null, 2));
    res.json({ reset: budget.id, backup: backupFile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Start ----------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🟢 Budget API listening on http://localhost:${PORT}`);
});
