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
  if (!res.ok) throw new Error((data && data.error) || "Request failed");
  return data;
}

export const api = {
  register: (username, password) =>
    request("/auth/register", { method: "POST", body: { username, password } }),
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: { username, password } }),
  listTransactions: () => request("/transactions"),
  addTransaction: (tx) => request("/transactions", { method: "POST", body: tx }),
  updateTransaction: (id, patch) =>
    request(`/transactions/${id}`, { method: "PATCH", body: patch }),
  importTransactions: (items) =>
    request("/transactions/import", { method: "POST", body: { items } }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: "DELETE" }),

  // Accounts (net worth)
  listAccounts: () => request("/accounts"),
  addAccount: (a) => request("/accounts", { method: "POST", body: a }),
  updateAccount: (id, patch) => request(`/accounts/${id}`, { method: "PATCH", body: patch }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: "DELETE" }),

  // Investment holdings (inside an investment account)
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

  // Dismissed auto-detected subscriptions
  listSubIgnores: () => request("/sub-ignores"),
  ignoreSubscription: (name) => request("/sub-ignores", { method: "POST", body: { name } }),
  unignoreSubscription: (id) => request(`/sub-ignores/${id}`, { method: "DELETE" }),
};
