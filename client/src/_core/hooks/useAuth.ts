import { useCallback, useEffect, useState } from "react";

export type AccessUser = {
  name: string;
  email: null;
  role: "admin";
};

type UseAuthResult = {
  user: AccessUser | null;
  loading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AccessUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/access/session", { credentials: "same-origin" });
      setUser(response.ok ? { name: "HF Bucket Studio", email: null, role: "admin" } : null);
    } catch (cause) {
      setUser(null);
      setError(cause instanceof Error ? cause : new Error("Unable to verify access"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (password: string) => {
    setError(null);
    const response = await fetch("/api/access/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error || "Unable to unlock workspace");
    setUser({ name: "HF Bucket Studio", email: null, role: "admin" });
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/access/logout", { method: "POST", credentials: "same-origin" });
    setUser(null);
  }, []);

  return { user, loading, error, isAuthenticated: Boolean(user), login, logout, refresh };
}
