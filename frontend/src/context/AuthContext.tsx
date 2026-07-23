"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface AuthUser {
  id: number;
  username: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  role: "songrim" | "hospital";
  is_admin: boolean;
  hospital_profile_id: number | null;
  department: string | null;
  position: string | null;
  hospital_name: string | null;
  hospital_type: string | null;
  hospital_dept: string | null;
  hospital_address: string | null;
  hospital_tel: string | null;
  business_reg_no: string | null;
  ceo_name: string | null;
  ceo_phone: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/me`, { credentials: "include" });
      const data = await res.json();
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
