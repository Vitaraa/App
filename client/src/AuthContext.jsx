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

  // Registration no longer logs you in: the account must be verified by email
  // first. Returns the server result (e.g. { pending, email, emailSent }).
  async function register(u, e, p) {
    return api.register(u, e, p);
  }

  // Confirm an email-verification token; on success the server returns a session
  // token so we sign the user straight in.
  async function verifyEmail(token) {
    const { token: jwtToken, username } = await api.verifyEmail(token);
    persist(jwtToken, username);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("budget_username");
    setUsername(null);
  }

  return (
    <AuthContext.Provider value={{ username, isAuthed, login, register, verifyEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
