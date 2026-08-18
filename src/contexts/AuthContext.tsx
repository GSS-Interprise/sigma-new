import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
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

  // Timeout de inatividade (60 minutos) — subiu de 30 em 18/08 a pedido da operação,
  // que caía no meio do expediente ao sair da tela para atender telefone.
  const INACTIVITY_TIMEOUT = 60 * 60 * 1000;
  // Aviso antes de derrubar: a queixa da equipe era cair "sem qualquer aviso prévio".
  const AVISO_ANTES = 3 * 60 * 1000;
  // Duração máxima da sessão (13 horas) - força login diário
  const MAX_SESSION_DURATION = 13 * 60 * 60 * 1000;
  const SESSION_START_KEY = 'sigma_session_start';
  // useRef, e não `let` no corpo do componente: variável solta é recriada a cada render,
  // então o clearTimeout da limpeza podia apontar para outra variável e deixar um timer
  // órfão vivo — que derrubava a sessão fora de hora, parecendo aleatório.
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (sessionTimer.current) clearTimeout(sessionTimer.current);
      sessionTimer.current = setTimeout(() => {
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
          // Verificar status do profile (não pode ser suspenso/inativo)
          setTimeout(() => {
            checkUserStatus(session.user.id);
          }, 0);
        }

        // Ao fazer logout, limpar
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem(SESSION_START_KEY);
          if (sessionTimer.current) clearTimeout(sessionTimer.current);
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
        checkUserStatus(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (sessionTimer.current) clearTimeout(sessionTimer.current);
    };
  // Sem deps de propósito: navigate é estável; listar como dep dispara cascata
  // de re-subscribes do gotrue → lock contention (bug 15/05 sigzap realtime).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkUserStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        console.error('Erro ao verificar status do usuário:', error);
        return;
      }
      const status = (data?.status || 'ativo').toLowerCase();
      if (status === 'suspenso' || status === 'inativo') {
        toast.error(
          status === 'suspenso'
            ? 'Acesso suspenso. Procure o administrador do sistema.'
            : 'Usuário inativo. Procure o administrador do sistema.'
        );
        localStorage.removeItem(SESSION_START_KEY);
        await supabase.auth.signOut();
        navigate('/auth');
      }
    } catch (err) {
      console.error('Falha na verificação de status:', err);
    }
  };

  // Gerenciamento de inatividade
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      if (avisoTimer.current) clearTimeout(avisoTimer.current);

      avisoTimer.current = setTimeout(() => {
        toast.warning("Sua sessão vai expirar em 3 minutos por inatividade.", {
          description: "Clique aqui ou use o sistema para continuar conectado.",
          duration: AVISO_ANTES,
        });
      }, INACTIVITY_TIMEOUT - AVISO_ANTES);

      inactivityTimer.current = setTimeout(() => {
        toast.info("Sessão expirada por inatividade");
        signOut();
      }, INACTIVITY_TIMEOUT);
    };

    // 'keypress' é uma API descontinuada e não dispara para Backspace, Delete, Tab nem
    // setas — quem estava revisando um texto longo sem mexer o mouse era considerado
    // inativo e caía no meio do trabalho. 'keydown' e 'input' cobrem digitação de verdade.
    const events = ['mousedown', 'mousemove', 'keydown', 'input', 'scroll', 'touchstart', 'click', 'wheel'];

    events.forEach(event => {
      document.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      if (avisoTimer.current) clearTimeout(avisoTimer.current);
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
