// ============================================================
//  BUDGET ENGINE
//  Implements: zero-based budgeting, 50/30/20 reference frame,
//  pay-yourself-first, sinking funds, round-up savings, and
//  paycheck-stacking bill allocation.
// ============================================================

export function ceilDollar(n) {
  return Math.ceil(Number(n) || 0);
}

export function avg(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

export function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, n) => s + (n - m) ** 2, 0) / (arr.length - 1));
}

// Project a bill's expected next amount conservatively (trimmed mean + buffer)
export function expectedBillAmount(bill) {
  const amounts = (bill.history || []).map((h) => h.amount).filter((n) => n > 0);
  if (!amounts.length) return bill.amount || 0;
  if (amounts.length === 1) return amounts[0];

  // Use median for stability against outliers
  const med = median(amounts);
  const sd = stdev(amounts);

  // For seasonal bills, project the *next* expected month using a
  // simple "rolling forward" assumption — bias toward the recent
  // 3-month average to capture trend, but never below the recent
  // last-known value if it's higher.
  if (bill.seasonal) {
    const last3 = amounts.slice(-3);
    const recent = avg(last3);
    return Math.max(recent, amounts[amounts.length - 1]);
  }

  // Conservative: use higher of median or recent value, add small buffer
  const recent = amounts[amounts.length - 1];
  return Math.max(med, recent) + 0.5 * sd;
}

