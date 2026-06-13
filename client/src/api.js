// Thin fetch wrapper. Reads the saved token and attaches it to every request.
const TOKEN_KEY = "budget_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && data.error) || "Request failed");
    err.status = res.status;
    if (data && data.code) err.code = data.code;
    throw err;
  }
  return data;
}

export const api = {
  register: (username, email, password) =>
    request("/auth/register", { method: "POST", body: { username, email, password } }),
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: { username, password } }),
  verifyEmail: (token) =>
    request("/auth/verify", { method: "POST", body: { token } }),
  resendVerification: (username) =>
    request("/auth/resend-verification", { method: "POST", body: { username } }),
  forgotPassword: (email) =>
    request("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token, password) =>
    request("/auth/reset-password", { method: "POST", body: { token, password } }),
  listTransactions: () => request("/transactions"),
  addTransaction: (tx) => request("/transactions", { method: "POST", body: tx }),
  updateTransaction: (id, patch) =>
    request(`/transactions/${id}`, { method: "PATCH", body: patch }),
  importTransactions: (items, last4) =>
    request("/transactions/import", { method: "POST", body: { items, last4 } }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: "DELETE" }),
  listAccountTransactions: (id) => request(`/accounts/${id}/transactions`),

  // Accounts (net worth)
  listAccounts: () => request("/accounts"),
  addAccount: (a) => request("/accounts", { method: "POST", body: a }),
  updateAccount: (id, patch) => request(`/accounts/${id}`, { method: "PATCH", body: patch }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: "DELETE" }),

  // Investment holdings (inside an investment account)
  searchSymbols: (q) => request(`/symbol-search?q=${encodeURIComponent(q)}`),
  listAllHoldings: () => request("/holdings"),
  investmentHistory: () => request("/investments/history"),
  listHoldings: (accountId) => request(`/accounts/${accountId}/holdings`),
  addHolding: (accountId, h) =>
    request(`/accounts/${accountId}/holdings`, { method: "POST", body: h }),
  updateHolding: (id, patch) => request(`/holdings/${id}`, { method: "PATCH", body: patch }),
  deleteHolding: (id) => request(`/holdings/${id}`, { method: "DELETE" }),

  // Savings goals
  listGoals: () => request("/goals"),
  addGoal: (g) => request("/goals", { method: "POST", body: g }),
  updateGoal: (id, patch) => request(`/goals/${id}`, { method: "PATCH", body: patch }),
  deleteGoal: (id) => request(`/goals/${id}`, { method: "DELETE" }),

  // Subscriptions (manual)
  listSubscriptions: () => request("/subscriptions"),
  addSubscription: (s) => request("/subscriptions", { method: "POST", body: s }),
  updateSubscription: (id, patch) =>
    request(`/subscriptions/${id}`, { method: "PATCH", body: patch }),
  deleteSubscription: (id) => request(`/subscriptions/${id}`, { method: "DELETE" }),

  // Long-term plans (Foresight)
  listPlans: () => request("/plans"),
  addPlan: (p) => request("/plans", { method: "POST", body: p }),
  updatePlan: (id, patch) => request(`/plans/${id}`, { method: "PATCH", body: patch }),
  deletePlan: (id) => request(`/plans/${id}`, { method: "DELETE" }),

  // Settings (per-user preferences)
  getSettings: () => request("/settings"),
  setSetting: (key, value) => request("/settings", { method: "POST", body: { key, value } }),

  // Budgets (per-category monthly limits)
  listBudgets: () => request("/budgets"),
  setBudget: (category, amount, icon, type) =>
    request("/budgets", { method: "POST", body: { category, amount, icon, type } }),
  removeBudgetCategory: (category) =>
    request(`/budgets/by-category/${encodeURIComponent(category)}`, { method: "DELETE" }),

  // Dismissed auto-detected subscriptions
  listSubIgnores: () => request("/sub-ignores"),
  ignoreSubscription: (name) => request("/sub-ignores", { method: "POST", body: { name } }),
  unignoreSubscription: (id) => request(`/sub-ignores/${id}`, { method: "DELETE" }),
};
