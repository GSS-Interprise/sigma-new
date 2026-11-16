import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import gssLogoFull from "@/assets/gss-logo-full.png";
import medicalTeam from "@/assets/medical-team-login.jpg";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";

// Fundo do lado do formulário = o cinza do próprio PNG do logo (247,247,247). Com outro fundo o quadrado do
// logo aparece; o arquivo não tem transparência.
const FUNDO_LOGO = "#f7f7f7";

/**
 * Login do Sigma (redesenho 2027). A pergunta da tela é uma só: entrar. Por isso o formulário de entrar fica
 * sozinho; criar conta vira um link embaixo, e o texto institucional (missão, valores, contato) saiu.
 */
export default function Auth() {
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    navigate("/");
    return null;
  }

  // signIn e signUp já mostram o toast de erro ou de sucesso (AuthContext); aqui só o estado do botão.
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (modo === "entrar") await signIn(email, senha);
      else await signUp(email, senha, nome);
    } catch (error) {
      console.error(modo === "entrar" ? "Login error:" : "Signup error:", error);
    } finally {
      setLoading(false);
    }
  };

  const criando = modo === "criar";

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        <img src={medicalTeam} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[hsl(123_63%_14%/0.78)]" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          {/* Texto já usado pela GSS no login antigo; frase de marketing nova fica para a GSS aprovar. */}
          <p className="font-display text-3xl font-semibold leading-tight">Portal Sigma</p>
          <p className="mt-1 text-base text-white/90">Sistema Integrado de Gestão Médica e Alocação</p>
          <p className="mt-3 text-sm text-white/75">GSS · Gestão de Serviços de Saúde, desde 2013</p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-10" style={{ background: FUNDO_LOGO }}>
        <div className="w-full max-w-[380px]">
          <img src={gssLogoFull} alt="GSS - Gestão de Serviços de Saúde" className="mx-auto h-28 w-auto" />
          <h1 className="mt-4 text-center font-display text-2xl font-semibold text-[hsl(123_63%_23%)]">
            {criando ? "Criar conta no Sigma" : "Entrar no Sigma"}
          </h1>

          <form onSubmit={enviar} className="mt-8 space-y-4">
            {criando && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-nome">Nome completo</Label>
                <Input
                  id="auth-nome"
                  autoComplete="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  className="h-11 bg-white"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">E-mail</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="auth-senha">Senha</Label>
                {!criando && (
                  <button
                    type="button"
                    onClick={() => setForgotPasswordOpen(true)}
                    className="text-sm font-medium text-[hsl(123_63%_23%)] hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <Input
                id="auth-senha"
                type="password"
                autoComplete={criando ? "new-password" : "current-password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                minLength={criando ? 6 : undefined}
                className="h-11 bg-white"
              />
              {criando && <p className="text-xs text-muted-foreground">No mínimo 6 caracteres.</p>}
            </div>
            <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
              {loading ? (criando ? "Criando a conta…" : "Entrando…") : criando ? "Criar conta" : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {criando ? "Já tem conta? " : "Primeiro acesso? "}
            <button
              type="button"
              onClick={() => setModo(criando ? "entrar" : "criar")}
              className="font-medium text-[hsl(123_63%_23%)] hover:underline"
            >
              {criando ? "Entrar" : "Criar conta"}
            </button>
          </p>

          <p className="mt-10 text-center text-xs text-muted-foreground">
            Dúvidas de acesso: (47) 3311-3648 ·{" "}
            <a
              href="https://www.gestaoservicosaude.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              gestaoservicosaude.com.br
            </a>
          </p>
        </div>
      </main>

      <ForgotPasswordDialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen} />
    </div>
  );
}
