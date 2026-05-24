# Ledgr — A Personal Budget App

A modern, local-first budget app built around your real pay history and bill data. Implements a hybrid budgeting strategy (zero-based + 50/30/20 + pay-yourself-first), with paycheck-by-paycheck bill stacking, sinking funds for seasonal bills, and round-up savings.

Built as a full-stack React + Express app that persists everything to a single `db.json` file — no external database, no cloud, runs entirely on your machine.

---

## i. What it does

- **Dashboard** — Net worth trajectory, savings rate vs target, monthly income/expense balance, bill volatility, and pay-history charts.
- **Paycheck Allocator** — Enter today's net pay, get back which bills to pay from this check, how much to send to savings/sinking funds, and a recommended allowance.
- **Bills** — Track every recurring bill with 6 months of history per bill, see volatility (standard deviation), and project the next expected amount using a seasonal-aware median.
- **Savings Goals & Sinking Funds** — Emergency fund, vacation, investment goals; plus dedicated buckets for seasonal bills (winter heat, car maintenance, annual subscriptions).
- **Insights** — Personalized allowance recommendations (aggressive / balanced / generous), volatility warnings, and budgeting philosophy notes.
- **Settings** — Adjust your target savings rate, needs/wants split, emergency-fund months, and toggle round-up savings or sinking funds.

## ii. Budgeting strategy

The engine combines three well-known frameworks:

1. **Zero-based budgeting** — every dollar of every paycheck has a job before it lands.
2. **50/30/20** — used as the sanity check on your overall needs/wants/savings split.
3. **Pay-yourself-first** — savings and sinking-fund contributions are allocated *before* discretionary spending.

Plus two practical layers from your existing spreadsheet:

- **Paycheck stacking** — each bill is assigned to a specific paycheck (the one closest to its due date).
- **Round-up savings** — every bill amount is rounded up to the nearest dollar, and the change accumulates in your main bill account.

## iii. Running it

### Requirements
- Node.js 18 or newer
- npm

### First-time setup
```bash
cd budget-app/server && npm install
cd ../client && npm install
```

### Start both services
From the repo root:
```bash
./start.sh
```
Or in two terminals:
```bash
# Terminal 1 — backend on :5174
cd budget-app/server && npm start

# Terminal 2 — frontend on :5173
cd budget-app/client && npm run dev
```

Open <http://localhost:5173>.

### Production build (optional)
```bash
cd budget-app/client && npm run build
```
The built static files land in `client/dist/`. Serve them however you like.

## iv. Data

All data lives in `server/data/db.json`. The repo ships with this file pre-seeded from your last 12 pay stubs, 6 months of bill statements, and your 2024 budget spreadsheet, so the app has real numbers from the moment you launch it.

To start over with a blank slate, delete `server/data/db.json` — the server will recreate an empty one on startup.

To back up your data, copy that one file somewhere safe.

## v. API surface

The Express server exposes a REST API on port `5174`. Vite's dev server proxies `/api/*` to it automatically.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/dashboard` | Aggregated stats for the home page |
| GET, POST, DELETE | `/api/bills` | List, create, delete bills |
| GET, POST | `/api/paychecks` | Pay history |
| GET, POST | `/api/savings/goals` | Goals |
| POST | `/api/savings/goals/:id/contribute` | Add to a goal |
| GET, PUT | `/api/settings` | Read/write settings |
| GET | `/api/allowance/recommendation` | Four allowance scenarios |
| POST | `/api/allocate` | Run the paycheck allocator |
| GET, POST | `/api/snapshots` | Periodic point-in-time snapshots |

## vi. Tech

- **Frontend** — React 18, React Router 6, Recharts, Vite
- **Backend** — Express 4, Node ESM
- **Storage** — A single JSON file
- **Typography** — Fraunces (display), Manrope (body), JetBrains Mono (numerics)
- **Theme** — Light (warm paper) and dark (deep ink), with a subtle grain overlay. Toggle in the sidebar; preference saved to `localStorage`.

## vii. Notes

- The seasonal projection for utility bills (Xcel, CenterPoint gas, water/trash) uses the median of similar months from prior data rather than a flat average — this matters a lot for your winter heating bill, which swings by ~$180.
- The allocator reserves a "cushion" line item on every paycheck so you're never allocating 100% of inflow.
- Bonus paychecks (like the March incentive payout) show up in pay history and are factored into your average, but the allowance recommender ignores them — it bases its numbers on your *recurring* net pay.
