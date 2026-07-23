import React, { createContext, useContext, useState } from "react";
import { api, saveSession, loadSession, clearSession } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadSession());

  async function login(email, password) {
    const { token, user } = await api.login(email, password);
    saveSession(token, user);
    setSession({ token, user });
  }

  async function signupOrg(payload) {
    const { token, user } = await api.signupOrg(payload);
    saveSession(token, user);
    setSession({ token, user });
  }

  function logout() {
    clearSession();
    setSession(null);
  }

  // Merges fresh profile data (e.g. after a "My Profile" save) into the cached
  // session so the sidebar/header reflect changes immediately, without re-login.
  function updateUser(patch) {
    setSession((prev) => {
      if (!prev) return prev;
      const user = { ...prev.user, ...patch };
      saveSession(prev.token, user);
      return { ...prev, user };
    });
  }

  return (
    <AuthContext.Provider value={{ session, login, signupOrg, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
