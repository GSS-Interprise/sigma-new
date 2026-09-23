import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Upload, AlertTriangle, FileText } from "lucide-react";

/**
 * Página pública que o médico abre pelo link do e-mail (/nf/<token>) para mandar a nota.
 * Sem login: o token identifica o pagamento. É o que faz o recebimento funcionar sem
 * depender do MX do inbound — e o médico não precisa achar o e-mail para responder.
 */
const ENDPOINT = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/financeiro-nf-upload";
const MAX_MB = 15;

type Info = {
  medico: string; competencia: string; unidade: string | null; valor: string;
  ja_recebida: boolean; recebida_em?: string | null;
};

export default function NfUpload() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${ENDPOINT}?token=${encodeURIComponent(token)}`);
        const j = await r.json();
        if (!j.ok) setErro(j.error === "link_invalido" ? "Este link não é válido ou já expirou." : "Não consegui carregar os dados.");
        else { setInfo(j); setPronto(!!j.ja_recebida); }
      } catch {
        setErro("Não consegui carregar os dados. Tente de novo em instantes.");
      }
      setCarregando(false);
    })();
  }, [token]);

  const enviar = async () => {
    if (!arquivo) return;
    if (arquivo.size > MAX_MB * 1024 * 1024) return setErro(`Arquivo maior que ${MAX_MB} MB.`);
    setEnviando(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("token", token);
      form.append("file", arquivo);
      const r = await fetch(ENDPOINT, { method: "POST", body: form });
      const j = await r.json();
      if (!j.ok) setErro(j.detalhe || "Não consegui receber o arquivo. Envie em PDF, XML ou imagem.");
      else setPronto(true);
    } catch {
      setErro("Falha no envio. Tente de novo.");
    }
    setEnviando(false);
  };

  return (
    <div className="min-h-[100dvh] bg-[#eef1f5] flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="bg-[#1b3a5b] px-6 py-5">
          <p className="text-white text-lg font-bold tracking-wide">GSS <span className="font-normal opacity-80">Saúde</span></p>
          <p className="text-[#9fc0e0] text-[11px] uppercase tracking-[0.15em] mt-0.5">Departamento financeiro</p>
        </div>
        <div className="h-1 bg-[#2563a8]" />

        <div className="p-6 space-y-4">
          {carregando && (
            <p className="text-sm text-slate-500 flex items-center gap-2 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          )}

          {!carregando && erro && !info && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {erro}
            </div>
          )}

          {info && (
            <>
              <div>
                <p className="text-[#1b3a5b] text-base">Olá, Dr(a). <b>{info.medico}</b></p>
                <p className="text-sm text-slate-500 mt-1">
                  Envie aqui a nota fiscal da produção de <b>{info.competencia}</b>
                  {info.unidade ? ` — ${info.unidade}` : ""}.
                </p>
              </div>

              <div className="rounded-lg bg-[#f2f7fc] border border-[#d8e6f4] px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-[#5a7594]">Valor da nota</p>
                <p className="text-2xl font-bold text-[#1b3a5b] leading-tight">{info.valor}</p>
              </div>

              {pronto ? (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">Nota recebida. Obrigado!</p>
                    <p className="text-xs mt-0.5">O financeiro da GSS já foi avisado. Não precisa enviar de novo.</p>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={() => inputRef.current?.click()}
                    className="w-full rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-center hover:border-[#2563a8] hover:bg-slate-50 transition-colors">
                    {arquivo ? (
                      <span className="flex items-center justify-center gap-2 text-sm text-[#1b3a5b]">
                        <FileText className="h-4 w-4" /> {arquivo.name}
                      </span>
                    ) : (
                      <span className="flex flex-col items-center gap-1.5 text-sm text-slate-500">
                        <Upload className="h-6 w-6 text-slate-400" />
                        Toque para escolher o arquivo
                        <span className="text-xs text-slate-400">PDF, XML ou foto — até {MAX_MB} MB</span>
                      </span>
                    )}
                  </button>
                  <input ref={inputRef} type="file" accept=".pdf,.xml,image/*" className="hidden"
                    onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setErro(null); }} />

                  {erro && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">{erro}</p>
                  )}

                  <Button className="w-full h-11 bg-[#1b3a5b] hover:bg-[#16304b]"
                    disabled={!arquivo || enviando} onClick={enviar}>
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    Enviar nota fiscal
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        <div className="bg-[#f6f8fa] border-t border-[#e6ebf1] px-6 py-4">
          <p className="text-xs text-slate-500">
            Dúvida? Responda o e-mail do financeiro que a equipe retorna.
          </p>
        </div>
      </div>
    </div>
  );
}
