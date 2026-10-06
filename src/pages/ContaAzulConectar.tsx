import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

/**
 * Página pública de conexão do Conta Azul com o Sigma. Quem abre é quem administra o
 * Conta Azul, pelo link de convite (/conta-azul/conectar/<convite>, vale 24h) — não precisa
 * estar logado no Sigma: o convite é a autorização.
 *
 * Dois caminhos, conforme o aplicativo cadastrado no Conta Azul:
 *  - app de produção: o Conta Azul devolve o navegador para /conta-azul/retorno e a conexão fecha sozinha;
 *  - app de desenvolvimento: o retorno é fixo no site do Conta Azul, então a pessoa copia o
 *    endereço da barra e cola aqui (o código vale só 3 minutos).
 */
const ENDPOINT = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/contaazul-oauth";

const chamar = async (corpo: Record<string, unknown>) => {
  const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  return (await r.json().catch(() => ({ ok: false, error: "resposta_invalida" }))) as any;
};

const ERROS: Record<string, string> = {
  convite_invalido: "Este link de conexão não vale mais. Peça um novo.",
  sem_codigo: "O endereço colado não tem o código de autorização. Faça o login de novo e copie o endereço inteiro da barra do navegador.",
  state_invalido: "Este retorno não corresponde ao pedido de conexão aberto. Recomece pelo link.",
};
const traduz = (e?: string) =>
  ERROS[e || ""] || (String(e || "").includes("contaazul_token")
    ? "O Conta Azul recusou o código — ele vale só 3 minutos. Faça o login de novo e cole o endereço logo em seguida."
    : "Não foi possível concluir. Tente de novo em instantes.");

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#eef1f5] flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="bg-[#1b3a5b] px-6 py-5">
          <p className="text-white text-lg font-bold tracking-wide">GSS <span className="font-normal opacity-80">Saúde</span></p>
          <p className="text-[#9fc0e0] text-[11px] uppercase tracking-[0.15em] mt-0.5">Conexão com o Conta Azul</p>
        </div>
        <div className="h-1 bg-[#2563a8]" />
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

const Aviso = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
    {ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
    <span>{children}</span>
  </div>
);

export default function ContaAzulConectar() {
  const { convite = "" } = useParams();
  const [urlLogin, setUrlLogin] = useState<string | null>(null);
  const [direto, setDireto] = useState(false);
  const [colado, setColado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    (async () => {
      const j = await chamar({ acao: "preparar", convite });
      if (j.ok) { setUrlLogin(j.url_login); setDireto(!!j.retorno_direto); } else setErro(traduz(j.error));
      setCarregando(false);
    })();
  }, [convite]);

  const concluir = async () => {
    setEnviando(true); setErro(null);
    const j = await chamar({ acao: "concluir", convite, colado });
    setEnviando(false);
    if (j.ok) setPronto(true); else setErro(traduz(j.error));
  };

  return (
    <Moldura>
      {carregando ? (
        <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-[#2563a8]" /></div>
      ) : pronto ? (
        <Aviso ok>Conta Azul conectado ao Sigma. Pode fechar esta janela.</Aviso>
      ) : !urlLogin ? (
        <Aviso ok={false}>{erro}</Aviso>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            Esta conexão permite ao Sigma <b>consultar</b> categorias, centros de custo, contas e fornecedores do Conta Azul.
            Nada é alterado no Conta Azul nesta etapa.
          </p>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[#1b3a5b]">1. Entre no Conta Azul</p>
            <Button asChild className="bg-[#1b3a5b] hover:bg-[#244b73] gap-2">
              <a href={urlLogin} target={direto ? "_self" : "_blank"} rel="noopener noreferrer">
                Abrir o login do Conta Azul <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          {!direto && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[#1b3a5b]">2. Cole aqui o endereço para onde você foi levado</p>
              <p className="text-xs text-slate-500">
                Depois do login você cai no site do Conta Azul. Copie o <b>endereço inteiro</b> da barra do navegador
                (ele termina com <code>code=…</code>) e cole abaixo em até 3 minutos.
              </p>
              <Textarea rows={3} value={colado} onChange={(e) => setColado(e.target.value)} placeholder="https://contaazul.com/?code=..." className="text-xs" />
              <Button className="w-full" disabled={enviando || !colado.trim()} onClick={concluir}>
                {enviando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Concluir conexão
              </Button>
            </div>
          )}
          {erro && <Aviso ok={false}>{erro}</Aviso>}
        </>
      )}
    </Moldura>
  );
}

/** Retorno direto do Conta Azul (app de produção): /conta-azul/retorno?code=…&state=… */
export function ContaAzulRetorno() {
  const [params] = useSearchParams();
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      const code = params.get("code"), state = params.get("state");
      if (!code || !state) { setErro("Retorno sem código de autorização. Recomece pelo link de conexão."); setEstado("erro"); return; }
      const j = await chamar({ acao: "retorno", code, state });
      if (j.ok) setEstado("ok"); else { setErro(traduz(j.error)); setEstado("erro"); }
    })();
  }, [params]);

  return (
    <Moldura>
      {estado === "carregando" && <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-[#2563a8]" /></div>}
      {estado === "ok" && <Aviso ok>Conta Azul conectado ao Sigma. Pode fechar esta janela.</Aviso>}
      {estado === "erro" && <Aviso ok={false}>{erro}</Aviso>}
    </Moldura>
  );
}
