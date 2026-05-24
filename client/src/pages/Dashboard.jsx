import { useEffect, useState } from "react";
import { api, fmt, fmtPct } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend, BarChart, Bar,
} from "recharts";

const COLORS = {
  needs:   "var(--info)",
  wants:   "var(--warn)",
  savings: "var(--gain)",
};

// ─── Pay-period helpers ────────────────────────────────────────────────────

function getCurrentPeriod(nextPayDateStr, frequency) {
  if (!nextPayDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const freq = frequency || "biweekly";
  const periodDays =
    freq === "weekly"      ? 7  :
    freq === "monthly"     ? 30 :
    freq === "semimonthly" ? 15 : 14;

  let payDate = new Date(nextPayDateStr + "T00:00:00");

  while (payDate < today) {
    payDate.setDate(payDate.getDate() + periodDays);
  }

  const end   = new Date(payDate);
  const start = new Date(payDate);
  start.setDate(start.getDate() - (periodDays - 1));

  return { start, end, periodDays };
}

function getBillsForPeriod(bills, start, end) {
  return bills
    .filter((bill) => {
      let cursor = new Date(start);
      while (cursor <= end) {
        if (cursor.getDate() === bill.dueDay) return true;
        cursor.setDate(cursor.getDate() + 1);
      }
      return false;
    })
    .map((bill) => {
      let cursor = new Date(start);
      while (cursor <= end) {
        if (cursor.getDate() === bill.dueDay) {
          return { ...bill, dueDateInPeriod: new Date(cursor) };
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return bill;
    })
    .sort((a, b) => (a.dueDateInPeriod || 0) - (b.dueDateInPeriod || 0));
}

function fmtDate(d, opts = {}) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...opts });
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Pay Period Card ───────────────────────────────────────────────────────

function PayPeriodCard({ bills, settings }) {
  const period = getCurrentPeriod(settings.nextPayDate, settings.payFrequency);
  if (!period) return null;

  const { start, end }  = period;
  const periodBills     = getBillsForPeriod(bills, start, end);
  const totalBills      = periodBills.reduce((s, b) => s + (b.amount || 0), 0);
  const paycheck        = settings.lastPayAmount || 0;
  const remaining       = paycheck - totalBills;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilPay = Math.round((end - today) / 86400000);

  const freqLabel = {
    biweekly:    "Biweekly",
    semimonthly: "Semimonthly",
    weekly:      "Weekly",
    monthly:     "Monthly",
  }[settings.payFrequency || "biweekly"] || "Biweekly";

  return (
    <div className="pay-period">
      <div className="pay-period__header">
        <div>
          <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>Current Pay Period</div>
          <div className="pay-period__dates">
            {fmtDate(start)} – {fmtDate(end, { year: "numeric" })}
          </div>
        </div>
        <div className="pay-period__header-right">
          <span className="pay-period__freq-pill">{freqLabel}</span>
          {daysUntilPay >= 0 && (
            <span className="pay-period__countdown">
              {daysUntilPay === 0 ? "Payday!" : `${daysUntilPay}d until payday`}
            </span>
          )}
        </div>
      </div>

      {paycheck > 0 && (
        <div className="pay-period__paycheck-row">
          <span className="pay-period__row-label">Paycheck</span>
          <span className="pay-period__paycheck-amount">{fmt(paycheck)}</span>
        </div>
      )}

      <div className="pay-period__bills">
        <div className="pay-period__section-label">Bills Due This Period</div>

        {periodBills.length === 0 ? (
          <div className="pay-period__no-bills">No bills due this period.</div>
        ) : (
          <div className="pay-period__bill-list">
            {periodBills.map((b) => (
              <div key={b.id} className="pay-period__bill-row">
                <div className="pay-period__bill-info">
                  <span className="pay-period__bill-name">{b.name}</span>
                  <span className="pay-period__bill-due">
                    {b.dueDateInPeriod ? fmtDate(b.dueDateInPeriod) : ordinal(b.dueDay)}
                  </span>
                </div>
                <div className="pay-period__bill-right">
                  <span className={`pill pill--${b.type}`}>{b.type}</span>
                  <span className="pay-period__bill-amount mono">{fmt(b.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pay-period__footer">
        <div className="pay-period__footer-row">
          <span>Period Bills Total</span>
          <span className="mono">{fmt(totalBills)}</span>
        </div>
        {paycheck > 0 && (
          <div className={`pay-period__footer-row pay-period__remaining${remaining >= 0 ? " pay-period__remaining--positive" : " pay-period__remaining--negative"}`}>
            <span>Remaining After Bills</span>
            <span className="mono">{fmt(remaining)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Custom chart tooltip ──────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart__tooltip">
      <div className="label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontFamily: "JetBrains Mono, monospace" }}>
          {p.name}: {fmt(p.value, { cents: true })}
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData]    = useState(null);
  const [allFiles, setAll] = useState(null);

  useEffect(() => {
    Promise.all([api.dashboard(), api.db()]).then(([d, db]) => {
      setData(d);
      setAll(db);
    });
  }, []);

  if (!data || !allFiles) return <div className="loader">Reading your books…</div>;

  const { stats, upcoming, insights: tips } = data;
  const settings     = allFiles.settings || {};
  const hasBills     = allFiles.bills.length > 0;
  const hasPaySchedule = !!settings.nextPayDate;

  const payHistory = allFiles.paychecks
    .filter((p) => p.type !== "bonus")
    .map((p) => ({ date: p.date.slice(5), net: p.net }));

  const breakdownData = [
    { name: "Needs",   value: Math.round(stats.spending.needsTotal),     fill: COLORS.needs },
    { name: "Wants",   value: Math.round(stats.spending.wantsTotal),     fill: COLORS.wants },
    { name: "Savings", value: Math.round(stats.spending.savingsMonthly), fill: COLORS.savings },
  ];

  const volatilityData = stats.volatility.slice(0, 5).map((v) => ({
    name:  v.name,
    range: Math.round(v.range),
    avg:   Math.round(v.avg),
  }));

  const target = { needs: 50, wants: 30, savings: 20 };

  return (
    <>
      <PageHeader
        eyebrow="At a glance"
        title="The dashboard."
        subtitle="A real-time picture of where your money goes, what's owed, and where you stand against the 50/30/20 rule."
      />

      {/* ── Empty state ───────────────────────────────────────── */}
      {!hasBills && allFiles.paychecks.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.4rem", fontStyle: "italic", marginBottom: "0.75rem" }}>
            No data yet.
          </div>
          <p style={{ color: "var(--ink-soft)", marginBottom: "1.5rem", maxWidth: "40ch", margin: "0 auto 1.5rem" }}>
            Upload a pay stub or bill statement on the Import page — Claude will read it and build your budget automatically.
          </p>
          <a href="/import" className="btn" style={{ textDecoration: "none" }}>Go to Import</a>
        </div>
      )}

      {/* ── Stat cards ────────────────────────────────────────── */}
      {(hasBills || allFiles.paychecks.length > 0) && (
        <div className="section">
          <div className="grid grid-4">
            <Stat
              label="Net Monthly Income"
              value={fmt(stats.income.monthlyIncome)}
              sub={`Avg paycheck ${fmt(stats.income.avgNet)} · biweekly`}
            />
            <Stat
              label="Monthly Bills"
              value={fmt(stats.spending.monthlyBillsExpected)}
              sub={`${allFiles.bills.length} recurring bills`}
            />
            <Stat
              label="Projected Surplus"
              value={fmt(stats.ratios.projectedSurplus)}
              sub="After bills · groceries · allowance · savings"
              delta={stats.ratios.projectedSurplus > 0 ? "up" : "down"}
            />
            <Stat
              label="Savings Rate"
              value={fmtPct(stats.ratios.savingsPct)}
              sub="Target: ≥ 20%"
              delta={stats.ratios.savingsPct >= 20 ? "up" : "warn"}
            />
          </div>
        </div>
      )}

      {/* ── Pay Period ────────────────────────────────────────── */}
      {(hasBills || hasPaySchedule) && (
        <div className="section">
          <PayPeriodCard bills={allFiles.bills} settings={settings} />
          {!hasPaySchedule && (
            <div className="insight insight--info" style={{ marginTop: "1rem" }}>
              <div className="insight__title">Set up your pay schedule</div>
              <div className="insight__body">
                Add your next pay date in{" "}
                <a href="/settings" style={{ color: "var(--accent)" }}>Settings</a>{" "}
                to see which bills are due each paycheck.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Net pay history + Bill volatility ─────────────────── */}
      {(payHistory.length > 0 || volatilityData.length > 0) && (
        <div className="section">
          <div className="grid grid-2">
            {payHistory.length > 0 && (
              <div className="card">
                <div className="section-title" style={{ marginBottom: "0.5rem" }}>
                  <h2 data-num="i.">Net pay history</h2>
                  <span className="eyebrow">Last 12 paychecks</span>
                </div>
                <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem", marginBottom: "0.5rem" }}>
                  Bonus excluded for trend clarity.
                </p>
                <div className="chart">
                  <ResponsiveContainer>
                    <AreaChart data={payHistory}>
                      <defs>
                        <linearGradient id="payGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="var(--accent)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--ink-faint)" tick={{ fontSize: 11 }} tickMargin={8} />
                      <YAxis stroke="var(--ink-faint)" tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`} tick={{ fontSize: 11 }} domain={[3000, "dataMax + 500"]} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="net" name="Net pay" stroke="var(--accent)" strokeWidth={2} fill="url(#payGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {volatilityData.length > 0 && (
              <div className="card">
                <div className="section-title">
                  <h2 data-num="ii.">Bill volatility</h2>
                  <span className="eyebrow">Top 5 by range</span>
                </div>
                <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem", marginBottom: "0.5rem" }}>
                  The bills that fluctuate most. Sinking funds smooth these out.
                </p>
                <div className="chart" style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={volatilityData} layout="vertical" margin={{ left: 30 }}>
                      <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" horizontal={false} />
                      <XAxis type="number" stroke="var(--ink-faint)" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="name" stroke="var(--ink-faint)" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="range" name="Range" fill="var(--warn)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 50/30/20 lens + Upcoming bills ────────────────────── */}
      {hasBills && (
        <div className="section">
          <div className="grid grid-2">
            <div className="card">
              <div className="section-title" style={{ marginBottom: "0.5rem" }}>
                <h2 data-num="iii.">50/30/20 lens</h2>
                <span className="eyebrow">Monthly</span>
              </div>
              <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem", marginBottom: "0.5rem" }}>
                Needs include housing, utilities, insurance, groceries. Wants include subscriptions, allowance.
              </p>
              <div className="chart">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={breakdownData} dataKey="value" cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={2}>
                      {breakdownData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} stroke="var(--paper)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontFamily: "Manrope", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.6rem", marginTop: "0.5rem" }}>
                <RatioBar label="Needs"   actual={stats.ratios.needsPct}   target={target.needs}   color="var(--info)" />
                <RatioBar label="Wants"   actual={stats.ratios.wantsPct}   target={target.wants}   color="var(--warn)" />
                <RatioBar label="Savings" actual={stats.ratios.savingsPct} target={target.savings} color="var(--gain)" />
              </div>
            </div>

            {upcoming.length > 0 && (
              <div className="card">
                <div className="section-title">
                  <h2 data-num="iv.">Upcoming · 30 days</h2>
                  <span className="eyebrow">{upcoming.length} bills</span>
                </div>
                <div style={{ marginTop: "0.5rem", overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Bill</th>
                        <th>Due</th>
                        <th className="right">Expected</th>
                        <th className="right">Rounded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming.slice(0, 8).map((b) => (
                        <tr key={b.id}>
                          <td>{b.name}</td>
                          <td>
                            <span className="mono" style={{ color: "var(--ink-faint)", fontSize: "0.85rem" }}>
                              {b.daysAway}d
                            </span>{" "}
                            {b.dueDate.slice(5)}
                          </td>
                          <td className="right table__amount">{fmt(b.expected, { cents: true })}</td>
                          <td className="right table__amount" style={{ color: "var(--accent)" }}>
                            {fmt(b.rounded)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Insights ──────────────────────────────────────────── */}
      {tips.length > 0 && (
        <div className="section">
          <div className="section-title">
            <h2 data-num="v.">Insights</h2>
            <span className="eyebrow">Generated automatically</span>
          </div>
          <div className="grid grid-2">
            {tips.map((t, i) => (
              <div key={i} className={`insight insight--${t.severity}`}>
                <div className="insight__title">{t.title}</div>
                <div className="insight__body">{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Stat({ label, value, sub, delta }) {
  return (
    <div className="card card--hero">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem", gap: "0.5rem", flexWrap: "wrap" }}>
        <span className="stat__sub">{sub}</span>
        {delta && (
          <span className={`delta delta--${delta}`}>
            {delta === "up" ? "↑" : delta === "down" ? "↓" : delta === "warn" ? "!" : "—"}
          </span>
        )}
      </div>
    </div>
  );
}

function RatioBar({ label, actual, target, color }) {
  const pct = Math.min(100, (actual / 100) * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
        <span style={{ fontSize: "0.7rem", color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: "0.75rem" }}>
          {actual.toFixed(0)}% <span style={{ color: "var(--ink-faint)" }}>/ {target}%</span>
        </span>
      </div>
      <div className="progress">
        <div className="progress__bar" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
