import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient, clearAuthToken, getAuthToken, PublicUser, saveAuthToken } from "../api/client";

interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAuthToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const { data } = await apiClient.get<{ user: PublicUser }>("/auth/me");
        setUser(data.user);
      } catch {
        await clearAuthToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function signUp(name: string, email: string, password: string) {
    const { data } = await apiClient.post<{ token: string; user: PublicUser }>("/auth/signup", {
      name,
      email,
      password,
    });
    await saveAuthToken(data.token);
    setUser(data.user);
  }

  async function logIn(email: string, password: string) {
    const { data } = await apiClient.post<{ token: string; user: PublicUser }>("/auth/login", {
      email,
      password,
    });
    await saveAuthToken(data.token);
    setUser(data.user);
  }

  async function logOut() {
    await clearAuthToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signUp, logIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
