import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock, Send, Bot, Flame, ThermometerSun, CheckCircle, Search, Phone,
  MapPin, GripVertical, XCircle, Tag, Plus, X, UserCheck,
} from "lucide-react";
import {
  useCampanhaLeadsByStatus,
  useAtualizarStatusLead,
  useUpdateLeadTags,
  type CampanhaLead,
  type StatusLeadCampanha,
} from "@/hooks/useCampanhaLeads";
import { supabase } from "@/integrations/supabase/client";
import { AcompanhamentoLeadPainel } from "@/components/campanhas/acompanhamento/AcompanhamentoLeadPainel";
import type { AcompanhamentoLead } from "@/hooks/useAcompanhamentoLeads";

interface KanbanColumn {
  id: StatusLeadCampanha;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ElementType;
  description: string;
}

const COLUMNS: KanbanColumn[] = [
  { id: "frio", label: "Pendentes", color: "text-slate-600", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: Clock, description: "Aguardando disparo" },
  { id: "contatado", label: "Aguardando Resposta", color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", icon: Send, description: "Mensagem enviada" },
  { id: "em_conversa", label: "IA Conversando", color: "text-cyan-600", bgColor: "bg-cyan-50", borderColor: "border-cyan-200", icon: Bot, description: "IA qualificando" },
  { id: "aquecido", label: "Aquecidos", color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200", icon: ThermometerSun, description: "Interesse detectado" },
  { id: "quente", label: "Leads Quentes", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200", icon: Flame, description: "Pronto pro operador" },
  { id: "convertido", label: "Convertidos", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200", icon: CheckCircle, description: "Negócio fechado" },
  { id: "sem_resposta", label: "Sem resposta", color: "text-slate-500", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: Phone, description: "Contatado, não respondeu" },
  { id: "descartado", label: "Descartados", color: "text-slate-500", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: XCircle, description: "Sem sucesso / sem interesse" },
];

// Kanban MANUAL: a equipe conduz — sem "IA Conversando".
const COLUMNS_MANUAL: KanbanColumn[] = [
  { id: "frio", label: "Pendentes", color: "text-slate-600", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: Clock, description: "Aguardando 1º contato" },
  { id: "contatado", label: "Aguardando Resposta", color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", icon: Send, description: "1ª mensagem enviada" },
  { id: "em_conversa", label: "Aquecido", color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200", icon: ThermometerSun, description: "Respondeu — em conversa" },
  { id: "quente", label: "Leads Quentes", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200", icon: Flame, description: "Pronto pra fechar" },
  { id: "convertido", label: "Convertidos", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200", icon: CheckCircle, description: "Negócio fechado" },
  { id: "sem_resposta", label: "Sem resposta", color: "text-slate-500", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: Phone, description: "Contatado, não respondeu" },
  { id: "descartado", label: "Descartados", color: "text-slate-500", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: XCircle, description: "Sem sucesso / sem interesse" },
];

const TAGS_PADRAO = ["Prioridade", "Retornar", "Sem interesse", "Já é cliente", "Indicação", "Aguardando doc"];

interface Props {
  campanhaId: string;
}

export function CampanhaProspeccaoKanban({ campanhaId }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroUf, setFiltroUf] = useState("__all");
  const [filtroEsp, setFiltroEsp] = useState("__all");
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [campanhaLeadAbertoId, setCampanhaLeadAbertoId] = useState<string | null>(null);

  const { data: leadAberto } = useQuery({
    queryKey: ["acompanhamento-lead-by-campanha-lead", campanhaLeadAbertoId],
    enabled: !!campanhaLeadAbertoId,
    queryFn: async (): Promise<AcompanhamentoLead | null> => {
      const { data } = await (supabase as any)
        .from("vw_acompanhamento_kanban_full")
        .select("*")
        .eq("campanha_lead_id", campanhaLeadAbertoId)
        .maybeSingle();
      return (data as AcompanhamentoLead) ?? null;
    },
  });

  const { byStatus, leads, isLoading } = useCampanhaLeadsByStatus(campanhaId);
  const atualizarStatus = useAtualizarStatusLead();
  const updateTags = useUpdateLeadTags(campanhaId);

  const { data: tipoEnvio } = useQuery({
    queryKey: ["campanha-tipo-envio", campanhaId],
    queryFn: async (): Promise<string> => {
      const { data } = await (supabase as any).from("campanhas").select("tipo_envio").eq("id", campanhaId).maybeSingle();
      return (data?.tipo_envio as string) || "ia";
    },
    staleTime: 60_000,
  });
  const colunas = tipoEnvio === "manual" ? COLUMNS_MANUAL : COLUMNS;

  // mapa de quem assumiu → nome (colaboração multi-pessoa)
  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-map"],
    staleTime: 300_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data } = await (supabase as any).from("profiles").select("id, nome_completo");
      const m: Record<string, string> = {};
      (data || []).forEach((p: any) => { m[p.id] = p.nome_completo || ""; });
      return m;
    },
  });

  // opções de filtro derivadas dos leads da campanha
  const ufs = useMemo(() => [...new Set(leads.map((l) => l.lead?.uf).filter(Boolean) as string[])].sort(), [leads]);
  const especialidades = useMemo(() => [...new Set(leads.map((l) => l.lead?.especialidade).filter(Boolean) as string[])].sort(), [leads]);
  // tags pra quick-select = padrão + as que já existem na campanha
  const tagsSugeridas = useMemo(() => {
    const existentes = new Set<string>();
    leads.forEach((l) => (l.lead?.tags || []).forEach((t) => existentes.add(t)));
    return [...new Set([...TAGS_PADRAO, ...existentes])];
  }, [leads]);

  const filteredByStatus = (status: StatusLeadCampanha) => {
    let arr = byStatus[status] || [];
    if (filtroUf !== "__all") arr = arr.filter((cl) => cl.lead?.uf === filtroUf);
    if (filtroEsp !== "__all") arr = arr.filter((cl) => cl.lead?.especialidade === filtroEsp);
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      arr = arr.filter(
        (cl) =>
          cl.lead?.nome?.toLowerCase().includes(term) ||
          cl.lead?.phone_e164?.includes(term) ||
          cl.lead?.cidade?.toLowerCase().includes(term)
      );
    }
    return arr;
  };

  const totalFiltrado = colunas.reduce((s, c) => s + filteredByStatus(c.id).length, 0);
  const filtrando = filtroUf !== "__all" || filtroEsp !== "__all" || !!searchTerm.trim();

  const handleDrop = (targetStatus: StatusLeadCampanha) => {
    if (!draggedLead) return;
    const lead = leads.find((l) => l.lead_id === draggedLead);
    if (!lead || lead.status === targetStatus) { setDraggedLead(null); return; }
    atualizarStatus.mutate({ campanha_id: campanhaId, lead_id: draggedLead, novo_status: targetStatus });
    setDraggedLead(null);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground">Carregando pipeline...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filtros: busca + UF + especialidade (operadoras se dividem por região/especialidade) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar médico por nome, telefone ou cidade…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroUf} onValueChange={setFiltroUf}>
          <SelectTrigger className="w-[130px]"><MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" /><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos os estados</SelectItem>
            {ufs.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
        {especialidades.length > 1 && (
          <Select value={filtroEsp} onValueChange={setFiltroEsp}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Especialidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas especialidades</SelectItem>
              {especialidades.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {filtrando && (
          <button className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => { setSearchTerm(""); setFiltroUf("__all"); setFiltroEsp("__all"); }}>limpar filtros</button>
        )}
        <Badge variant="outline" className="text-sm ml-auto">
          {filtrando ? `${totalFiltrado} de ${leads.length}` : `${leads.length}`} leads
        </Badge>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {colunas.map((col) => {
          const colLeads = filteredByStatus(col.id);
          const Icon = col.icon;
          return (
            <div key={col.id} className={`flex-shrink-0 w-[280px] rounded-lg border ${col.borderColor} ${col.bgColor}`}
              onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(col.id)}>
              <div className="p-3 border-b border-inherit">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${col.color}`} />
                    <span className={`font-semibold text-sm ${col.color}`}>{col.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs font-bold min-w-[24px] justify-center">{colLeads.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{col.description}</p>
              </div>
              <ScrollArea className="h-auto md:h-[calc(100dvh-360px)] p-2">
                <div className="space-y-2">
                  {colLeads.map((cl) => (
                    <LeadCard
                      key={cl.id}
                      campLead={cl}
                      assumidoNome={cl.assumido_por ? profilesMap[cl.assumido_por] : undefined}
                      tipoEnvio={tipoEnvio}
                      tagsSugeridas={tagsSugeridas}
                      onDragStart={() => setDraggedLead(cl.lead_id)}
                      onClick={() => setCampanhaLeadAbertoId(cl.id)}
                      onToggleTag={(tag) => {
                        const atuais = cl.lead?.tags || [];
                        const novas = atuais.includes(tag) ? atuais.filter((t) => t !== tag) : [...atuais, tag];
                        updateTags.mutate({ lead_id: cl.lead_id, tags: novas });
                      }}
                    />
                  ))}
                  {colLeads.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Nenhum lead</p>}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      <AcompanhamentoLeadPainel lead={leadAberto ?? null} onClose={() => setCampanhaLeadAbertoId(null)} />
    </div>
  );
}

function iniciais(nome?: string) {
  if (!nome) return "?";
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}

function LeadCard({
  campLead, assumidoNome, tipoEnvio, tagsSugeridas, onDragStart, onClick, onToggleTag,
}: {
  campLead: CampanhaLead;
  assumidoNome?: string;
  tipoEnvio: string | undefined;
  tagsSugeridas: string[];
  onDragStart: () => void;
  onClick: () => void;
  onToggleTag: (tag: string) => void;
}) {
  const lead = campLead.lead;
  const [novaTag, setNovaTag] = useState("");
  if (!lead) return null;
  const tags = lead.tags || [];
  const atendimentoHumano = campLead.humano_assumiu === true;
  const campanhaManual = tipoEnvio === "manual";

  return (
    <Card className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all" draggable onDragStart={onDragStart}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start gap-2" onClick={onClick}>
          <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{lead.nome}</p>
            {lead.especialidade && <p className="text-xs text-muted-foreground truncate">{lead.especialidade}</p>}
          </div>
          {/* quem está no lead (colaboração) */}
          {assumidoNome && (
            <span title={`Em atendimento: ${assumidoNome}`}
              className="shrink-0 h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">
              {iniciais(assumidoNome)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground pl-6" onClick={onClick}>
          {lead.phone_e164 && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone_e164.replace("+55", "")}</span>}
          {lead.uf && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.cidade ? `${lead.cidade}/${lead.uf}` : lead.uf}</span>}
        </div>

        <div className="pl-6">
          {atendimentoHumano ? (
            <Badge
              variant="outline"
              className="max-w-full gap-1 border-blue-200 bg-blue-50 text-blue-700"
              title={`IA pausada. Atendimento humano${assumidoNome ? ` por ${assumidoNome}` : ""}.`}
            >
              <UserCheck className="h-3 w-3 shrink-0" />
              <span className="truncate">Atendimento humano{assumidoNome ? ` · ${assumidoNome}` : ""}</span>
            </Badge>
          ) : campanhaManual ? (
            <Badge variant="outline" className="gap-1 border-slate-200 bg-slate-50 text-slate-600">
              <UserCheck className="h-3 w-3" /> Equipe conduz
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-cyan-200 bg-cyan-50 text-cyan-700"
              title="A IA está habilitada para responder este lead."
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" aria-hidden="true" />
              <Bot className="h-3 w-3" /> IA atuando
            </Badge>
          )}
        </div>

        {/* tags + editor rápido */}
        <div className="pl-6 flex flex-wrap items-center gap-1">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px] gap-1 pr-1">
              {t}
              <button onClick={(e) => { e.stopPropagation(); onToggleTag(t); }} className="hover:text-red-600"><X className="h-2.5 w-2.5" /></button>
            </Badge>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <button onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground border border-dashed rounded px-1.5 py-0.5">
                <Tag className="h-2.5 w-2.5" /> tag
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs font-medium mb-1.5">Tags rápidas</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {tagsSugeridas.map((t) => {
                  const on = tags.includes(t);
                  return (
                    <button key={t} onClick={() => onToggleTag(t)}
                      className={`text-[11px] rounded px-2 py-0.5 border ${on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                      {on && <span className="mr-0.5">✓</span>}{t}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1">
                <Input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="Nova tag…" className="h-7 text-xs"
                  onKeyDown={(e) => { if (e.key === "Enter" && novaTag.trim()) { onToggleTag(novaTag.trim()); setNovaTag(""); } }} />
                <button onClick={() => { if (novaTag.trim()) { onToggleTag(novaTag.trim()); setNovaTag(""); } }}
                  className="shrink-0 h-7 w-7 flex items-center justify-center rounded border hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {campLead.tentativas > 0 && (
          <div className="pl-6">
            <Badge variant="outline" className="text-xs">{campLead.tentativas} tentativa{campLead.tentativas > 1 ? "s" : ""}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
