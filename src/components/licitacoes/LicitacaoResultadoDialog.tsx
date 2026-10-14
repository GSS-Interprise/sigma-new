import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSearch, Info, Loader2, Plus, Sparkles, Trash2, Trophy, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Resultado da disputa (T7 de docs/arquitetura/licitacoes-contratos-gss.md). Abre ao mover o card
 * para "Não ganhamos" ou "Arrematados" e pelo card. Pedidos da reunião de 07/10:
 *  - "não ganhamos" com motivo escrito (livre) e colocação visível (Bianca);
 *  - anexar a ata e a IA ler participantes, colocação e valores (edge licitacao-ata-ler);
 *  - só o arrematante e as empresas acima da GSS, com a diferença de preço; inabilitação à mão.
 * A IA só preenche a tabela: a equipe revisa e salva. Grava nas tabelas do BI de inteligência
 * competitiva (um item por lote, marcado do_resultado para poder ser regravado).
 */
export const GSS_NOME = "GSS - GESTÃO SERVIÇOS À SAÚDE LTDA";
export const GSS_CNPJ = "18.670.594/0001-03";
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

type Linha = {
  chave: string; lote: string; posicao: number | null; empresa: string; cnpj: string; valor: number | null;
  situacao: string; motivo: string; vencedor: boolean; gss: boolean;
};
type Anexo = { bucket: string; path: string; nome: string };

const SITUACOES = [
  { value: "habilitada", label: "Habilitada" },
  { value: "inabilitada", label: "Inabilitada" },
  { value: "desclassificada", label: "Desclassificada" },
];
const CATEGORIAS = [
  { value: "preco", label: "Preço" },
  { value: "documentacao", label: "Documentação" },
  { value: "habilitacao_tecnica", label: "Habilitação técnica" },
  { value: "prazo", label: "Prazo" },
  { value: "estrategia", label: "Estratégia" },
  { value: "outros", label: "Outros" },
];
const novaChave = () => Math.random().toString(36).slice(2);
const brl = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const linhaGss = (lote = "", vencedor = false): Linha => ({
  chave: novaChave(), lote, posicao: vencedor ? 1 : null, empresa: GSS_NOME, cnpj: GSS_CNPJ, valor: null,
  situacao: "habilitada", motivo: "", vencedor, gss: true,
});

