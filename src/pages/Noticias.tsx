import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { toast } from "sonner";
import { Plus, Search, Building2, AlertTriangle, ExternalLink, Newspaper, Loader2, Sparkles } from "lucide-react";

const TIPOS = [
  { value: "calote", label: "Calote / não paga" },
  { value: "atraso_pagamento", label: "Atraso de pagamento" },
  { value: "processo_trabalhista", label: "Processo trabalhista" },
  { value: "ma_reputacao", label: "Má reputação" },
  { value: "outro", label: "Outro" },
];

const GRAVIDADE = {
  1: { label: "Baixa", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  2: { label: "Média", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  3: { label: "Alta", cls: "bg-red-100 text-red-700 border-red-300" },
} as const;

type Hospital = {
  id: string;
  nome: string;
  cnpj: string | null;
  uf: string | null;
  cidade: string | null;
  regiao: string | null;
  tipo_local: string | null;
  observacoes: string | null;
  hospital_noticias: { id: string; gravidade: number }[];
  hospital_especialidades: { especialidade_id: string }[];
};

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export default function Noticias() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [novaNoticiaOpen, setNovaNoticiaOpen] = useState(false);
  const [novoHospitalOpen, setNovoHospitalOpen] = useState(false);
  const [hospitalSel, setHospitalSel] = useState<Hospital | null>(null);

  const { data: hospitais = [], isLoading } = useQuery({
    queryKey: ["hospitais"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hospitais")
        .select("*, hospital_noticias(id,gravidade), hospital_especialidades(especialidade_id)")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Hospital[];
    },
  });

  const { data: especialidades = [] } = useQuery({
    queryKey: ["especialidades-opts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("especialidades").select("id,nome").order("nome");
      if (error) throw error;
      return (data ?? []).map((e: any) => ({ value: e.id, label: e.nome }));
    },
    staleTime: 10 * 60_000,
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return hospitais;
    return hospitais.filter(
      (h) =>
        h.nome.toLowerCase().includes(q) ||
        (h.cidade ?? "").toLowerCase().includes(q) ||
        (h.regiao ?? "").toLowerCase().includes(q)
    );
  }, [hospitais, busca]);

  const refetchHospitais = () => qc.invalidateQueries({ queryKey: ["hospitais"] });

  return (
    <AppLayout
      headerActions={
        <div className="flex items-center justify-between w-full gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Newspaper className="h-6 w-6" /> Banco de Notícias
            </h1>
            <p className="text-sm text-muted-foreground">Hospitais com calote ou má reputação — argumento pra abordagem dos médicos</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setNovoHospitalOpen(true)}>
              <Building2 className="h-4 w-4 mr-2" /> Novo hospital
            </Button>
            <Button onClick={() => setNovaNoticiaOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nova notícia
            </Button>
          </div>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar hospital, cidade ou região…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 opacity-40" />
            <p>{busca ? "Nenhum hospital encontrado." : "Nenhum hospital cadastrado ainda. Clique em 'Nova notícia' pra começar."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtrados.map((h) => {
              const nNoticias = h.hospital_noticias?.length ?? 0;
              const maxGrav = h.hospital_noticias?.reduce((m, n) => Math.max(m, n.gravidade), 0) ?? 0;
              const grav = GRAVIDADE[maxGrav as 1 | 2 | 3];
              return (
                <Card key={h.id} className="cursor-pointer transition-all hover:shadow-md hover:border-primary/40" onClick={() => setHospitalSel(h)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{h.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[h.cidade, h.uf].filter(Boolean).join("/") || h.regiao || h.tipo_local || "—"}
                        </p>
                      </div>
                      {maxGrav > 0 && grav && (
                        <Badge variant="outline" className={grav.cls}>
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {grav.label}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {nNoticias === 0 ? "Sem notícias" : `${nNoticias} notícia${nNoticias > 1 ? "s" : ""}`}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <NoticiaDialog
        open={novaNoticiaOpen}
        onOpenChange={setNovaNoticiaOpen}
        hospitais={hospitais}
        onSaved={refetchHospitais}
      />
      <NovoHospitalDialog
        open={novoHospitalOpen}
        onOpenChange={setNovoHospitalOpen}
        especialidades={especialidades}
        onSaved={refetchHospitais}
      />

      {hospitalSel && (
        <HospitalDetalheDialog
          hospital={hospitalSel}
          hospitais={hospitais}
          onClose={() => setHospitalSel(null)}
          onChanged={refetchHospitais}
        />
      )}
    </AppLayout>
  );
}

// ─── Nova notícia (com IA por link + hospital existente ou novo) ───
function NoticiaDialog({
  open,
  onOpenChange,
  hospitais,
  fixedHospitalId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hospitais: Hospital[];
  fixedHospitalId?: string;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [hospMode, setHospMode] = useState<"existing" | "new">("existing");
  const [hospitalId, setHospitalId] = useState(fixedHospitalId ?? "");
  const [novoHosp, setNovoHosp] = useState({ nome: "", uf: "", cidade: "" });
  const [form, setForm] = useState({ tipo: "calote", titulo: "", resumo: "", data_fato: "", gravidade: "2" });
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setUrl(""); setHospMode("existing"); setHospitalId(fixedHospitalId ?? "");
    setNovoHosp({ nome: "", uf: "", cidade: "" });
    setForm({ tipo: "calote", titulo: "", resumo: "", data_fato: "", gravidade: "2" });
    setFile(null);
  };

  const preencherIA = async () => {
    if (!url.trim()) { toast.warning("Cole o link primeiro"); return; }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("noticia-extrair-link", { body: { url } });
      if (error) throw error;
      if (!data?.ok) { toast.warning(data?.message || "Não consegui ler o link — preencha manualmente."); return; }
      const d = data.dados || {};
      setForm((f) => ({
        ...f,
        tipo: d.tipo || f.tipo,
        titulo: d.titulo || f.titulo,
        resumo: d.resumo || f.resumo,
        data_fato: d.data_fato || f.data_fato,
        gravidade: d.gravidade ? String(d.gravidade) : f.gravidade,
      }));
      if (!fixedHospitalId && d.hospital_nome) {
        const alvo = String(d.hospital_nome).toLowerCase();
        const match = hospitais.find((h) => h.nome.toLowerCase().includes(alvo) || alvo.includes(h.nome.toLowerCase()));
        if (match) { setHospMode("existing"); setHospitalId(match.id); }
        else { setHospMode("new"); setNovoHosp({ nome: d.hospital_nome, uf: d.uf || "", cidade: d.cidade || "" }); }
      }
      toast.success("Preenchido pela IA — revise antes de salvar");
    } catch (e: any) {
      toast.error("Erro IA: " + (e?.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim()) throw new Error("Título é obrigatório");
      const criado_por = await currentUserId();

      // Resolve hospital
      let hid = hospitalId;
      if (!fixedHospitalId && hospMode === "new") {
        if (!novoHosp.nome.trim()) throw new Error("Nome do hospital é obrigatório");
        const { data, error } = await (supabase as any)
          .from("hospitais")
          .insert({ nome: novoHosp.nome, uf: novoHosp.uf || null, cidade: novoHosp.cidade || null, criado_por })
          .select("id")
          .single();
        if (error) throw error;
        hid = data.id;
      }
      if (!hid) throw new Error("Selecione um hospital ou cadastre um novo");

      // Upload print
      let fonte_print: string | null = null;
      if (file) {
        const path = `${hid}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("hospital-noticias").upload(path, file);
        if (upErr) throw upErr;
        fonte_print = path;
      }

      const { error } = await (supabase as any).from("hospital_noticias").insert({
        hospital_id: hid,
        tipo: form.tipo,
        titulo: form.titulo,
        resumo: form.resumo || null,
        fonte_url: url || null,
        fonte_print,
        data_fato: form.data_fato || null,
        gravidade: Number(form.gravidade),
        criado_por,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notícia cadastrada");
      reset();
      onOpenChange(false);
      onSaved();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova notícia / ocorrência</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Link + IA */}
          <div>
            <Label>Link da notícia (opcional)</Label>
            <div className="flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (portal, Instagram)" />
              <Button type="button" variant="secondary" onClick={preencherIA} disabled={aiLoading} className="shrink-0">
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-1.5 hidden sm:inline">Preencher com IA</span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">A IA lê o link e preenche os campos. Instagram às vezes exige preencher manual.</p>
          </div>

          {/* Hospital */}
          {!fixedHospitalId && (
            <div>
              <Label>Hospital</Label>
              <div className="flex gap-2 mb-2">
                <Button type="button" size="sm" variant={hospMode === "existing" ? "default" : "outline"} onClick={() => setHospMode("existing")}>Existente</Button>
                <Button type="button" size="sm" variant={hospMode === "new" ? "default" : "outline"} onClick={() => setHospMode("new")}>Novo</Button>
              </div>
              {hospMode === "existing" ? (
                <Select value={hospitalId} onValueChange={setHospitalId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o hospital" /></SelectTrigger>
                  <SelectContent>
                    {hospitais.map((h) => (
                      <SelectItem key={h.id} value={h.id}>{h.nome}{h.uf ? ` (${h.uf})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  <Input className="col-span-2" placeholder="Nome do hospital" value={novoHosp.nome} onChange={(e) => setNovoHosp({ ...novoHosp, nome: e.target.value })} />
                  <Input placeholder="Cidade" value={novoHosp.cidade} onChange={(e) => setNovoHosp({ ...novoHosp, cidade: e.target.value })} />
                  <Input placeholder="UF" maxLength={2} value={novoHosp.uf} onChange={(e) => setNovoHosp({ ...novoHosp, uf: e.target.value.toUpperCase() })} />
                </div>
              )}
            </div>
          )}

          {/* Campos da notícia */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gravidade</Label>
              <Select value={form.gravidade} onValueChange={(v) => setForm({ ...form, gravidade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Baixa</SelectItem>
                  <SelectItem value="2">Média</SelectItem>
                  <SelectItem value="3">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Título *</Label><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Atraso de 3 meses no pagamento dos plantonistas" /></div>
          <div><Label>Resumo</Label><Textarea value={form.resumo} onChange={(e) => setForm({ ...form, resumo: e.target.value })} rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data do fato</Label><Input type="date" value={form.data_fato} onChange={(e) => setForm({ ...form, data_fato: e.target.value })} /></div>
            <div><Label>Print (imagem)</Label><Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar notícia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovoHospitalDialog({
  open,
  onOpenChange,
  especialidades,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  especialidades: { value: string; label: string }[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ nome: "", cnpj: "", uf: "", cidade: "", regiao: "", tipo_local: "", observacoes: "" });
  const [esp, setEsp] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Nome é obrigatório");
      const criado_por = await currentUserId();
      const { data, error } = await (supabase as any)
        .from("hospitais")
        .insert({ ...form, cnpj: form.cnpj || null, uf: form.uf || null, cidade: form.cidade || null, regiao: form.regiao || null, tipo_local: form.tipo_local || null, observacoes: form.observacoes || null, criado_por })
        .select("id")
        .single();
      if (error) throw error;
      if (esp.length) {
        const rows = esp.map((especialidade_id) => ({ hospital_id: data.id, especialidade_id }));
        const { error: e2 } = await (supabase as any).from("hospital_especialidades").insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("Hospital cadastrado");
      setForm({ nome: "", cnpj: "", uf: "", cidade: "", regiao: "", tipo_local: "", observacoes: "" });
      setEsp([]);
      onOpenChange(false);
      onSaved();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Cadastrar hospital</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Hospital Municipal de X" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
            <div><Label>UF</Label><Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Região</Label><Input value={form.regiao} onChange={(e) => setForm({ ...form, regiao: e.target.value })} placeholder="Ex: Vale do Itajaí" /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo_local} onValueChange={(v) => setForm({ ...form, tipo_local: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {["hospital", "UPA", "clínica", "município", "outro"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
          <div>
            <Label>Especialidades</Label>
            <SearchableMultiSelect options={especialidades} values={esp} onChange={setEsp} placeholder="Selecionar especialidades…" />
          </div>
          <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HospitalDetalheDialog({ hospital, hospitais, onClose, onChanged }: { hospital: Hospital; hospitais: Hospital[]; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const [novaOpen, setNovaOpen] = useState(false);

  const { data: noticias = [], isLoading } = useQuery({
    queryKey: ["hospital-noticias", hospital.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hospital_noticias")
        .select("*")
        .eq("hospital_id", hospital.id)
        .order("data_fato", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["hospital-noticias", hospital.id] });
    onChanged();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> {hospital.nome}</DialogTitle>
          <p className="text-sm text-muted-foreground">{[hospital.cidade, hospital.uf].filter(Boolean).join("/")} {hospital.regiao ? `· ${hospital.regiao}` : ""}</p>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setNovaOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova notícia</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : noticias.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notícia ainda. Adicione a primeira.</p>
        ) : (
          <div className="space-y-3">
            {noticias.map((n) => {
              const grav = GRAVIDADE[n.gravidade as 1 | 2 | 3];
              const tipo = TIPOS.find((t) => t.value === n.tipo)?.label ?? n.tipo;
              return (
                <div key={n.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{n.titulo}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="secondary">{tipo}</Badge>
                        {grav && <Badge variant="outline" className={grav.cls}>{grav.label}</Badge>}
                        {n.data_fato && <span className="text-xs text-muted-foreground">{new Date(n.data_fato).toLocaleDateString("pt-BR")}</span>}
                      </div>
                    </div>
                  </div>
                  {n.resumo && <p className="text-sm text-muted-foreground mt-2">{n.resumo}</p>}
                  <div className="flex flex-wrap gap-3 mt-2">
                    {n.fonte_url && (
                      <a href={n.fonte_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Fonte
                      </a>
                    )}
                    {n.fonte_print && (
                      <a href={supabase.storage.from("hospital-noticias").getPublicUrl(n.fonte_print).data.publicUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Print
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <NoticiaDialog open={novaOpen} onOpenChange={setNovaOpen} hospitais={hospitais} fixedHospitalId={hospital.id} onSaved={refresh} />
      </DialogContent>
    </Dialog>
  );
}
