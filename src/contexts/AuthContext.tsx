import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nomeCompleto: string) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Timeout de inatividade (30 minutos)
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000;
  // Duração máxima da sessão (13 horas) - força login diário
  const MAX_SESSION_DURATION = 13 * 60 * 60 * 1000;
  const SESSION_START_KEY = 'sigma_session_start';
  let inactivityTimer: ReturnType<typeof setTimeout>;
  let sessionTimer: ReturnType<typeof setTimeout>;

  const checkSessionExpiry = () => {
    const sessionStart = localStorage.getItem(SESSION_START_KEY);
    if (sessionStart) {
      const elapsed = Date.now() - parseInt(sessionStart, 10);
      if (elapsed >= MAX_SESSION_DURATION) {
        localStorage.removeItem(SESSION_START_KEY);
        toast.info("Sessão expirada após 13 horas. Faça login novamente.");
        signOut();
        return true;
      }
      // Agendar logout para o tempo restante
      const remaining = MAX_SESSION_DURATION - elapsed;
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(() => {
        localStorage.removeItem(SESSION_START_KEY);
        toast.info("Sessão expirada após 13 horas. Faça login novamente.");
        signOut();
      }, remaining);
    }
    return false;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event, session);
        
        if (event === 'PASSWORD_RECOVERY') {
          navigate('/reset-password');
          return;
        }

        // Ao fazer login, registrar início da sessão
        if (event === 'SIGNED_IN' && session) {
          if (!localStorage.getItem(SESSION_START_KEY)) {
            localStorage.setItem(SESSION_START_KEY, Date.now().toString());
          }
        }

        // Ao fazer logout, limpar
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem(SESSION_START_KEY);
          clearTimeout(sessionTimer);
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Verificar se sessão existente já expirou
      if (session) {
        if (!localStorage.getItem(SESSION_START_KEY)) {
          localStorage.setItem(SESSION_START_KEY, Date.now().toString());
        }
        checkSessionExpiry();
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(sessionTimer);
    };
  }, [navigate]);

  // Gerenciamento de inatividade
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        toast.info("Sessão expirada por inatividade");
        signOut();
      }, INACTIVITY_TIMEOUT);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast.success("Login realizado com sucesso!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer login");
      throw error;
    }
  };

  const signUp = async (email: string, password: string, nomeCompleto: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            nome_completo: nomeCompleto,
          },
        },
      });

      if (error) throw error;

      toast.success("Cadastro realizado com sucesso!");
      navigate("/");
    } catch (error: any) {
      if (error.message.includes("already registered")) {
        toast.error("Este email já está cadastrado");
      } else {
        toast.error(error.message || "Erro ao fazer cadastro");
      }
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      toast.success("Logout realizado com sucesso!");
      navigate("/auth");
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer logout");
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, signIn, signUp, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
