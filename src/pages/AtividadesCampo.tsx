import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  MapPin, Loader2, Plus, CalendarDays, Users, Building2, Handshake,
  Phone, Footprints, Megaphone, Target, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TIPOS = [
  { value: "visita", label: "Visita", icon: Footprints, cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { value: "reuniao", label: "Reunião", icon: Handshake, cls: "border-blue-300 bg-blue-50 text-blue-700" },
  { value: "call", label: "Call", icon: Phone, cls: "border-purple-300 bg-purple-50 text-purple-700" },
  { value: "evento", label: "Evento", icon: Megaphone, cls: "border-amber-300 bg-amber-50 text-amber-700" },
] as const;
const tipoMeta = (t: string) => TIPOS.find((x) => x.value === t) ?? TIPOS[0];

const STATUS = [
  { value: "realizada", label: "Realizada" },
  { value: "agendada", label: "Agendada" },
  { value: "cancelada", label: "Cancelada" },
];

type Atividade = {
  id: string; tipo: string; data_atividade: string; responsavel_id: string | null;
  responsavel_nome: string | null; local_nome: string; cliente_id: string | null;
  contato_nome: string | null; objetivo: string | null; resultado: string | null;
  proximo_passo: string | null; gerou_oportunidade: boolean; status: string;
};
type Resumo = {
  total: number;
  por_tipo: { tipo: string; n: number }[];
  por_pessoa: { pessoa: string; total: number; visitas: number; reunioes: number; calls: number; oportunidades: number }[];
};

function mesAtualISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

export default function AtividadesCampo() {
  const [novo, setNovo] = useState(false);
  const [mes, setMes] = useState(mesAtualISO()); // YYYY-MM
  const [fTipo, setFTipo] = useState<string>("todos");

  const mesDate = `${mes}-01`;

  const { data: atividades = [], isLoading } = useQuery({
    queryKey: ["atividades-campo", mes],
    queryFn: async () => {
      const ini = `${mes}-01`;
      const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1); // 1º dia do mês seguinte
      const fim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const { data, error } = await (supabase as any)
        .from("atividades_campo")
        .select("*")
        .gte("data_atividade", ini)
        .lt("data_atividade", fim)
        .order("data_atividade", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Atividade[];
    },
  });

  const { data: resumo } = useQuery({
    queryKey: ["atividades-campo-resumo", mes],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_atividades_campo_resumo", { p_mes: mesDate });
      if (error) throw error;
      return data as Resumo;
    },
  });

  const lista = useMemo(
    () => (fTipo === "todos" ? atividades : atividades.filter((a) => a.tipo === fTipo)),
    [atividades, fTipo],
  );

  return (
    <AppLayout
      headerActions={
        <div className="flex items-center justify-between w-full gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Footprints className="h-6 w-6" /> Atividades de Campo</h1>
            <p className="text-sm text-muted-foreground">Visitas e reuniões da equipe — fechamento do mês</p>
          </div>
          <Button onClick={() => setNovo(true)}><Plus className="h-4 w-4 mr-1" /> Nova atividade</Button>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {/* Filtro de mês + tipo */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Mês</Label>
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant={fTipo === "todos" ? "default" : "outline"} onClick={() => setFTipo("todos")}>Todos</Button>
            {TIPOS.map((t) => (
              <Button key={t.value} size="sm" variant={fTipo === t.value ? "default" : "outline"} onClick={() => setFTipo(t.value)}>{t.label}</Button>
            ))}
          </div>
        </div>

        {/* KPIs do mês */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPI icon={CalendarDays} label="No mês" value={resumo?.total ?? 0} color="#2563eb" />
          {TIPOS.map((t) => {
            const n = resumo?.por_tipo.find((x) => x.tipo === t.value)?.n ?? 0;
            return <KPI key={t.value} icon={t.icon} label={t.label} value={n} color="#16a34a" />;
          })}
        </div>

        {/* Fechamento por pessoa — "o que cada um fez" */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium"><Users className="h-4 w-4 text-muted-foreground" /> Fechamento do mês — por pessoa</div>
            {!resumo?.por_pessoa.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma atividade registrada neste mês.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-3 font-medium">Pessoa</th>
                      <th className="py-2 px-2 font-medium text-right">Visitas</th>
                      <th className="py-2 px-2 font-medium text-right">Reuniões</th>
                      <th className="py-2 px-2 font-medium text-right">Calls</th>
                      <th className="py-2 px-2 font-medium text-right">Oportunidades</th>
                      <th className="py-2 pl-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.por_pessoa.map((p) => (
                      <tr key={p.pessoa} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{p.pessoa}</td>
                        <td className="py-2 px-2 text-right">{p.visitas}</td>
                        <td className="py-2 px-2 text-right">{p.reunioes}</td>
                        <td className="py-2 px-2 text-right">{p.calls}</td>
                        <td className="py-2 px-2 text-right">{p.oportunidades > 0 ? <span className="text-emerald-600 font-medium">{p.oportunidades}</span> : "0"}</td>
                        <td className="py-2 pl-2 text-right"><Badge>{p.total}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lista de atividades */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : lista.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Footprints className="h-10 w-10 mx-auto mb-3 opacity-40" />
            Nenhuma atividade registrada. Clique em <b>Nova atividade</b> pra registrar uma visita ou reunião.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {lista.map((a) => <AtividadeCard key={a.id} a={a} />)}
          </div>
        )}
      </div>

      {novo && <NovaAtividadeDialog onClose={() => setNovo(false)} />}
    </AppLayout>
  );
}

function KPI({ icon: Icon, label, value, color }: any) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="p-2 rounded-lg" style={{ background: `${color}1a`, color }}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </CardContent></Card>
  );
}

function AtividadeCard({ a }: { a: Atividade }) {
  const qc = useQueryClient();
  const meta = tipoMeta(a.tipo);
  const Icon = meta.icon;
  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("atividades_campo").delete().eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atividade removida");
      qc.invalidateQueries({ queryKey: ["atividades-campo"] });
      qc.invalidateQueries({ queryKey: ["atividades-campo-resumo"] });
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className={`shrink-0 mt-0.5 p-2 rounded-lg border ${meta.cls}`}><Icon className="h-4 w-4" /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{a.local_nome}</span>
                <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                {a.gerou_oportunidade && <Badge className="bg-emerald-600">Oportunidade</Badge>}
                {a.status !== "realizada" && <Badge variant="secondary">{STATUS.find((s) => s.value === a.status)?.label}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{format(new Date(a.data_atividade + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>
                {a.responsavel_nome && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{a.responsavel_nome}</span>}
                {a.contato_nome && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{a.contato_nome}</span>}
              </p>
              {a.objetivo && <p className="text-sm mt-1"><span className="text-muted-foreground">Objetivo: </span>{a.objetivo}</p>}
              {a.resultado && <p className="text-sm mt-0.5"><span className="text-muted-foreground">Resultado: </span>{a.resultado}</p>}
              {a.proximo_passo && <p className="text-sm mt-0.5 flex items-center gap-1"><Target className="h-3 w-3 text-blue-500" /><span className="text-muted-foreground">Próximo passo: </span>{a.proximo_passo}</p>}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-red-600" onClick={() => excluir.mutate()} disabled={excluir.isPending}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NovaAtividadeDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tipo, setTipo] = useState("visita");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [responsavelId, setResponsavelId] = useState<string>(user?.id ?? "");
  const [localNome, setLocalNome] = useState("");
  const [clienteId, setClienteId] = useState<string>("");
  const [contato, setContato] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [resultado, setResultado] = useState("");
  const [proximo, setProximo] = useState("");
  const [oportunidade, setOportunidade] = useState(false);
  const [status, setStatus] = useState("realizada");

  const { data: pessoas = [] } = useQuery({
    queryKey: ["profiles-ativos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("profiles").select("id, nome_completo").order("nome_completo");
      if (error) throw error;
      return (data ?? []) as { id: string; nome_completo: string | null }[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-min"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("clientes").select("id, nome_empresa").order("nome_empresa").limit(1000);
      if (error) throw error;
      return (data ?? []) as { id: string; nome_empresa: string | null }[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!localNome.trim()) throw new Error("Informe o local visitado");
      const nome = pessoas.find((p) => p.id === responsavelId)?.nome_completo ?? null;
      const { error } = await (supabase as any).from("atividades_campo").insert({
        tipo, data_atividade: data,
        responsavel_id: responsavelId || null, responsavel_nome: nome,
        local_nome: localNome.trim(), cliente_id: clienteId || null,
        contato_nome: contato || null, objetivo: objetivo || null,
        resultado: resultado || null, proximo_passo: proximo || null,
        gerou_oportunidade: oportunidade, status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atividade registrada");
      qc.invalidateQueries({ queryKey: ["atividades-campo"] });
      qc.invalidateQueries({ queryKey: ["atividades-campo-resumo"] });
      onClose();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Footprints className="h-5 w-5" /> Nova atividade de campo</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Responsável</Label>
            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger><SelectValue placeholder="Quem fez" /></SelectTrigger>
              <SelectContent>{pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_completo || p.id.slice(0, 8)}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block">Local visitado *</Label>
            <Input value={localNome} onChange={(e) => setLocalNome(e.target.value)} placeholder="Ex: Hospital Santa Catarina, Joinville" />
          </div>

          <div>
            <Label className="mb-1.5 block">Cliente vinculado (opcional)</Label>
            <Select value={clienteId || "nenhum"} onValueChange={(v) => setClienteId(v === "nenhum" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhum / prospect" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum / prospect</SelectItem>
                {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_empresa || c.id.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block">Com quem falou (contato)</Label>
            <Input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Ex: Dr. Maikon, diretor clínico" />
          </div>

          <div>
            <Label className="mb-1.5 block">Objetivo</Label>
            <Textarea value={objetivo} onChange={(e) => setObjetivo(e.target.value)} rows={2} placeholder="Por que foi até lá" />
          </div>
          <div>
            <Label className="mb-1.5 block">Resultado</Label>
            <Textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={2} placeholder="O que saiu da visita" />
          </div>
          <div>
            <Label className="mb-1.5 block">Próximo passo</Label>
            <Input value={proximo} onChange={(e) => setProximo(e.target.value)} placeholder="Ex: enviar proposta até sexta" />
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
              <Checkbox checked={oportunidade} onCheckedChange={(v) => setOportunidade(!!v)} />
              Gerou oportunidade
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
