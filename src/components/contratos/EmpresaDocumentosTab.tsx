import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Eye, FileUp, History, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AnexoViewerNavegavel, type AnexoNavegavel } from "@/components/licitacoes/AnexoViewerNavegavel";
import { VencimentosConfigDialog, seloValidade } from "./VencimentosConfigDialog";

/**
 * Certidões e documentos da empresa (T10 de docs/arquitetura/licitacoes-contratos-gss.md).
 * Bianca, reunião de 07/10: validade e alerta por e-mail, para a licitação e para a Maria Vitória.
 * Renovar = anexar a versão nova; a antiga fica no histórico e sai dos avisos. O robô
 * vencimentos-alertas avisa conforme a configuração do botão "Avisos".
 */
// Lista da Bianca (WhatsApp 14/10). O campo aceita tipo novo digitado (ex.: CRM da PJ em outra cidade),
// porque a equipe precisa cadastrar documentos que não estão aqui; os tipos já usados viram sugestão.
const TIPOS = [
  "CND Municipal", "CND Estadual", "CND Federal", "CND FGTS", "CND Falência e concordata", "CND Trabalhista",
  "CND Simplificada", "Alvará do Corpo de Bombeiros", "Alvará de funcionamento", "Alvará sanitário", "Contrato social",
  "Balanço patrimonial (2 últimos anos)", "CRM PJ", "Atestado de capacidade técnica", "Cartão CNPJ",
];
const BUCKET = "contratos-documentos";

type Doc = {
  id: string; tipo: string; nome: string | null; emissor: string | null; emissao: string | null; validade: string | null;
  arquivo_path: string | null; arquivo_nome: string | null; observacao: string | null; substituido_em: string | null; created_at: string;
};