export function LicitacaoResultadoDialog({ open, onOpenChange, licitacaoId, novoStatus, licitacaoTitulo, onConfirm, onCancel }: {
  open: boolean; onOpenChange: (o: boolean) => void; licitacaoId: string; novoStatus: string;
  licitacaoTitulo?: string; onConfirm: () => void; onCancel: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ganhou = novoStatus === "arrematados";
  const perdeu = novoStatus === "nao_ganhamos";
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [motivo, setMotivo] = useState("");
  const [categoria, setCategoria] = useState<string>("");
  const [ata, setAta] = useState<Anexo | null>(null);
  const [fonte, setFonte] = useState<"manual" | "ata_ia">("manual");
  const [lendo, setLendo] = useState(false);
  const [obsIa, setObsIa] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  // anexos do card (enviados pela equipe + baixados pela captação) para escolher a ata
  const { data: anexos = [], refetch: recarregarAnexos } = useQuery({
    queryKey: ["resultado-anexos", licitacaoId],
    enabled: open && !!licitacaoId,
    queryFn: async () => {
      const [{ data: tab }, { data: bkt }] = await Promise.all([
        supabase.from("licitacoes_anexos").select("arquivo_nome, arquivo_url").eq("licitacao_id", licitacaoId).order("created_at", { ascending: false }),
        supabase.storage.from("editais-pdfs").list(`${licitacaoId}/`),
      ]);
      const lista: Anexo[] = [
        ...(tab ?? []).map((a: any) => ({ bucket: "licitacoes-anexos", path: a.arquivo_url, nome: a.arquivo_nome })),
        ...(bkt ?? []).filter((f: any) => f.name && f.id).map((f: any) => ({ bucket: "editais-pdfs", path: `${licitacaoId}/${f.name}`, nome: f.name })),
      ].filter((a) => /\.(pdf|png|jpe?g)$/i.test(a.nome) || !/\.\w{2,4}$/.test(a.nome));
      // ata primeiro
      return lista.sort((a, b) => Number(/ata|resultado|sess/i.test(b.nome)) - Number(/ata|resultado|sess/i.test(a.nome)));
    },
  });

  // resultado já registrado (editar)
  useEffect(() => {
    if (!open || !licitacaoId) return;
    setCarregado(false);
    (async () => {
      const { data: res } = await (supabase as any).from("licitacao_resultados").select("*").eq("licitacao_id", licitacaoId).maybeSingle();
      const { data: itens } = await (supabase as any).from("licitacao_itens").select("id, lote, nome").eq("licitacao_id", licitacaoId).eq("do_resultado", true);
      let ls: Linha[] = [];
      if (itens?.length) {
        const { data: concs } = await (supabase as any).from("licitacao_item_concorrentes").select("*").in("item_id", itens.map((i: any) => i.id));
        ls = (concs ?? []).map((c: any) => ({
          chave: novaChave(), lote: itens.find((i: any) => i.id === c.item_id)?.lote ?? "", posicao: c.posicao, empresa: c.empresa_nome,
          cnpj: c.empresa_cnpj ?? "", valor: c.valor_ofertado, situacao: c.situacao || "habilitada", motivo: c.motivo_situacao ?? "",
          vencedor: !!c.is_vencedor, gss: !!c.is_gss,
        })).sort((a: Linha, b: Linha) => a.lote.localeCompare(b.lote) || (a.posicao ?? 99) - (b.posicao ?? 99));
      }
      if (!ls.length) ls = [linhaGss("", ganhou)];
      setLinhas(ls);
      setMotivo(res?.motivo_texto ?? res?.observacoes_estrategicas ?? "");
      setCategoria(res?.motivo_perda ?? "");
      setFonte(res?.fonte === "ata_ia" ? "ata_ia" : "manual");
      setAta(res?.ata_path ? { bucket: res.ata_bucket, path: res.ata_path, nome: res.ata_path.split("/").pop() } : null);
      setObsIa(null);
      setCarregado(true);
    })();
  }, [open, licitacaoId, ganhou]);

  const mudar = (chave: string, campo: keyof Linha, valor: any) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));

  const enviarArquivo = async (f: File) => {
    const nome = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");
    const path = `${licitacaoId}/${Date.now()}_${nome}`;
    const { error } = await supabase.storage.from("licitacoes-anexos").upload(path, f);
    if (error) return toast.error("Não enviou o arquivo: " + error.message);
    const { data: perfil } = await supabase.from("profiles").select("nome_completo").eq("id", user!.id).maybeSingle();
    await supabase.from("licitacoes_anexos").insert({ licitacao_id: licitacaoId, arquivo_nome: f.name, arquivo_url: path, usuario_id: user!.id, usuario_nome: perfil?.nome_completo || "Usuário" } as any);
    qc.invalidateQueries({ queryKey: ["licitacao-anexos-tabela", licitacaoId] });
    await recarregarAnexos();
    setAta({ bucket: "licitacoes-anexos", path, nome: f.name });
    toast.success("Ata anexada ao card");
  };

  const lerAta = async () => {
    if (!ata) return toast.error("Escolha ou envie a ata primeiro");
    setLendo(true);
    try {
      const { data, error } = await supabase.functions.invoke("licitacao-ata-ler", { body: { licitacao_id: licitacaoId, bucket: ata.bucket, path: ata.path } });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Falha ao ler a ata");
      const novas: Linha[] = [];
      for (const l of data.lotes ?? []) {
        const lote = l.lote ?? "";
        if (l.gss) novas.push({ ...linhaGss(lote, !!l.gss.vencedor), posicao: l.gss.posicao, valor: l.gss.valor, situacao: l.gss.situacao || "habilitada", motivo: l.gss.motivo ?? "" });
        for (const e of l.empresas ?? []) {
          novas.push({ chave: novaChave(), lote, posicao: e.posicao, empresa: e.empresa, cnpj: e.cnpj ?? "", valor: e.valor, situacao: e.situacao || "habilitada", motivo: e.motivo ?? "", vencedor: !!e.vencedor, gss: false });
        }
      }
      if (!novas.length) { toast.warning("A IA não achou participantes nesta ata. Preencha à mão."); return; }
      setLinhas(novas.sort((a, b) => a.lote.localeCompare(b.lote) || (a.posicao ?? 99) - (b.posicao ?? 99)));
      setFonte("ata_ia");
      setObsIa(data.observacao ?? null);
      const semGss = (data.lotes ?? []).every((l: any) => !l.gss);
      toast.success(semGss ? "Ata lida. A GSS não aparece nela: confira e lance à mão se for o caso." : "Ata lida. Confira os dados antes de salvar.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLendo(false);
    }
  };

  // diferença de preço da GSS para o arrematante, por lote
  const diferencas = useMemo(() => {
    const lotes = [...new Set(linhas.map((l) => l.lote))];
    return lotes.map((lote) => {
      const g = linhas.find((l) => l.lote === lote && l.gss);
      const v = linhas.find((l) => l.lote === lote && l.vencedor && !l.gss);
      if (!g?.valor || !v?.valor) return null;
      const d = g.valor - v.valor;
      return { lote, texto: `${lote ? `Lote ${lote}: ` : ""}GSS ${d >= 0 ? "acima" : "abaixo"} do arrematante em ${brl(Math.abs(d))} (${((Math.abs(d) / v.valor) * 100).toFixed(1)}%)` };
    }).filter(Boolean) as { lote: string; texto: string }[];
  }, [linhas]);

  const gssLinhas = linhas.filter((l) => l.gss);
  const melhorGss = [...gssLinhas].sort((a, b) => (a.posicao ?? 99) - (b.posicao ?? 99))[0];
  const erros: string[] = [];
  if (perdeu && motivo.trim().length < 5) erros.push("Escreva por que não ganhamos");
  if (perdeu && !gssLinhas.length) erros.push("Inclua a linha da GSS com a colocação (ou a inabilitação)");
  if (perdeu && melhorGss && melhorGss.posicao == null && melhorGss.situacao === "habilitada") erros.push("Informe a colocação da GSS");
  if (linhas.some((l) => !l.empresa.trim())) erros.push("Toda linha precisa do nome da empresa");

  const salvar = async () => {
    if (erros.length) return toast.error(erros[0]);
    setSalvando(true);
    try {
      // empresas concorrentes: acha pelo CNPJ (ou nome) e cria as novas
      const { data: empresas } = await supabase.from("empresas_concorrentes").select("id, nome, cnpj");
      const idEmpresa = async (l: Linha) => {
        const cnpj = soDigitos(l.cnpj);
        const achada = (empresas ?? []).find((e: any) => (cnpj && soDigitos(e.cnpj) === cnpj) || e.nome.trim().toLowerCase() === l.empresa.trim().toLowerCase());
        if (achada) return achada.id;
        const { data, error } = await supabase.from("empresas_concorrentes").insert({ nome: l.empresa.trim(), cnpj: l.cnpj || null }).select("id").single();
        if (error) throw error;
        (empresas as any[])?.push({ id: data.id, nome: l.empresa, cnpj: l.cnpj });
        return data.id;
      };

      // regrava os itens do resultado (os itens lançados pela tela antiga ficam)
      const { data: antigos } = await (supabase as any).from("licitacao_itens").select("id").eq("licitacao_id", licitacaoId).eq("do_resultado", true);
      if (antigos?.length) {
        const ids = antigos.map((i: any) => i.id);
        await (supabase as any).from("licitacao_item_concorrentes").delete().in("item_id", ids);
        await (supabase as any).from("licitacao_itens").delete().in("id", ids);
      }
      for (const lote of [...new Set(linhas.map((l) => l.lote))]) {
        const { data: item, error: eItem } = await (supabase as any).from("licitacao_itens").insert({
          licitacao_id: licitacaoId, nome: lote ? `Lote ${lote}` : "Resultado geral", tipo: "servico", lote: lote || null,
          do_resultado: true, origem_extracao: fonte === "ata_ia" ? "importacao_ata" : "manual",
        }).select("id").single();
        if (eItem) throw eItem;
        const doLote = linhas.filter((l) => l.lote === lote);
        const rows = [];
        for (const l of doLote) {
          rows.push({
            item_id: item.id, empresa_id: await idEmpresa(l), empresa_nome: l.empresa.trim(), empresa_cnpj: l.cnpj || null,
            valor_ofertado: l.valor, valor_total: l.valor, posicao: l.posicao, situacao: l.situacao, motivo_situacao: l.motivo || null,
            is_gss: l.gss, is_vencedor: l.vencedor, origem: fonte, requer_revisao_manual: false,
          });
        }
        const { error: eConc } = await (supabase as any).from("licitacao_item_concorrentes").insert(rows);
        if (eConc) throw eConc;
      }

      const vencedores = linhas.filter((l) => l.vencedor);
      const venc = vencedores.find((l) => !l.gss) ?? vencedores[0];
      const gssVenceu = ganhou || gssLinhas.some((l) => l.vencedor);
      const classificacao = gssVenceu ? "primeiro_lugar"
        : melhorGss?.situacao === "inabilitada" ? "nao_habilitada"
        : melhorGss?.situacao === "desclassificada" ? "desclassificada" : "segundo_lugar";
      const { data: perfil } = await supabase.from("profiles").select("nome_completo").eq("id", user!.id).maybeSingle();
      const { error: eRes } = await (supabase as any).from("licitacao_resultados").upsert({
        licitacao_id: licitacaoId,
        empresa_vencedora_nome: venc?.empresa?.trim() || (gssVenceu ? GSS_NOME : "N/A"),
        empresa_vencedora_id: venc ? await idEmpresa(venc) : null,
        valor_homologado: vencedores.reduce((s, l) => s + (l.valor ?? 0), 0),
        classificacao_gss: classificacao,
        motivo_perda: categoria || null,
        motivo_texto: motivo.trim() || null,
        observacoes_estrategicas: motivo.trim() || null,
        colocacao_gss: gssVenceu ? 1 : melhorGss?.posicao ?? null,
        situacao_gss: melhorGss?.situacao ?? (gssLinhas.length ? "habilitada" : "nao_participou"),
        valor_gss: melhorGss?.valor ?? null,
        ata_bucket: ata?.bucket ?? null, ata_path: ata?.path ?? null, fonte,
        registrado_por: user!.id, registrado_por_nome: perfil?.nome_completo ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "licitacao_id" });
      if (eRes) throw eRes;

      // o motivo e a colocação também ficam no histórico do card
      if (perdeu || ganhou) {
        const col = gssVenceu ? "1º lugar" : melhorGss?.posicao ? `${melhorGss.posicao}º lugar` : melhorGss?.situacao ?? "sem colocação";
        await supabase.from("licitacoes_atividades").insert({
          licitacao_id: licitacaoId, user_id: user!.id, tipo: "comentario",
          descricao: `${ganhou ? "Ganhamos" : "Não ganhamos"} (${col}).${venc && !gssVenceu ? ` Arrematante: ${venc.empresa} ${brl(venc.valor)}.` : ""}${motivo.trim() ? ` Motivo: ${motivo.trim()}` : ""}`,
        } as any);
      }

      ["licitacao-resultado", "licitacao-itens", "licitacao-itens-exists", "licitacoes-atividades", "licitacao-resultado-resumo"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Resultado registrado");
      onConfirm();
    } catch (e: any) {
      console.error(e);
      toast.error("Não salvou o resultado: " + (e?.message || e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); onOpenChange(o); }}>
      <DialogContent className="flex max-h-[94dvh] max-w-5xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            {ganhou ? "Ganhamos: registrar resultado" : perdeu ? "Não ganhamos: registrar resultado" : "Resultado da disputa"}
          </DialogTitle>
          <DialogDescription>
            {licitacaoTitulo && <span className="font-medium text-foreground">{licitacaoTitulo}. </span>}
            Só interessam o arrematante e as empresas que ficaram à frente da GSS. A IA lê a ata e preenche; confira antes de salvar.
          </DialogDescription>
        </DialogHeader>

        {!carregado ? <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div> : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {/* ata */}
            <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3">
              <div className="min-w-[240px] flex-1 space-y-1">
                <span className="text-xs text-muted-foreground">Ata da sessão</span>
                <Select value={ata ? `${ata.bucket}|${ata.path}` : ""} onValueChange={(v) => { const a = anexos.find((x) => `${x.bucket}|${x.path}` === v); if (a) setAta(a); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={anexos.length ? "Escolha o anexo que é a ata" : "Nenhum anexo no card"} /></SelectTrigger>
                  <SelectContent>{anexos.map((a) => <SelectItem key={`${a.bucket}|${a.path}`} value={`${a.bucket}|${a.path}`}>{a.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <input ref={inputArquivo} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.target.value = ""; }} />
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => inputArquivo.current?.click()}><Upload className="h-4 w-4" /> Enviar ata</Button>
              <Button size="sm" className="h-9 gap-1.5" onClick={lerAta} disabled={!ata || lendo}>
                {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {lendo ? "Lendo a ata (até 1 min)…" : "Ler ata com IA"}
              </Button>
              {fonte === "ata_ia" && <Badge variant="outline" className="h-6 gap-1"><FileSearch className="h-3 w-3" /> Preenchido pela IA</Badge>}
            </div>
            {obsIa && (
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">Da ata: {obsIa}</span>
                <button type="button" className="underline" onClick={() => setMotivo((m) => (m ? `${m}\n${obsIa}` : obsIa))}>Copiar para o motivo</button>
              </div>
            )}

            {/* tabela */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Arrematante, empresas à frente da GSS e a GSS</span>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLinhas((ls) => [...ls, linhaGss(ls[ls.length - 1]?.lote ?? "")])}>+ GSS</Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setLinhas((ls) => [...ls, { chave: novaChave(), lote: ls[ls.length - 1]?.lote ?? "", posicao: null, empresa: "", cnpj: "", valor: null, situacao: "habilitada", motivo: "", vencedor: false, gss: false }])}>
                    <Plus className="h-3.5 w-3.5" /> Empresa
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[860px] text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="w-16 p-1.5 text-left font-medium">Lote</th>
                      <th className="w-14 p-1.5 text-left font-medium">Pos.</th>
                      <th className="p-1.5 text-left font-medium">Empresa</th>
                      <th className="w-36 p-1.5 text-left font-medium">CNPJ</th>
                      <th className="w-32 p-1.5 text-left font-medium">Valor final (R$)</th>
                      <th className="w-32 p-1.5 text-left font-medium">Situação</th>
                      <th className="w-20 p-1.5 text-center font-medium">Arrematou</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.chave} className={cn("border-t align-top", l.gss && "bg-primary/5")}>
                        <td className="p-1"><Input value={l.lote} onChange={(e) => mudar(l.chave, "lote", e.target.value)} className="h-8 px-1.5 text-xs" placeholder="—" /></td>
                        <td className="p-1"><Input type="number" min={1} value={l.posicao ?? ""} onChange={(e) => mudar(l.chave, "posicao", e.target.value ? Number(e.target.value) : null)} className="h-8 px-1.5 text-xs" /></td>
                        <td className="p-1">
                          {l.gss ? <div className="flex h-8 items-center gap-1.5 px-1.5 font-medium"><Badge className="h-5 px-1.5 text-[10px]">GSS</Badge> {l.empresa}</div>
                            : <Input value={l.empresa} onChange={(e) => mudar(l.chave, "empresa", e.target.value)} className="h-8 px-1.5 text-xs" />}
                          {l.situacao !== "habilitada" && (
                            <Input value={l.motivo} onChange={(e) => mudar(l.chave, "motivo", e.target.value)} placeholder={`Motivo da ${l.situacao === "inabilitada" ? "inabilitação" : "desclassificação"}`} className="mt-1 h-8 px-1.5 text-xs" />
                          )}
                        </td>
                        <td className="p-1"><Input value={l.cnpj} disabled={l.gss} onChange={(e) => mudar(l.chave, "cnpj", e.target.value)} className="h-8 px-1.5 text-xs" /></td>
                        <td className="p-1">
                          <Input inputMode="decimal" value={l.valor ?? ""} placeholder="0,00"
                            onChange={(e) => { const t = e.target.value.replace(/\./g, "").replace(",", "."); mudar(l.chave, "valor", t === "" ? null : Number.isFinite(Number(t)) ? Number(t) : l.valor); }}
                            className="h-8 px-1.5 text-xs" />
                          <span className="block px-1.5 text-[10px] text-muted-foreground">{brl(l.valor)}</span>
                        </td>
                        <td className="p-1">
                          <Select value={l.situacao} onValueChange={(v) => mudar(l.chave, "situacao", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{SITUACOES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="p-1 text-center"><Checkbox checked={l.vencedor} onCheckedChange={(v) => mudar(l.chave, "vencedor", !!v)} className="mt-2" /></td>
                        <td className="p-1">
                          <button type="button" className="mt-1 rounded p-1 text-destructive hover:bg-destructive/10" title="Remover linha" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {diferencas.map((d) => <p key={d.lote} className="text-xs font-medium text-muted-foreground">{d.texto}</p>)}
            </div>

            {/* motivo */}
            <div className="space-y-1.5">
              <span className="text-sm font-medium">{perdeu ? "Por que não ganhamos *" : "Observações"}</span>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
                placeholder={perdeu ? "Ex.: preço 10% acima do arrematante; atestado de capacidade não aceito no item 9.3…" : "O que vale lembrar desta disputa"} />
              {perdeu && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Categoria (opcional):</span>
                  {CATEGORIAS.map((c) => (
                    <Badge key={c.value} variant={categoria === c.value ? "default" : "outline"} className="cursor-pointer font-normal" onClick={() => setCategoria(categoria === c.value ? "" : c.value)}>{c.label}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:items-center">
          {erros.length > 0 && <span className="mr-auto text-xs text-red-600">{erros[0]}</span>}
          <Button variant="outline" onClick={() => { onCancel(); onOpenChange(false); }} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !carregado || erros.length > 0}>
            {salvando ? "Salvando…" : novoStatus ? "Salvar e mover o card" : "Salvar resultado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Resultado no card: colocação, arrematante, diferença e motivo, com botão para registrar/editar. */
export function LicitacaoResultadoResumo({ licitacaoId, status, titulo }: { licitacaoId: string; status?: string | null; titulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const { data: res } = useQuery({
    queryKey: ["licitacao-resultado-resumo", licitacaoId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("licitacao_resultados")
        .select("colocacao_gss, situacao_gss, valor_gss, motivo_texto, empresa_vencedora_nome, valor_homologado, classificacao_gss, fonte, registrado_por_nome, updated_at")
        .eq("licitacao_id", licitacaoId).maybeSingle();
      return data as any;
    },
  });
  const final = ["nao_ganhamos", "arrematados", "fracassado", "adjudicacao_homologacao", "proposta_final", "recurso_contrarrazao", "em_disputa"].includes(status ?? "");
  if (!res && !final) return null;
  const ganhou = res?.classificacao_gss === "primeiro_lugar";
  const col = ganhou ? "1º lugar" : res?.colocacao_gss ? `${res.colocacao_gss}º lugar` : res?.situacao_gss === "inabilitada" ? "Inabilitada" : res?.situacao_gss === "desclassificada" ? "Desclassificada" : null;
  const dif = res?.valor_gss && res?.valor_homologado && !ganhou ? res.valor_gss - res.valor_homologado : null;
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" />
        <span className="font-semibold uppercase tracking-wide text-primary">Resultado</span>
        {col && <Badge variant={ganhou ? "default" : "outline"} className="h-5 px-1.5 text-[10px]">GSS: {col}</Badge>}
        {res?.fonte === "ata_ia" && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">lido da ata</Badge>}
        <Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs" onClick={() => setAberto(true)}>{res ? "Editar resultado" : "Registrar resultado"}</Button>
      </div>
      {res && (
        <>
          {!ganhou && res.empresa_vencedora_nome && res.empresa_vencedora_nome !== "N/A" && (
            <p>Arrematante: <b>{res.empresa_vencedora_nome}</b> · {brl(res.valor_homologado)}{dif != null && <> · GSS {dif >= 0 ? "acima" : "abaixo"} em {brl(Math.abs(dif))} ({((Math.abs(dif) / res.valor_homologado) * 100).toFixed(1)}%)</>}</p>
          )}
          {res.motivo_texto && <p className="whitespace-pre-wrap text-muted-foreground">{res.motivo_texto}</p>}
        </>
      )}
      {!res && <p className="text-muted-foreground">Sem resultado registrado. Anexe a ata e a IA preenche o arrematante e quem ficou à frente da GSS.</p>}
      {aberto && (
        <LicitacaoResultadoDialog open onOpenChange={setAberto} licitacaoId={licitacaoId} novoStatus="" licitacaoTitulo={titulo}
          onConfirm={() => setAberto(false)} onCancel={() => setAberto(false)} />
      )}
    </div>
  );
}
