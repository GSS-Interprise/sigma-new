import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Code2, Copy, FileUp, ImagePlus, LayoutTemplate, Loader2, Send, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  renderEmail, aplicarVariaveis, modeloBaseHtml, temDescadastro, type EmailConteudo,
} from "@/lib/emailMarketing";
import { EmailPreview } from "./EmailPreview";

/**
 * Editor do e-mail marketing, em dois modos:
 *  - Modelo GSS: assunto, título, mensagem, botão e uma arte de topo opcional. Sem HTML.
 *  - HTML próprio: para quem cria a arte fora (design de e-mail). Sobe o .html e as imagens,
 *    e confere no computador, no celular e no tema escuro antes de enviar.
 * A prévia é o HTML real do envio (mesmo código de supabase/functions/_shared/email-marketing.ts).
 */
export type EmailRascunho = EmailConteudo & { assunto: string; remetente_nome: string };

/** Só o que vai para `campanhas.email_conteudo`. */
export const conteudoDoRascunho = (r: EmailRascunho): EmailConteudo => ({
  modo: r.modo === "html" ? "html" : "modelo",
  titulo: r.titulo ?? "", mensagem: r.mensagem ?? "", botao_texto: r.botao_texto ?? "", botao_link: r.botao_link ?? "",
  imagem_url: r.imagem_url ?? "", html: r.html ?? "",
});

const VARIAVEIS = [
  { v: "{{primeiro_nome}}", d: "primeiro nome" },
  { v: "{{nome}}", d: "nome completo" },
  { v: "{{especialidade}}", d: "especialidade" },
  { v: "{{cidade}}", d: "cidade" },
  { v: "{{uf}}", d: "estado" },
];
const EXEMPLO = { nome: "Dra. Marina Souza", especialidade: "Pediatria", cidade: "Itajaí", uf: "SC" };
const BUCKET = "email-artes";
const MAX_IMAGEM = 2 * 1024 * 1024;
// o Gmail corta o e-mail ("mensagem cortada") quando o HTML passa de ~102 KB
const LIMITE_GMAIL = 100 * 1024;

type Arte = { nome: string; url: string };

