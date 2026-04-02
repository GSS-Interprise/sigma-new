import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { Building2, Phone, Mail, MapPin, User, Lock } from "lucide-react";
import gssLogoFull from "@/assets/gss-logo-full.png";
import medicalTeam from "@/assets/medical-team-login.jpg";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";

export default function Auth() {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupNome, setSignupNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  if (user) {
    navigate("/");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
    } catch (error) {
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signUp(signupEmail, signupPassword, signupNome);
    } catch (error) {
      console.error("Signup error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      {/* Background Image with Blur and Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src={medicalTeam}
          alt="Equipe Médica GSS"
          className="w-full h-full object-cover"
          style={{ filter: "blur(3px)" }}
        />
        <div className="absolute inset-0 bg-white/70" />
      </div>

      {/* Login Card - Centered Right */}
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <Card className="bg-white shadow-[0_4px_20px_rgba(0,0,0,0.1)] rounded-xl">
          <CardHeader className="space-y-4 pb-4">
            {/* GSS Logo */}
            <div className="flex justify-center">
              <img src={gssLogoFull} alt="GSS - Gestão de Serviços de Saúde" className="h-16 w-auto" />
            </div>

            {/* Portal Title */}
            <div className="text-center">
              <h1 className="text-2xl font-semibold" style={{ color: "#1b5e20" }}>
                Portal SIGMA
              </h1>
              <p className="text-sm mt-1" style={{ color: "#555" }}>
                Sistema Integrado de Gestão Médica e Alocação
              </p>
            </div>
          </CardHeader>

          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Cadastro</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" style={{ color: "#555" }}>
                      Email
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#1b5e20" }} />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" style={{ color: "#555" }}>
                      Senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#1b5e20" }} />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full text-white hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: "#1b5e20" }}
                    disabled={loading}
                  >
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="w-full"
                    style={{ color: "#1b5e20" }}
                    onClick={() => setForgotPasswordOpen(true)}
                  >
                    Esqueci minha senha
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-nome" style={{ color: "#555" }}>
                      Nome Completo
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#1b5e20" }} />
                      <Input
                        id="signup-nome"
                        type="text"
                        placeholder="Seu nome completo"
                        value={signupNome}
                        onChange={(e) => setSignupNome(e.target.value)}
                        required
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" style={{ color: "#555" }}>
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#1b5e20" }} />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        required
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" style={{ color: "#555" }}>
                      Senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#1b5e20" }} />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        required
                        minLength={6}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full text-white hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: "#1b5e20" }}
                    disabled={loading}
                  >
                    {loading ? "Cadastrando..." : "Criar Conta"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            {/* Company Info - Compact */}
            <div className="mt-6 pt-6 border-t space-y-4">
              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2" style={{ color: "#1b5e20" }}>
                  <Building2 className="h-4 w-4" />
                  Sobre a GSS
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "#555" }}>
                  Estabelecida em 2013, hoje com sede em Balneário Camboriú-SC, a GSS é uma das pioneiras em prestação
                  de serviços médicos no Brasil.
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <h4 className="font-semibold text-xs" style={{ color: "#1b5e20" }}>
                      Missão
                    </h4>
                    <p className="text-xs" style={{ color: "#555" }}>
                      Proporcionar saúde especializada e de qualidade a população.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs" style={{ color: "#1b5e20" }}>
                      Valores
                    </h4>
                    <p className="text-xs" style={{ color: "#555" }}>
                      Integridade • Resolutividade • Responsabilidade • Competência • Ética
                    </p>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2" style={{ color: "#1b5e20" }}>
                  <Phone className="h-4 w-4" />
                  Contato
                </h3>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs" style={{ color: "#555" }}>
                    <MapPin className="h-3 w-3 shrink-0" style={{ color: "#1b5e20" }} />
                    <span>Itajaí - SC</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs" style={{ color: "#555" }}>
                    <Phone className="h-3 w-3 shrink-0" style={{ color: "#1b5e20" }} />
                    <span>(47) 3311-3648</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="h-3 w-3 shrink-0" style={{ color: "#1b5e20" }} />
                    <a
                      href="https://www.gestaoservicosaude.com.br"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      style={{ color: "#1b5e20" }}
                    >
                      www.gestaoservicosaude.com.br
                    </a>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t text-center">
                <p className="text-xs" style={{ color: "#555" }}>
                  © 2013-{new Date().getFullYear()} GSS - Gestão de Serviços de Saúde.
                  <br />
                  Todos os direitos reservados.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ForgotPasswordDialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen} />
    </div>
  );
}
