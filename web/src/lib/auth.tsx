import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Lee el usuario del JWT guardado (sin validar la firma: eso lo hacen los servicios). */
function userFromToken(token: string | null): User | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(part)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const p = JSON.parse(json) as { sub: string; name: string; email: string; role: Role; exp: number };
    if (p.exp * 1000 < Date.now()) return null;
    return { id: p.sub, name: p.name, email: p.email, role: p.role };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => userFromToken(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!user) setToken(null);
  }, [logout, user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string }>('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    setToken(res.accessToken);
    const u = userFromToken(res.accessToken)!;
    setUser(u);
    return u;
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await api('/auth/register', { method: 'POST', body: { name, email, password }, auth: false });
      return login(email, password);
    },
    [login],
  );

  const value = useMemo(() => ({ user, login, register, logout }), [user, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}

/** Pantalla de inicio según el rol. */
export function homeFor(role: Role | undefined): string {
  if (role === 'ORGANIZER') return '/organizador';
  if (role === 'DOORMAN') return '/portero';
  return '/';
}