export function EmailComposer({
  valor, onChange, campanhaId, desabilitado = false,
}: { valor: EmailRascunho; onChange: (v: EmailRascunho) => void; campanhaId: string; desabilitado?: boolean }) {
  const [testePara, setTestePara] = useState("");
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [artes, setArtes] = useState<Arte[]>([]);
  const inputHtml = useRef<HTMLInputElement>(null);
  const inputArte = useRef<HTMLInputElement>(null);
  const inputTopo = useRef<HTMLInputElement>(null);

  const modo = valor.modo === "html" ? "html" : "modelo";
  const set = (campo: keyof EmailRascunho, v: string) => onChange({ ...valor, [campo]: v });

  const previa = useMemo(() => renderEmail(conteudoDoRascunho(valor), EXEMPLO, "#").html, [valor]);
  const tamanhoHtml = modo === "html" ? new Blob([valor.html ?? ""]).size : 0;

  // imagens já enviadas para esta campanha
  useEffect(() => {
    if (modo !== "html") return;
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).list(campanhaId, { sortBy: { column: "created_at", order: "desc" } });
      setArtes((data ?? []).filter((f) => f.name && !f.name.startsWith(".")).map((f) => ({
        nome: f.name.replace(/^\d+-/, ""),
        url: supabase.storage.from(BUCKET).getPublicUrl(`${campanhaId}/${f.name}`).data.publicUrl,
      })));
    })();
  }, [modo, campanhaId]);

  const subirImagem = async (arquivo: File): Promise<Arte | null> => {
    if (!arquivo.type.startsWith("image/")) { toast.error("Envie uma imagem (PNG, JPG, GIF ou WebP)."); return null; }
    if (arquivo.size > MAX_IMAGEM) { toast.error("Imagem acima de 2 MB. Reduza antes de enviar — imagem pesada atrapalha a entrega."); return null; }
    setSubindo(true);
    const limpo = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const caminho = `${campanhaId}/${Date.now()}-${limpo}`;
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: "31536000" });
    setSubindo(false);
    if (error) { toast.error("Não subiu a imagem: " + error.message); return null; }
    return { nome: limpo, url: supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl };
  };

  const copiar = async (texto: string, aviso: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success(aviso); }
    catch { toast.message(texto); }
  };

  const aoEscolherArte = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]; e.target.value = "";
    if (!arquivo) return;
    const arte = await subirImagem(arquivo);
    if (!arte) return;
    setArtes((a) => [arte, ...a]);
    copiar(arte.url, "Imagem enviada. Endereço copiado — cole no src da <img> do seu HTML.");
  };

  const aoEscolherTopo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]; e.target.value = "";
    if (!arquivo) return;
    const arte = await subirImagem(arquivo);
    if (arte) onChange({ ...valor, imagem_url: arte.url });
  };

  const aoEscolherHtml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]; e.target.value = "";
    if (!arquivo) return;
    if (arquivo.size > 300 * 1024) return toast.error("Arquivo acima de 300 KB. E-mail tão grande é cortado pelo Gmail.");
    onChange({ ...valor, modo: "html", html: await arquivo.text() });
    toast.success("HTML carregado. Confira a prévia no computador e no celular.");
  };

  const enviarTeste = async () => {
    const para = testePara.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!para.length) return toast.error("Informe ao menos um e-mail para o teste.");
    setEnviandoTeste(true);
    const { data, error } = await supabase.functions.invoke("email-campanha", {
      body: {
        acao: "teste", campanha_id: campanhaId, para,
        assunto: valor.assunto, remetente_nome: valor.remetente_nome, conteudo: conteudoDoRascunho(valor),
      },
    });
    setEnviandoTeste(false);
    const r = data as any;
    if (error || !r?.ok) return toast.error("Teste não enviado: " + (error?.message || r?.error || r?.erro || ""));
    toast.success(`Teste enviado para ${r.enviados} endereço(s)${r.exemplo_com ? `, com os dados de ${r.exemplo_com}` : ""}.`);
  };

  const abaModo = (m: "modelo" | "html", Icone: typeof Code2, rotulo: string) => (
    <button type="button" disabled={desabilitado} onClick={() => onChange({ ...valor, modo: m })}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm ${modo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      <Icone className="h-4 w-4" /> {rotulo}
    </button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 min-w-0">
        <div className="flex rounded-md border p-0.5">
          {abaModo("modelo", LayoutTemplate, "Modelo GSS")}
          {abaModo("html", Code2, "HTML próprio")}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Assunto</Label>
            <Input value={valor.assunto} disabled={desabilitado} onChange={(e) => set("assunto", e.target.value)}
              placeholder="Vaga de {{especialidade}} em {{cidade}}" />
          </div>
          <div>
            <Label className="text-xs">Nome do remetente</Label>
            <Input value={valor.remetente_nome} disabled={desabilitado} onChange={(e) => set("remetente_nome", e.target.value)}
              placeholder="GSS Saúde · Vagas" />
          </div>
        </div>

        {modo === "modelo" ? (
          <>
            <div>
              <Label className="text-xs">Arte de topo (opcional)</Label>
              <input ref={inputTopo} type="file" accept="image/*" className="hidden" onChange={aoEscolherTopo} />
              {valor.imagem_url ? (
                <div className="mt-1 flex items-center gap-3 rounded-md border p-2">
                  <img src={valor.imagem_url} alt="" className="h-14 w-28 rounded object-cover" />
                  <span className="text-xs text-muted-foreground flex-1 truncate">Aparece logo abaixo do cabeçalho.</span>
                  <Button type="button" size="sm" variant="ghost" disabled={desabilitado} onClick={() => set("imagem_url", "")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" className="mt-1 gap-1.5 w-full sm:w-auto" disabled={desabilitado || subindo}
                  onClick={() => inputTopo.current?.click()}>
                  {subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Subir imagem
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">Largura ideal 1200 px (aparece com 600), até 2 MB. PNG ou JPG.</p>
            </div>
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={valor.titulo ?? ""} disabled={desabilitado} onChange={(e) => set("titulo", e.target.value)}
                placeholder="Plantões de {{especialidade}} abertos" />
            </div>
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea rows={8} value={valor.mensagem ?? ""} disabled={desabilitado} onChange={(e) => set("mensagem", e.target.value)}
                placeholder={"Olá, {{primeiro_nome}}!\n\nEstamos com plantões de **{{especialidade}}** em {{cidade}}.\n\nLinha em branco separa parágrafos; **texto** fica em negrito."} />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {VARIAVEIS.map((x) => (
                  <button key={x.v} type="button" disabled={desabilitado} title={`Insere ${x.d}`}
                    onClick={() => set("mensagem", `${valor.mensagem ?? ""}${x.v}`)}
                    className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted font-mono">
                    {x.v}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Texto do botão (opcional)</Label>
                <Input value={valor.botao_texto ?? ""} disabled={desabilitado} onChange={(e) => set("botao_texto", e.target.value)}
                  placeholder="Quero saber mais" />
              </div>
              <div>
                <Label className="text-xs">Link do botão</Label>
                <Input value={valor.botao_link ?? ""} disabled={desabilitado} onChange={(e) => set("botao_link", e.target.value)}
                  placeholder="https://wa.me/55479..." />
              </div>
            </div>
          </>
        ) : (
          <>
            <input ref={inputHtml} type="file" accept=".html,.htm,text/html" className="hidden" onChange={aoEscolherHtml} />
            <input ref={inputArte} type="file" accept="image/*" className="hidden" onChange={aoEscolherArte} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={desabilitado} onClick={() => inputHtml.current?.click()}>
                <FileUp className="h-4 w-4" /> Carregar arquivo .html
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={desabilitado || subindo} onClick={() => inputArte.current?.click()}>
                {subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Subir imagem
              </Button>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={desabilitado}
                title="Preenche o código com o modelo GSS, para editar a partir dele"
                onClick={() => {
                  if ((valor.html ?? "").trim() && !window.confirm("Substituir o HTML atual pelo modelo GSS?")) return;
                  onChange({ ...valor, modo: "html", html: modeloBaseHtml(valor) });
                }}>
                <Wand2 className="h-4 w-4" /> Começar do modelo GSS
              </Button>
            </div>

            <div>
              <Label className="text-xs">Código HTML</Label>
              <Textarea rows={14} spellCheck={false} value={valor.html ?? ""} disabled={desabilitado}
                onChange={(e) => set("html", e.target.value)}
                className="font-mono text-xs leading-relaxed"
                placeholder={'<!doctype html>\n<html>...\n  Olá, {{primeiro_nome}}!\n  <img src="(endereço da imagem enviada)">\n  <a href="{{link_descadastro}}">Não quero mais receber</a>\n</html>'} />
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {[...VARIAVEIS, { v: "{{link_descadastro}}", d: "link para sair da lista" }].map((x) => (
                  <button key={x.v} type="button" title={`Copia ${x.d}`} onClick={() => copiar(x.v, `${x.v} copiado.`)}
                    className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted font-mono">
                    {x.v}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md border p-2.5 text-xs space-y-1">
              <p className={tamanhoHtml > LIMITE_GMAIL ? "text-red-700" : "text-muted-foreground"}>
                Tamanho: <b>{(tamanhoHtml / 1024).toFixed(1)} KB</b>
                {tamanhoHtml > LIMITE_GMAIL
                  ? " — acima de 100 KB o Gmail corta o e-mail (“mensagem cortada”). Enxugue o código."
                  : " · limite seguro do Gmail: 100 KB."}
              </p>
              <p className="text-muted-foreground">
                {temDescadastro(valor.html ?? "")
                  ? "Descadastro: o seu HTML já tem o {{link_descadastro}}."
                  : "Descadastro: sem {{link_descadastro}} no código, o rodapé legal da GSS entra sozinho no fim."}
              </p>
              <p className="text-muted-foreground">Imagens precisam estar na internet: use “Subir imagem” e cole o endereço no src.</p>
            </div>

            {artes.length > 0 && (
              <div className="rounded-md border divide-y">
                {artes.map((a) => (
                  <div key={a.url} className="flex items-center gap-2 p-2">
                    <img src={a.url} alt="" className="h-10 w-16 rounded object-cover bg-muted" />
                    <span className="text-xs truncate flex-1">{a.nome}</span>
                    <Button type="button" size="sm" variant="ghost" className="gap-1 h-7 text-xs" onClick={() => copiar(a.url, "Endereço da imagem copiado.")}>
                      <Copy className="h-3.5 w-3.5" /> Copiar endereço
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="rounded-md border p-3 space-y-2">
          <Label className="text-xs">Enviar teste para</Label>
          <div className="flex gap-2">
            <Input value={testePara} onChange={(e) => setTestePara(e.target.value)} placeholder="voce@gestaoservicosaude.com.br, mavi@…" />
            <Button type="button" variant="outline" className="gap-1.5 shrink-0" disabled={enviandoTeste} onClick={enviarTeste}>
              {enviandoTeste ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Testar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            O teste sai com os dados de um médico do público desta campanha e com "[TESTE]" no assunto. Abra no celular também.
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <EmailPreview html={previa} assunto={aplicarVariaveis(valor.assunto || "", EXEMPLO)} />
      </div>
    </div>
  );
}
