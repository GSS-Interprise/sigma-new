import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Página pública do link "não quero mais receber" do rodapé do e-mail marketing
 * (/descadastro/<token>). Sem login: o token identifica o envio. Pede confirmação com um
 * clique — antivírus de e-mail abrem links sozinhos e não podem descadastrar ninguém.
 * O botão "cancelar inscrição" do Gmail não passa por aqui: vai direto na edge (POST).
 */
const ENDPOINT = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/email-descadastro";

export default function EmailDescadastro() {
  const { token = "" } = useParams();
  const [email, setEmail] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const j = await (await fetch(`${ENDPOINT}?t=${encodeURIComponent(token)}`)).json();
        if (!j.ok) setErro(j.error === "link_invalido" ? "Este link não é válido." : "Não consegui carregar. Tente de novo em instantes.");
        else { setEmail(j.email); setFeito(!!j.descadastrado); }
      } catch { setErro("Não consegui carregar. Tente de novo em instantes."); }
      setCarregando(false);
    })();
  }, [token]);

  const confirmar = async () => {
    setEnviando(true);
    try {
      const j = await (await fetch(`${ENDPOINT}?t=${encodeURIComponent(token)}`, { method: "POST" })).json();
      if (j.ok) setFeito(true); else setErro("Não consegui registrar. Tente de novo em instantes.");
    } catch { setErro("Não consegui registrar. Tente de novo em instantes."); }
    setEnviando(false);
  };

  return (
    <div className="min-h-[100dvh] bg-[#eef1f5] flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="bg-[#1b3a5b] px-6 py-5">
          <p className="text-white text-lg font-bold tracking-wide">GSS <span className="font-normal opacity-80">Saúde</span></p>
          <p className="text-[#9fc0e0] text-[11px] uppercase tracking-[0.15em] mt-0.5">Preferências de e-mail</p>
        </div>
        <div className="h-1 bg-[#2563a8]" />

        <div className="p-6 space-y-4">
          {carregando ? (
            <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-[#2563a8]" /></div>
          ) : erro ? (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {erro}
            </div>
          ) : feito ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Pronto. <b>{email}</b> não vai mais receber e-mails de oportunidades da GSS.</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                Deseja parar de receber e-mails de oportunidades da GSS em <b>{email}</b>?
              </p>
              <Button className="w-full bg-[#1b3a5b] hover:bg-[#244b73]" disabled={enviando} onClick={confirmar}>
                {enviando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Não quero mais receber
              </Button>
              <p className="text-[11px] text-slate-500">
                Vale só para os e-mails de oportunidades. Contratos, pagamentos e notas fiscais continuam normalmente.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