// ============================================================
//  STATS
// ============================================================
export function computeStats(db) {
  // Income — exclude bonuses for "regular" income baseline
  const regular = db.paychecks.filter((p) => p.type !== "bonus");
  const bonuses = db.paychecks.filter((p) => p.type === "bonus");

  const lastN = regular.slice(-12);
  const avgNet = avg(lastN.map((p) => p.net));
  const lastNet = lastN.length ? lastN[lastN.length - 1].net : 0;
  const annualNet = avgNet * 26; // biweekly

  // Bonus YTD
  const bonusYTD = bonuses
    .filter((b) => new Date(b.date).getFullYear() === new Date().getFullYear())
    .reduce((s, b) => s + b.net, 0);

  // Bills monthly cost (projected next month)
  const monthlyBillsExpected = db.bills.reduce(
    (s, b) => s + expectedBillAmount(b),
    0
  );

  // Round-up savings from bills (the "change" they capture each month)
  const roundUpSavings = db.bills.reduce((s, b) => {
    const exp = expectedBillAmount(b);
    return s + (ceilDollar(exp) - exp);
  }, 0);

  // Needs / Wants / Savings split (50/30/20 reference)
  const needsBills = db.bills
    .filter((b) => b.type === "needs")
    .reduce((s, b) => s + expectedBillAmount(b), 0);
  const wantsBills = db.bills
    .filter((b) => b.type === "wants")
    .reduce((s, b) => s + expectedBillAmount(b), 0);
  const groceries = db.variableExpenses.find((v) => v.id === "groceries")?.monthlyTarget || 0;
  const allowance = db.variableExpenses.find((v) => v.id === "allowance")?.monthlyTarget || 0;

  const needsTotal = needsBills + groceries;
  const wantsTotal = wantsBills + allowance;

  const monthlyIncome = avgNet * (26 / 12); // biweekly → monthly
  const sinkingMonthly = db.sinkingFunds.reduce(
    (s, f) => s + (f.monthlyContribution || 0),
    0
  );
  const savingsMonthly =
    db.savingsGoals.reduce((s, g) => s + (g.monthlyContribution || 0), 0) +
    sinkingMonthly;

  const projectedSurplus = monthlyIncome - needsTotal - wantsTotal - savingsMonthly;

  // Bill volatility
  const volatility = db.bills
    .map((b) => {
      const amts = (b.history || []).map((h) => h.amount);
      if (amts.length < 2) return null;
      return {
        id: b.id,
        name: b.name,
        sd: stdev(amts),
        range: amts.length ? Math.max(...amts) - Math.min(...amts) : 0,
        avg: avg(amts),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.sd - a.sd);

  // Savings progress
  const goalProgress = db.savingsGoals.map((g) => ({
    id: g.id,
    name: g.name,
    pct: g.target ? (g.current / g.target) * 100 : 0,
    current: g.current,
    target: g.target,
    monthsRemaining:
      g.monthlyContribution > 0
        ? Math.ceil((g.target - g.current) / g.monthlyContribution)
        : null,
  }));

  // Emergency-fund coverage
  const emergencyGoal = db.savingsGoals.find((g) => g.id === "emergency");
  const monthlyBaseline = needsTotal + 200; // minimal "survive" amount
  const emergencyMonthsCovered = emergencyGoal
    ? emergencyGoal.current / monthlyBaseline
    : 0;

  const safePct = (n, d) => (d > 0 ? (n / d) * 100 : 0);

  return {
    income: {
      lastNet,
      avgNet,
      annualNet,
      bonusYTD,
      monthlyIncome,
    },
    spending: {
      monthlyBillsExpected,
      needsBills,
      wantsBills,
      groceries,
      allowance,
      needsTotal,
      wantsTotal,
      sinkingMonthly,
      savingsMonthly,
      roundUpSavings,
    },
    ratios: {
      needsPct: safePct(needsTotal, monthlyIncome),
      wantsPct: safePct(wantsTotal, monthlyIncome),
      savingsPct: safePct(savingsMonthly, monthlyIncome),
      projectedSurplus,
    },
    volatility,
    goalProgress,
    emergencyMonthsCovered,
  };
}

// ============================================================
//  ALLOWANCE RECOMMENDATION
//  Modern best practice: allowance ("fun money") sized to the
//  bigger of (a) what's left after needs+wants+savings, and
//  (b) a calibrated % of net (5–10%). Never let it crowd out
//  savings target.
// ============================================================
export function recommendAllowance(db) {
  const s = computeStats(db);
  const monthlyIncome = s.income.monthlyIncome;

  // Hard floors and ceilings
  const savingsTarget = monthlyIncome * (db.settings.savingsRatePctTarget / 100);
  const needsTotal = s.spending.needsTotal;
  const wantsBillsAndGroceries = s.spending.wantsBills + s.spending.groceries * 0; // groceries already in needs
  const obligated = needsTotal + s.spending.wantsBills + s.spending.sinkingMonthly;

  const afterObligations = monthlyIncome - obligated;
  const room = afterObligations - savingsTarget;

  // Calibrate: 7% of net is a healthy fun-money rate
  const calibrated = monthlyIncome * 0.07;
  const conservative = Math.max(0, Math.min(room, calibrated));

  // Aggressive saver mode: 5%
  const aggressive = Math.max(0, Math.min(room, monthlyIncome * 0.05));

  // Generous: take whatever's left after a 15% savings rate
  const generous = Math.max(
    0,
    monthlyIncome - obligated - monthlyIncome * 0.15
  );

  const currentAllowance = db.variableExpenses.find((v) => v.id === "allowance")?.monthlyTarget || 0;

  return {
    monthlyIncome,
    obligated,
    savingsTargetMonthly: savingsTarget,
    currentAllowance,
    recommendations: {
      conservative: Math.round(conservative),
      balanced: Math.round((conservative + generous) / 2),
      aggressive: Math.round(aggressive),
      generous: Math.round(generous),
    },
    rationale: [
      `At your $${Math.round(monthlyIncome).toLocaleString()}/mo net income, a 20% savings target reserves $${Math.round(
        savingsTarget
      ).toLocaleString()}/mo.`,
      `Fixed needs + obligations are $${Math.round(obligated).toLocaleString()}/mo, leaving $${Math.round(
        afterObligations
      ).toLocaleString()} before savings.`,
      `Modern personal-finance research suggests 5–10% of net for "fun money" — enough for joy without choking growth.`,
    ],
  };
}

// ============================================================
//  PAYCHECK ALLOCATION
//  Given a paycheck on a date, figure out which bills it should
//  cover (next 14 days due), how much for savings goals, how
//  much for groceries/allowance, what's left as cushion.
// ============================================================
export function allocatePaycheck(db, netAmount, dateStr) {
  const date = new Date(dateStr);
  const horizonDays = 16; // cover until next paycheck + 2 day buffer
  const horizon = new Date(date);
  horizon.setDate(horizon.getDate() + horizonDays);

  // Project a "due date" for each bill — the next dueDay on/after `date`
  function nextDueDate(dueDay) {
    const candidate = new Date(date.getFullYear(), date.getMonth(), dueDay);
    if (candidate < date) candidate.setMonth(candidate.getMonth() + 1);
    return candidate;
  }

  // What's due in this paycheck's window?
  const dueInWindow = db.bills
    .map((bill) => {
      const expected = expectedBillAmount(bill);
      const rounded = ceilDollar(expected);
      const due = nextDueDate(bill.dueDay);
      return {
        billId: bill.id,
        name: bill.name,
        category: bill.category,
        type: bill.type,
        essential: bill.essential,
        expected,
        amount: rounded,
        roundUpSavings: rounded - expected,
        dueDate: due.toISOString().slice(0, 10),
        inWindow: due <= horizon,
      };
    })
    .filter((b) => b.inWindow);

  // Prioritise: essentials first, then by due date
  dueInWindow.sort((a, b) => {
    if (a.essential !== b.essential) return a.essential ? -1 : 1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  let remaining = netAmount;
  const billAllocations = [];
  const unfundedBills = [];
  for (const b of dueInWindow) {
    if (remaining >= b.amount) {
      billAllocations.push({ ...b, funded: b.amount });
      remaining -= b.amount;
    } else if (remaining > 0) {
      billAllocations.push({ ...b, funded: remaining, partial: true });
      remaining = 0;
    } else {
      unfundedBills.push(b);
    }
  }

  // Per-paycheck variable: groceries and allowance (halved since biweekly)
  const monthlyGroceries =
    db.variableExpenses.find((v) => v.id === "groceries")?.monthlyTarget || 0;
  const monthlyAllowance =
    db.variableExpenses.find((v) => v.id === "allowance")?.monthlyTarget || 0;

  const groceriesAlloc = Math.min(remaining, Math.round(monthlyGroceries / 2));
  remaining -= groceriesAlloc;

  const allowanceAlloc = Math.min(remaining, Math.round(monthlyAllowance / 2));
  remaining -= allowanceAlloc;

  // Sinking funds (biweekly portion)
  const sinkingAllocs = [];
  for (const fund of db.sinkingFunds) {
    const bi = Math.round((fund.monthlyContribution || 0) / 2);
    const a = Math.min(remaining, bi);
    sinkingAllocs.push({ id: fund.id, name: fund.name, amount: a });
    remaining -= a;
  }

  // Savings goals (priority order)
  const savingsAllocs = [];
  const sortedGoals = [...db.savingsGoals].sort(
    (a, b) => (a.priority || 99) - (b.priority || 99)
  );
  for (const goal of sortedGoals) {
    const bi = Math.round((goal.monthlyContribution || 0) / 2);
    const a = Math.min(remaining, bi);
    savingsAllocs.push({ id: goal.id, name: goal.name, amount: a });
    remaining -= a;
  }

  const cushion = Math.max(0, remaining);

  // Calculate totals
  const totalBills = billAllocations.reduce((s, b) => s + b.funded, 0);
  const totalSinking = sinkingAllocs.reduce((s, b) => s + b.amount, 0);
  const totalSavings = savingsAllocs.reduce((s, b) => s + b.amount, 0);
  const totalRoundUp = billAllocations.reduce(
    (s, b) => s + (b.roundUpSavings || 0),
    0
  );

  return {
    net: netAmount,
    date: dateStr,
    horizon: horizon.toISOString().slice(0, 10),
    breakdown: {
      bills: totalBills,
      groceries: groceriesAlloc,
      allowance: allowanceAlloc,
      sinkingFunds: totalSinking,
      savings: totalSavings,
      cushion,
    },
    bills: billAllocations,
    unfundedBills,
    groceries: groceriesAlloc,
    allowance: allowanceAlloc,
    sinkingFunds: sinkingAllocs,
    savings: savingsAllocs,
    cushion,
    roundUpSavings: totalRoundUp,
    coverage:
      totalBills + groceriesAlloc + allowanceAlloc + totalSinking + totalSavings + cushion,
  };
}

// ============================================================
//  FORECAST: upcoming bills in N days
// ============================================================
export function forecastUpcomingBills(db, days = 30) {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + days);

  return db.bills
    .map((bill) => {
      const expected = expectedBillAmount(bill);
      const next = new Date(now.getFullYear(), now.getMonth(), bill.dueDay);
      if (next < now) next.setMonth(next.getMonth() + 1);
      return {
        id: bill.id,
        name: bill.name,
        category: bill.category,
        expected,
        rounded: ceilDollar(expected),
        dueDate: next.toISOString().slice(0, 10),
        daysAway: Math.ceil((next - now) / 86400000),
      };
    })
    .filter((b) => new Date(b.dueDate) <= horizon)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

// ============================================================
//  INSIGHTS
// ============================================================
export function insights(db, stats) {
  const tips = [];

  // Savings rate
  if (stats.ratios.savingsPct < 15) {
    tips.push({
      severity: "warning",
      title: "Savings rate below 15%",
      body: `You're saving ${stats.ratios.savingsPct.toFixed(
        1
      )}% of net. Top finance researchers (Bengen, Bach, Robin & Dominguez) recommend 15–20% for healthy long-term growth. Consider trimming wants or rerouting your next bonus.`,
    });
  } else if (stats.ratios.savingsPct >= 20) {
    tips.push({
      severity: "good",
      title: "Savings rate on target",
      body: `Saving ${stats.ratios.savingsPct.toFixed(
        1
      )}% of net — excellent. You're in the top quartile of US households.`,
    });
  }

  // Emergency fund
  if (stats.emergencyMonthsCovered < 3) {
    tips.push({
      severity: "warning",
      title: "Emergency fund < 3 months",
      body: `Your emergency fund covers ${stats.emergencyMonthsCovered.toFixed(
        1
      )} months of essentials. Modern guidance (CFPB, Vanguard) is 3–6 months. Boost the monthly contribution until you're at 6.`,
    });
  } else if (stats.emergencyMonthsCovered >= 6) {
    tips.push({
      severity: "good",
      title: "Emergency fund healthy",
      body: `${stats.emergencyMonthsCovered.toFixed(
        1
      )} months covered. Past 6 months, your marginal dollar earns more in invested savings.`,
    });
  }

  // Volatile bills → sinking funds
  const topVolatile = stats.volatility.filter((v) => v.range > 50).slice(0, 2);
  for (const v of topVolatile) {
    tips.push({
      severity: "info",
      title: `${v.name} is volatile (±$${Math.round(v.range)})`,
      body: `Smooth the spikes by sinking $${Math.ceil(
        v.avg / 12
      )}/mo into a buffer account. You'll never feel a winter heating bill again.`,
    });
  }

  // Needs ratio
  if (stats.ratios.needsPct > 60) {
    tips.push({
      severity: "warning",
      title: "Needs over 60% of income",
      body: `Your housing-and-essentials load is ${stats.ratios.needsPct.toFixed(
        1
      )}% — above the 50/30/20 target. This isn't a crisis, but limits how fast you can build wealth.`,
    });
  }

  // Round-up savings
  if (stats.spending.roundUpSavings > 0) {
    tips.push({
      severity: "info",
      title: `Round-ups saving $${stats.spending.roundUpSavings.toFixed(
        2
      )}/mo`,
      body: `Rounding bills to the nearest dollar nets ~$${(
        stats.spending.roundUpSavings * 12
      ).toFixed(0)}/year. Small, automatic, real.`,
    });
  }

  // Bonus deployment
  if (stats.income.bonusYTD > 5000) {
    tips.push({
      severity: "info",
      title: `$${stats.income.bonusYTD.toLocaleString()} bonus this year`,
      body: `A common pitfall is lifestyle creep. Best practice: 50% to investments, 25% to debt payoff, 25% to a guilt-free splurge.`,
    });
  }

  return tips;
}