export function EmpresaDocumentosTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ base?: Doc; renovar?: boolean } | null>(null);
  const [historico, setHistorico] = useState(false);
  const [avisos, setAvisos] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "atencao">("todos");
  const [ver, setVer] = useState<number | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["empresa-documentos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("empresa_documentos").select("*").order("validade", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });
  const vigentes = docs.filter((d) => !d.substituido_em);
  const antigos = docs.filter((d) => d.substituido_em);
  const contagem = useMemo(() => {
    const c = { vencidos: 0, vencendo: 0, validos: 0, sem: 0 };
    for (const d of vigentes) {
      const s = seloValidade(d.validade);
      if (s.resta == null) c.sem++; else if (s.resta < 0) c.vencidos++; else if (s.resta <= 30) c.vencendo++; else c.validos++;
    }
    return c;
  }, [vigentes]);
  const lista = (filtro === "atencao" ? vigentes.filter((d) => { const r = seloValidade(d.validade).resta; return r != null && r <= 30; }) : vigentes);
  const comArquivo = lista.filter((d) => d.arquivo_path);
  const anexos: AnexoNavegavel[] = comArquivo.map((d) => ({ id: d.id, arquivo_nome: d.arquivo_nome || d.tipo, arquivo_url: d.arquivo_path!, bucket: BUCKET }));

  const excluir = useMutation({
    mutationFn: async (d: Doc) => {
      const { error } = await (supabase as any).from("empresa_documentos").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Documento excluído"); qc.invalidateQueries({ queryKey: ["empresa-documentos"] }); },
    onError: (e: any) => toast.error(e?.message || "Não foi possível excluir"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">Documentos da empresa</h2>
          <p className="text-sm text-muted-foreground">Certidões e documentos da GSS com validade. O Sigma avisa antes de vencer.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAvisos(true)}><Bell className="h-4 w-4" /> Avisos</Button>
          <Button size="sm" className="gap-1.5" onClick={() => setForm({})}><Plus className="h-4 w-4" /> Documento</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "vencidos", r: "Vencidos", c: "text-red-600" }, { k: "vencendo", r: "Vencem em 30 dias", c: "text-amber-600" },
          { k: "validos", r: "Válidos", c: "text-green-700" }, { k: "sem", r: "Sem validade", c: "text-muted-foreground" },
        ].map((x) => (
          <Card key={x.k}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{x.r}</p><p className={cn("text-2xl font-semibold", x.c)}>{(contagem as any)[x.k]}</p></CardContent></Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Select value={filtro} onValueChange={(v) => setFiltro(v as any)}>
          <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os vigentes</SelectItem>
            <SelectItem value="atencao">Vencidos e vencendo</SelectItem>
          </SelectContent>
        </Select>
        {antigos.length > 0 && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setHistorico((v) => !v)}><History className="h-4 w-4" /> {historico ? "Esconder" : "Ver"} versões antigas ({antigos.length})</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
            : !lista.length ? <p className="p-6 text-center text-sm text-muted-foreground">{vigentes.length ? "Nada vencido ou vencendo." : "Nenhum documento cadastrado. Comece pelas certidões que a licitação pede em todo edital."}</p>
            : (
              <div className="divide-y">
                {lista.map((d) => <LinhaDoc key={d.id} d={d} onVer={() => { const i = comArquivo.findIndex((x) => x.id === d.id); if (i >= 0) setVer(i); }}
                  onEditar={() => setForm({ base: d })} onRenovar={() => setForm({ base: d, renovar: true })}
                  onExcluir={() => { if (window.confirm(`Excluir "${d.tipo}"? O histórico deste documento também some.`)) excluir.mutate(d); }} />)}
              </div>
            )}
        </CardContent>
      </Card>

      {historico && antigos.length > 0 && (
        <Card><CardContent className="divide-y p-0">
          {antigos.map((d) => <LinhaDoc key={d.id} d={d} antigo onVer={async () => {
            if (!d.arquivo_path) return;
            const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.arquivo_path, 600);
            if (data?.signedUrl) window.open(data.signedUrl, "_blank");
          }} />)}
        </CardContent></Card>
      )}

      {form && <DocForm base={form.base} renovar={!!form.renovar} tiposUsados={docs.map((d) => d.tipo)} onFechar={() => setForm(null)} />}
      {avisos && <VencimentosConfigDialog chave="empresa_documentos" titulo="documentos da empresa" onFechar={() => setAvisos(false)} />}
      <AnexoViewerNavegavel anexos={anexos} indice={ver ?? 0} onIndiceChange={setVer} open={ver !== null} onOpenChange={(o) => { if (!o) setVer(null); }} />
    </div>
  );
}

