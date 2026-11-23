import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Lidos UMA vez na abertura: depois do verifyOtp o AuthContext navega para /reset-password sem ?token_hash
  // (evento PASSWORD_RECOVERY), e o signOut do fim apaga a sessão. Rechecar o link nesses momentos mostrava
  // "inválido ou expirado" depois de a senha já ter sido trocada (Raul, 23/11).
  const tokenHash = useRef(searchParams.get("token_hash"));
  const salvando = useRef(false);

  useEffect(() => {
    // O supabase-js troca o #access_token...&type=recovery por uma sessão e LIMPA a âncora antes desta tela montar
    // (e o AuthContext ainda navega para cá sem âncora no PASSWORD_RECOVERY). Checar só "type=recovery" na âncora
    // recusava todo link válido (Bia, 23/11). Vale: âncora de recovery OU sessão aberta pelo link. Erro do Supabase
    // na âncora (otp_expired) ou nenhuma sessão = link inválido de verdade.
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get("type") === "recovery") return;
    // Link novo (?token_hash=...): o token só é gasto no "Salvar", porque a prévia do WhatsApp e o antivírus do
    // e-mail abrem o link antes da pessoa e queimavam o link antigo (/auth/v1/verify), que vale uma vez só.
    if (tokenHash.current) return;
    const invalido = () => {
      toast.error("Link de redefinição inválido ou expirado. Peça outro em \"Esqueci minha senha\".");
      navigate("/auth");
    };
    if (hashParams.get("error")) { invalido(); return; }
    let ativo = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (ativo && !salvando.current && !data.session) invalido();
    }, 800);
    return () => { ativo = false; clearTimeout(t); };
    // Só na abertura da tela (ver tokenHash acima).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      // Segunda tentativa (ex.: senha recusada) já tem a sessão do link: não gasta o token de novo.
      salvando.current = true;
      if (tokenHash.current && !(await supabase.auth.getSession()).data.session) {
        const { error: erroLink } = await supabase.auth.verifyOtp({ token_hash: tokenHash.current, type: "recovery" });
        // Cada pedido novo cancela o link anterior: o erro mais comum é abrir um e-mail mais antigo.
        if (erroLink) throw new Error("Este link já não vale. Use o e-mail mais recente (cada pedido cancela o anterior) ou peça outro em \"Esqueci minha senha\".");
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success("Senha redefinida com sucesso. Faça login novamente para continuar.");
      
      // Sign out para garantir que o usuário não está autenticado
      await supabase.auth.signOut();
      
      // Redirecionar para login após 2 segundos
      setTimeout(() => {
        navigate("/auth");
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Erro ao redefinir senha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Redefinir Senha</CardTitle>
          <CardDescription>
            Digite sua nova senha abaixo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua nova senha"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirme sua nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Salvar Nova Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
