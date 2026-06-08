/**
 * SeuFluxo WhatsApp — AuthContext
 * Contexto global que armazena dados do usuário logado (role, company_id, etc.)
 * para controle de UI por RBAC.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../supabaseClient';

export type UserRole = 'superadmin' | 'admin' | 'manager' | 'agent';

export interface AuthUser {
  id: string;          // ID da tabela public.users
  auth_id: string;     // ID do Supabase Auth
  email: string;
  name: string | null;
  role: UserRole;
  company_id: string;
  department_id: string | null;
  signature: string | null;
  is_active: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAdmin: false,
  isAgent: false,
  refetchUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, auth_id, email, name, role, company_id, department_id, signature, is_active')
      .eq('auth_id', session.user.id)
      .single();

    if (error || !data) {
      console.error('[AuthContext] Erro ao buscar usuário:', error);
      setUser(null);
    } else {
      setUser(data as AuthUser);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchUser();
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isAgent = user?.role === 'agent' || user?.role === 'manager';

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isAgent, refetchUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