function LinhaDoc({ d, antigo, onVer, onEditar, onRenovar, onExcluir }: {
  d: Doc; antigo?: boolean; onVer: () => void; onEditar?: () => void; onRenovar?: () => void; onExcluir?: () => void;
}) {
  const s = seloValidade(d.validade);
  return (
    <div className={cn("flex flex-wrap items-center gap-3 p-3", antigo && "opacity-60")}>
      <div className="min-w-[220px] flex-1">
        <p className="font-medium">{d.tipo}{d.nome ? <span className="font-normal text-muted-foreground"> — {d.nome}</span> : null}</p>
        <p className="text-xs text-muted-foreground">
          {[d.emissor, d.emissao && `emitido em ${d.emissao.split("-").reverse().join("/")}`, antigo && d.substituido_em && `substituído em ${new Date(d.substituido_em).toLocaleDateString("pt-BR")}`].filter(Boolean).join(" · ") || "—"}
        </p>
        {d.observacao && <p className="text-xs text-muted-foreground">{d.observacao}</p>}
      </div>
      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", s.classe)}>{s.texto}</span>
      <div className="flex gap-1">
        {d.arquivo_path && <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver arquivo" onClick={onVer}><Eye className="h-4 w-4" /></Button>}
        {onRenovar && <Button variant="outline" size="sm" className="h-8 gap-1" title="Anexar a versão nova (a atual vai para o histórico)" onClick={onRenovar}><RefreshCw className="h-3.5 w-3.5" /> Renovar</Button>}
        {onEditar && <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={onEditar}><Pencil className="h-4 w-4" /></Button>}
        {onExcluir && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir" onClick={onExcluir}><Trash2 className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
}

function DocForm({ base, renovar, tiposUsados, onFechar }: { base?: Doc; renovar: boolean; tiposUsados: string[]; onFechar: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const editar = !!base && !renovar;
  const [tipo, setTipo] = useState(base?.tipo ?? "");
  const [nome, setNome] = useState(base?.nome ?? "");
  const [emissor, setEmissor] = useState(base?.emissor ?? "");
  const [emissao, setEmissao] = useState(editar ? base?.emissao ?? "" : "");
  const [validade, setValidade] = useState(editar ? base?.validade ?? "" : "");
  const [observacao, setObservacao] = useState(editar ? base?.observacao ?? "" : "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const salvar = async () => {
    if (!tipo.trim()) return toast.error("Escolha ou escreva o tipo");
    if (renovar && !arquivo && !validade) return toast.error("Na renovação, anexe o arquivo novo ou informe a nova validade");
    setSalvando(true);
    try {
      let arquivo_path = editar ? base?.arquivo_path ?? null : null;
      let arquivo_nome = editar ? base?.arquivo_nome ?? null : null;
      if (arquivo) {
        const limpo = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");
        arquivo_path = `empresa/${Date.now()}_${limpo}`;
        arquivo_nome = arquivo.name;
        const { error } = await supabase.storage.from(BUCKET).upload(arquivo_path, arquivo);
        if (error) throw error;
      }
      const linha = { tipo: tipo.trim(), nome: nome.trim() || null, emissor: emissor.trim() || null, emissao: emissao || null, validade: validade || null, observacao: observacao.trim() || null, arquivo_path, arquivo_nome };
      if (editar) {
        const { error } = await (supabase as any).from("empresa_documentos").update(linha).eq("id", base!.id);
        if (error) throw error;
      } else {
        const { data: novo, error } = await (supabase as any).from("empresa_documentos").insert({ ...linha, created_by: user?.id }).select("id").single();
        if (error) throw error;
        if (renovar && base) {
          const { error: e2 } = await (supabase as any).from("empresa_documentos").update({ substituido_em: new Date().toISOString(), substituido_por: novo.id }).eq("id", base.id);
          if (e2) throw e2;
        }
      }
      toast.success(renovar ? "Documento renovado; a versão anterior foi para o histórico" : editar ? "Documento atualizado" : "Documento cadastrado");
      qc.invalidateQueries({ queryKey: ["empresa-documentos"] });
      onFechar();
    } catch (e: any) {
      toast.error("Não salvou: " + (e?.message || e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{renovar ? `Renovar: ${base?.tipo}` : editar ? "Editar documento" : "Novo documento da empresa"}</DialogTitle>
          <DialogDescription>{renovar ? "Anexe a versão nova com a nova validade. A atual fica no histórico." : "Sem validade = documento que não vence (contrato social, atestado)."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Tipo</span>
            <Input list="tipos-documento-empresa" value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={renovar}
              placeholder="Escolha da lista ou escreva um tipo novo" className="h-9" />
            <datalist id="tipos-documento-empresa">
              {Array.from(new Set([...TIPOS, ...tiposUsados])).map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div className="col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Complemento (opcional)</span>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: matriz Florianópolis" className="h-9" />
          </div>
          <div className="col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Emissor</span>
            <Input value={emissor} onChange={(e) => setEmissor(e.target.value)} placeholder="Ex.: Receita Federal" className="h-9" />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Emissão</span>
            <Input type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Validade</span>
            <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="h-9" />
          </div>
          <div className="col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Arquivo{editar && base?.arquivo_nome ? ` (atual: ${base.arquivo_nome})` : ""}</span>
            <input ref={inputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => inputRef.current?.click()}>
              <FileUp className="h-4 w-4" /> {arquivo ? arquivo.name : editar ? "Trocar arquivo" : "Escolher arquivo"}
            </Button>
          </div>
          <div className="col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Observação</span>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
