import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Stethoscope, MapPin, Clock, Loader2, Search, ClipboardCheck, Sparkles, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const VEREDITOS = [
  { value: "apto", label: "Apto", icon: CheckCircle2, cls: "border-emerald-300 bg-emerald-50 text-emerald-700", btn: "data-[on=true]:bg-emerald-600 data-[on=true]:text-white" },
  { value: "apto_com_ressalva", label: "Ressalva", icon: AlertTriangle, cls: "border-amber-300 bg-amber-50 text-amber-700", btn: "data-[on=true]:bg-amber-500 data-[on=true]:text-white" },
  { value: "inapto", label: "Inapto", icon: XCircle, cls: "border-red-300 bg-red-50 text-red-700", btn: "data-[on=true]:bg-red-600 data-[on=true]:text-white" },
  { value: "precisa_mais_info", label: "Mais info", icon: HelpCircle, cls: "border-slate-300 bg-slate-50 text-slate-700", btn: "data-[on=true]:bg-slate-600 data-[on=true]:text-white" },
] as const;

type FilaItem = {
  campanha_lead_id: string;
  lead_id: string;
  lead_nome: string;
  especialidade: string | null;
  uf: string | null;
  cidade: string | null;
  campanha_nome: string | null;
  entrou_em: string | null;
  perfil_resumo: string | null;
  parecer_id: string | null;
  veredito: string | null;
  investigacao: string | null;
  ressalvas: string | null;
  parecer_em: string | null;
  parecer_por_nome: string | null;
  situacao: "a_fazer" | "feito";
};

export default function Parecer() {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<FilaItem | null>(null);

  const { data: fila = [], isLoading } = useQuery({
    queryKey: ["pareceres-fila"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pareceres_fila")
        .select("*")
        .order("entrou_em", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FilaItem[];
    },
  });

  const { data: metricas } = useQuery({
    queryKey: ["parecer-metricas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_parecer_metricas").select("*").maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return fila;
    return fila.filter((f) => f.lead_nome?.toLowerCase().includes(q) || (f.especialidade ?? "").toLowerCase().includes(q) || (f.campanha_nome ?? "").toLowerCase().includes(q));
  }, [fila, busca]);

  const aFazer = filtrada.filter((f) => f.situacao === "a_fazer");
  const feito = filtrada.filter((f) => f.situacao === "feito");

  return (
    <AppLayout
      headerActions={
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="h-6 w-6" /> Pareceres de médicos</h1>
          <p className="text-sm text-muted-foreground">Investigação e parecer assistencial — consolidado de todas as campanhas</p>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {/* Métricas */}
        {metricas && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Metric label="A fazer" value={metricas.pendentes} cls="text-amber-600" />
            <Metric label="Concluídos" value={metricas.concluidos} cls="text-emerald-600" />
            <Metric label="Apto" value={metricas.apto} cls="text-emerald-600" />
            <Metric label="Ressalva" value={metricas.ressalva} cls="text-amber-600" />
            <Metric label="Inapto" value={metricas.inapto} cls="text-red-600" />
            <Metric label="Tempo médio" value={metricas.horas_medias_ate_parecer != null ? `${metricas.horas_medias_ate_parecer}h` : "—"} cls="text-blue-600" />
          </div>
        )}

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar médico, especialidade ou campanha…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Coluna titulo="A fazer" cor="text-amber-600" count={aFazer.length}>
              {aFazer.length === 0 ? <Vazio texto="Nenhum médico aguardando parecer." /> : aFazer.map((f) => <ParecerCard key={f.campanha_lead_id} item={f} onClick={() => setSel(f)} />)}
            </Coluna>
            <Coluna titulo="Feito" cor="text-emerald-600" count={feito.length}>
              {feito.length === 0 ? <Vazio texto="Nenhum parecer dado ainda." /> : feito.map((f) => <ParecerCard key={f.campanha_lead_id} item={f} onClick={() => setSel(f)} />)}
            </Coluna>
          </div>
        )}
      </div>

      {sel && <ParecerDialog item={sel} onClose={() => setSel(null)} />}
    </AppLayout>
  );
}

