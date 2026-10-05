import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { queryClient } from './query';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  configured: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const priorSubject = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    const applySession = (next: Session | null) => {
      const subject = next?.user.id ?? null;
      if (priorSubject.current !== subject) queryClient.clear();
      priorSubject.current = subject;
      setSession(next);
      setLoading(false);
    };
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) applySession(data.session);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      applySession(next);
      if (_event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  const signOut = async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    queryClient.clear();
    setSession(null);
  };
  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        configured: Boolean(supabase),
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Authentication must be used inside AuthProvider.');
  return value;
}
