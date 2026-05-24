const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  dashboard:   () => request("/dashboard"),
  db:          () => request("/db"),
  bills:       () => request("/bills"),
  paychecks:   () => request("/paychecks"),
  savings:     () => request("/savings"),
  settings:    () => request("/settings"),
  allowance:   () => request("/allowance/recommendation"),

  addBill:     (b) => request("/bills", { method: "POST", body: JSON.stringify(b) }),
  deleteBill:  (id) => request(`/bills/${id}`, { method: "DELETE" }),

  addPaycheck:    (p) => request("/paychecks", { method: "POST", body: JSON.stringify(p) }),
  seedPaychecks:  (d) => request("/paychecks/seed", { method: "POST", body: JSON.stringify(d) }),

  addGoal:     (g) => request("/savings/goals", { method: "POST", body: JSON.stringify(g) }),
  deleteGoal:  (id) => request(`/savings/goals/${id}`, { method: "DELETE" }),
  contributeGoal: (id, amount) =>
    request(`/savings/goals/${id}/contribute`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),

  updateSettings: (s) => request("/settings", { method: "PUT", body: JSON.stringify(s) }),
  updateVariableExpenses: (data) => request("/variable-expenses", { method: "PUT", body: JSON.stringify(data) }),

  allocate: (payload) =>
    request("/allocate", { method: "POST", body: JSON.stringify(payload) }),

  snapshot: () => request("/snapshots", { method: "POST" }),

  // Budget management
  budgets:         () => request("/budgets"),
  createBudget:    (name) => request("/budgets", { method: "POST", body: JSON.stringify({ name }) }),
  switchBudget:    (id)   => request("/budgets/active", { method: "PUT", body: JSON.stringify({ id }) }),
  renameBudget:    (id, name) => request(`/budgets/${id}/rename`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteBudget:    (id)   => request(`/budgets/${id}`, { method: "DELETE" }),
  resetBudget:     ()     => request("/budgets/active/reset", { method: "POST" }),

  documents:       () => request("/documents"),
  uploadDocument:  (file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/documents/upload", { method: "POST", body: form }).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    });
  },
  analyzeDocument: (id) => request(`/documents/${id}/analyze`, { method: "POST" }),
  applyDocument:   (id, payload) =>
    request(`/documents/${id}/apply`, { method: "POST", body: JSON.stringify(payload) }),
  deleteDocument:  (id) => request(`/documents/${id}`, { method: "DELETE" }),
};

export function fmt(n, opts = {}) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}

export function fmtPct(n, digits = 1) {
  return `${Number(n || 0).toFixed(digits)}%`;
}
