import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const queryClient = useQueryClient();

  useEffect(() => {
        let previousUserId: string | null | undefined;

                const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
                        const nextUserId = s?.user?.id ?? null;
                        // Si cambia el usuario autenticado (login, logout, o cambio de cuenta
                                                                            // en la misma pestana), limpiar toda la cache de React Query.
                                                                            // Sin esto, listas sin scope por usuario (ej. "programs") pueden
                                                                            // seguir mostrando datos del usuario anterior.
                                                                            if (previousUserId !== undefined && previousUserId !== nextUserId) {
                                                                                      queryClient.clear();
                                                                            }
                        previousUserId = nextUserId;
                        setSession(s);
                });
        supabase.auth.getSession().then(({ data }) => {
                previousUserId = data.session?.user?.id ?? null;
                setSession(data.session);
                setLoading(false);
        });
                      return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
          queryClient.clear();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