function Metric({ label, value, cls }: { label: string; value: any; cls: string }) {
  return (
    <Card><CardContent className="p-3 text-center">
      <div className={`text-2xl font-bold ${cls}`}>{value ?? 0}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </CardContent></Card>
  );
}

function Coluna({ titulo, cor, count, children }: { titulo: string; cor: string; count: number; children: React.ReactNode }) {
  return (
    <div className="border rounded-md bg-muted/20">
      <div className="flex items-center justify-between p-2.5 border-b bg-card/50">
        <span className={`text-sm font-medium ${cor}`}>{titulo}</span>
        <Badge variant="outline" className="text-xs h-5">{count}</Badge>
      </div>
      <div className="p-2 space-y-2 min-h-[300px] max-h-[72vh] overflow-y-auto">{children}</div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-xs text-muted-foreground text-center py-8 italic">{texto}</p>;
}

function ParecerCard({ item, onClick }: { item: FilaItem; onClick: () => void }) {
  const ver = VEREDITOS.find((v) => v.value === item.veredito);
  const idade = item.entrou_em ? formatDistanceToNow(new Date(item.entrou_em), { addSuffix: false, locale: ptBR }) : null;
  return (
    <div onClick={onClick} className="bg-card border rounded-md p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{item.lead_nome}</p>
          {item.especialidade && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><Stethoscope className="h-3 w-3" />{item.especialidade}</p>}
        </div>
        {ver && <Badge variant="outline" className={`shrink-0 ${ver.cls}`}>{ver.label}</Badge>}
      </div>
      {(item.cidade || item.uf) && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" />{[item.cidade, item.uf].filter(Boolean).join("/")}</p>}
      {item.perfil_resumo && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 flex items-start gap-1">
          <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />{item.perfil_resumo}
        </p>
      )}
      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
        <span className="truncate">{item.campanha_nome}</span>
        {idade && <span className="flex items-center gap-1 shrink-0"><Clock className="h-3 w-3" />{idade}</span>}
      </div>
    </div>
  );
}

function ParecerDialog({ item, onClose }: { item: FilaItem; onClose: () => void }) {
  const qc = useQueryClient();
  const [veredito, setVeredito] = useState<string>(item.veredito ?? "");
  const [investigacao, setInvestigacao] = useState(item.investigacao ?? "");
  const [ressalvas, setRessalvas] = useState(item.ressalvas ?? "");

  const salvar = useMutation({
    mutationFn: async () => {
      if (!veredito) throw new Error("Escolha um veredito");
      const { data, error } = await supabase.rpc("prospeccao_salvar_parecer" as any, {
        p_campanha_lead_id: item.campanha_lead_id,
        p_veredito: veredito,
        p_investigacao: investigacao || null,
        p_ressalvas: ressalvas || null,
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || "Falha ao salvar");
    },
    onSuccess: () => {
      toast.success("Parecer salvo");
      qc.invalidateQueries({ queryKey: ["pareceres-fila"] });
      qc.invalidateQueries({ queryKey: ["parecer-metricas"] });
      onClose();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" /> {item.lead_nome}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {item.especialidade} {item.cidade || item.uf ? `· ${[item.cidade, item.uf].filter(Boolean).join("/")}` : ""} · {item.campanha_nome}
          </p>
        </DialogHeader>

        {item.perfil_resumo && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1"><Sparkles className="h-3.5 w-3.5" /> Perfil (IA)</div>
            {item.perfil_resumo}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Veredito</Label>
            <div className="grid grid-cols-4 gap-2">
              {VEREDITOS.map((v) => {
                const on = veredito === v.value;
                const Icon = v.icon;
                return (
                  <button
                    key={v.value}
                    type="button"
                    data-on={on}
                    onClick={() => setVeredito(v.value)}
                    className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors ${v.cls} ${v.btn} ${on ? "ring-2 ring-offset-1 ring-current" : "opacity-80 hover:opacity-100"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Investigação (o que descobriu / com quem falou)</Label>
            <Textarea value={investigacao} onChange={(e) => setInvestigacao(e.target.value)} rows={4} placeholder="Ex: Falei com colega do hospital X, boa reputação, sem pendências…" />
          </div>
          <div>
            <Label>Ressalvas (opcional)</Label>
            <Textarea value={ressalvas} onChange={(e) => setRessalvas(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar parecer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
