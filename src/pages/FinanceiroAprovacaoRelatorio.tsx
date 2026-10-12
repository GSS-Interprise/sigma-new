import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, FileText, Loader2 } from "lucide-react";

/**
 * Página do botão "Ver relatório" do pedido de aprovação enviado pelo WhatsApp
 * (/aprovacao/<token>). Abre sem login: quem tem o link é quem recebeu o pedido.
 * Só MOSTRA o fechamento. A aprovação é pelos botões do WhatsApp ou pelo canal do Sigma,
 * que conferem quem está respondendo; um link sozinho não aprova pagamento.
 */
const ENDPOINT = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/financeiro-aprovacao-whatsapp";
const brl = (v: number | null | undefined) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SITUACAO: Record<string, string> = {
  enviado: "Aguardando a sua resposta no WhatsApp.",
  aprovado: "Pagamento aprovado.",
  nao_aprovado: "Pagamento não aprovado.",
  substituido: "Este pedido foi substituído por um mais recente.",
};

export default function FinanceiroAprovacaoRelatorio() {
  const { token = "" } = useParams();
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "relatorio", token }) });
        const j = await r.json();
        if (j.ok) setDados(j); else setErro(true);
      } catch { setErro(true); }
    })();
  }, [token]);

  return (
    <div className="min-h-[100dvh] bg-[#eef1f5] flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="bg-[#1b3a5b] px-6 py-5">
          <p className="text-white text-lg font-bold tracking-wide">GSS <span className="font-normal opacity-80">Saúde</span></p>
          <p className="text-[#9fc0e0] text-[11px] uppercase tracking-[0.15em] mt-0.5">Aprovação de pagamento</p>
        </div>
        <div className="h-1 bg-[#2563a8]" />
        <div className="p-6 space-y-4">
          {erro ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Este link não vale mais. O relatório continua disponível no Sigma.</span>
            </div>
          ) : !dados ? (
            <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-[#2563a8]" /></div>
          ) : (
            <>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Fechamento</p>
                <p className="text-2xl font-bold text-[#1b3a5b]">{dados.competencia}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-3"><p className="text-xs text-slate-500">Total a pagar</p><p className="text-lg font-semibold">{brl(dados.total)}</p></div>
                <div className="rounded-md border p-3"><p className="text-xs text-slate-500">Médicos</p><p className="text-lg font-semibold">{dados.qtd_medicos ?? 0}</p></div>
              </div>
              {dados.pdf_url ? (
                <Button asChild className="w-full gap-2 bg-[#1b3a5b] hover:bg-[#244b73]">
                  <a href={dados.pdf_url} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" /> Abrir o relatório (PDF)</a>
                </Button>
              ) : <p className="text-sm text-slate-500">O relatório em PDF não está anexado a este fechamento.</p>}
              <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${dados.pedido_status === "aprovado" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                {dados.pedido_status === "aprovado" && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{SITUACAO[dados.pedido_status] ?? ""} {dados.pedido_status === "enviado" && "Volte à conversa e toque em Aprovar pagamento ou Não aprovar."}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
