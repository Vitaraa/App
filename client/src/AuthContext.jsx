import { createContext, useContext, useState } from "react";
import { api, getToken, setToken } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [username, setUsername] = useState(
    () => localStorage.getItem("budget_username") || null
  );
  const isAuthed = Boolean(getToken() && username);

  function persist(token, name) {
    setToken(token);
    localStorage.setItem("budget_username", name);
    setUsername(name);
  }

  async function login(u, p) {
    const { token, username } = await api.login(u, p);
    persist(token, username);
  }

  async function register(u, p) {
    const { token, username } = await api.register(u, p);
    persist(token, username);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("budget_username");
    setUsername(null);
  }

  return (
    <AuthContext.Provider value={{ username, isAuthed, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
