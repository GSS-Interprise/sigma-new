import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Clock, Send, Bot, Flame, ThermometerSun, CheckCircle, Search, Phone,
  MapPin, GripVertical, XCircle, Tag, X, UserCheck, MessageSquareOff, Target, MessageCircle,
} from "lucide-react";
import {
  useCampanhaLeadsByStatus,
  useAtualizarStatusLead,
  useClassificarSaidaCampanha,
  useUpdateLeadTags,
  type CampanhaLead,
  type MotivoSaidaCampanha,
  type StatusLeadCampanha,
} from "@/hooks/useCampanhaLeads";
import { supabase } from "@/integrations/supabase/client";
import { AcompanhamentoLeadPainel } from "@/components/campanhas/acompanhamento/AcompanhamentoLeadPainel";
import type { AcompanhamentoLead } from "@/hooks/useAcompanhamentoLeads";
import { usePermissions } from "@/hooks/usePermissions";
import { LeadTagCatalogDialog } from "./LeadTagCatalogDialog";
import { toast } from "sonner";

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
  { id: "sem_whatsapp", label: "Sem WhatsApp", color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: MessageSquareOff, description: "Buscar canal alternativo" },
  { id: "descartado", label: "Descartados", color: "text-slate-500", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: XCircle, description: "Sem sucesso / sem interesse" },
];

// Kanban MANUAL: a equipe conduz — sem "IA Conversando".
const COLUMNS_MANUAL: KanbanColumn[] = [
  { id: "frio", label: "Pendentes", color: "text-slate-600", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: Clock, description: "Aguardando 1º contato" },
  { id: "contatado", label: "Aguardando Resposta", color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", icon: Send, description: "1ª mensagem enviada" },
  { id: "em_conversa", label: "Respondeu", color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: MessageCircle, description: "Nova resposta — equipe deve atender" },
  { id: "quente", label: "Leads Quentes", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200", icon: Flame, description: "Pronto pra fechar" },
  { id: "convertido", label: "Convertidos", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200", icon: CheckCircle, description: "Negócio fechado" },
  { id: "sem_resposta", label: "Sem resposta", color: "text-slate-500", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: Phone, description: "Contatado, não respondeu" },
  { id: "sem_whatsapp", label: "Sem WhatsApp", color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: MessageSquareOff, description: "Buscar Instagram ou e-mail" },
  { id: "descartado", label: "Descartados", color: "text-slate-500", bgColor: "bg-slate-50", borderColor: "border-slate-200", icon: XCircle, description: "Sem sucesso / sem interesse" },
];

interface Props {
  campanhaId: string;
}

export function CampanhaProspeccaoKanban({ campanhaId }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroUf, setFiltroUf] = useState("__all");
  const [filtroEsp, setFiltroEsp] = useState("__all");
  const [filtroTag, setFiltroTag] = useState("__all");
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [campanhaLeadAbertoId, setCampanhaLeadAbertoId] = useState<string | null>(null);
  const [tagCatalogOpen, setTagCatalogOpen] = useState(false);
  const { isAdmin } = usePermissions();
  const [saidaPendente, setSaidaPendente] = useState<{
    leadId: string;
    motivo: MotivoSaidaCampanha;
  } | null>(null);

  const { data: leadAberto } = useQuery({
    queryKey: ["acompanhamento-lead-by-campanha-lead", campanhaLeadAbertoId],
    enabled: !!campanhaLeadAbertoId,
    queryFn: async (): Promise<AcompanhamentoLead | null> => {
      const { data } = await supabase
        .from("vw_acompanhamento_kanban_full" as never)
        .select("*")
        .eq("campanha_lead_id", campanhaLeadAbertoId)
        .maybeSingle();
      return (data as AcompanhamentoLead) ?? null;
    },
  });

  const { byStatus, leads, isLoading } = useCampanhaLeadsByStatus(campanhaId);
  const atualizarStatus = useAtualizarStatusLead();
  const classificarSaida = useClassificarSaidaCampanha();
  const updateTags = useUpdateLeadTags(campanhaId);

  const { data: campanhaConfig } = useQuery({
    queryKey: ["campanha-config-kanban", campanhaId],
    queryFn: async (): Promise<{ tipo_envio: string; whatsapp_provider: string }> => {
      const { data } = await supabase
        .from("campanhas")
        .select("tipo_envio, whatsapp_provider")
        .eq("id", campanhaId)
        .maybeSingle();
      return {
        tipo_envio: data?.tipo_envio || "ia",
        whatsapp_provider: data?.whatsapp_provider || "evolution",
      };
    },
    staleTime: 60_000,
  });
  const tipoEnvio = campanhaConfig?.tipo_envio;
  const whatsappProvider = campanhaConfig?.whatsapp_provider;
  const colunas = tipoEnvio === "manual" ? COLUMNS_MANUAL : COLUMNS;

  // mapa de quem assumiu → nome (colaboração multi-pessoa)
  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-map"],
    staleTime: 300_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data } = await supabase.from("profiles").select("id, nome_completo");
      const m: Record<string, string> = {};
      (data || []).forEach((profile) => { m[profile.id] = profile.nome_completo || ""; });
      return m;
    },
  });

  // opções de filtro derivadas dos leads da campanha
  const ufs = useMemo(() => [...new Set(leads.map((l) => l.lead?.uf).filter(Boolean) as string[])].sort(), [leads]);
  const especialidades = useMemo(() => [...new Set(leads.map((l) => l.lead?.especialidade).filter(Boolean) as string[])].sort(), [leads]);
  const { data: tagsSugeridas = [] } = useQuery({
    queryKey: ["lead-tag-catalog-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tag_catalog" as never)
        .select("label")
        .eq("active", true)
        .order("sort_order")
        .order("label");
      if (error) throw error;
      return (data ?? []).map((tag) => String((tag as { label: string }).label));
    },
    staleTime: 5 * 60_000,
  });

  const queryClient = useQueryClient();
  const criarTag = useMutation({
    mutationFn: async (label: string) => {
      const normalized = label.trim().replace(/\s+/g, " ");
      if (normalized.length < 2 || normalized.length > 60) {
        throw new Error("A tag precisa ter entre 2 e 60 caracteres.");
      }
      const { data, error } = await supabase.functions.invoke("create-lead-tag", {
        body: { label: normalized },
      });
      if (error) throw error;
      if (!data?.label) throw new Error(data?.error || "Não foi possível criar a tag.");
      return String(data.label);
    },
    onSuccess: (label) => {
      void queryClient.invalidateQueries({ queryKey: ["lead-tag-catalog-active"] });
      void queryClient.invalidateQueries({ queryKey: ["lead-tag-catalog-admin"] });
      toast.success(`Tag "${label}" criada.`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message.includes("duplicate") || message.includes("unique")
        ? "Essa tag já existe no catálogo."
        : message);
    },
  });

  const filteredByStatus = (status: StatusLeadCampanha) => {
    let arr = byStatus[status] || [];
    if (filtroUf !== "__all") arr = arr.filter((cl) => cl.lead?.uf === filtroUf);
    if (filtroEsp !== "__all") arr = arr.filter((cl) => cl.lead?.especialidade === filtroEsp);
    if (filtroTag !== "__all") arr = arr.filter((cl) => cl.lead?.tags?.includes(filtroTag));
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      arr = arr.filter(
        (cl) =>
          cl.lead?.nome?.toLowerCase().includes(term) ||
          cl.lead?.phone_e164?.includes(term) ||
          cl.lead?.cidade?.toLowerCase().includes(term)
      );
    }
    return [...arr].sort((a, b) => {
      const unreadDiff = Number(b.unread_messages > 0) - Number(a.unread_messages > 0);
      if (unreadDiff !== 0) return unreadDiff;
      const aTime = new Date(a.last_incoming_at || a.data_ultimo_contato || a.data_status || 0).getTime();
      const bTime = new Date(b.last_incoming_at || b.data_ultimo_contato || b.data_status || 0).getTime();
      return bTime - aTime;
    });
  };

  const totalFiltrado = colunas.reduce((s, c) => s + filteredByStatus(c.id).length, 0);
  const filtrando = filtroUf !== "__all" || filtroEsp !== "__all" || filtroTag !== "__all" || !!searchTerm.trim();

  const handleDrop = (targetStatus: StatusLeadCampanha) => {
    if (!draggedLead) return;
    const lead = leads.find((l) => l.lead_id === draggedLead);
    if (!lead || lead.status === targetStatus) { setDraggedLead(null); return; }
    if (targetStatus === "sem_whatsapp" || targetStatus === "descartado") {
      setSaidaPendente({
        leadId: draggedLead,
        motivo: targetStatus === "sem_whatsapp" ? "sem_whatsapp" : "sem_interesse_oportunidade",
      });
      setDraggedLead(null);
      return;
    }
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
          <Input placeholder="Buscar médico por nome, telefone ou cidade…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="min-h-11 pl-9" />
        </div>
        <Select value={filtroUf} onValueChange={setFiltroUf}>
          <SelectTrigger className="min-h-11 w-[130px]"><MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" /><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos os estados</SelectItem>
            {ufs.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
        {especialidades.length > 1 && (
          <Select value={filtroEsp} onValueChange={setFiltroEsp}>
            <SelectTrigger className="min-h-11 w-[190px]"><SelectValue placeholder="Especialidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas especialidades</SelectItem>
              {especialidades.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {tagsSugeridas.length > 0 && (
          <Select value={filtroTag} onValueChange={setFiltroTag}>
            <SelectTrigger className="min-h-11 w-full sm:w-[180px]">
              <Tag className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas as tags</SelectItem>
              {tagsSugeridas.map((tag) => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isAdmin && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setTagCatalogOpen(true)}
          >
            <Tag className="mr-2 h-4 w-4" />
            Catálogo de tags
          </Button>
        )}
        {filtrando && (
          <button className="min-h-11 text-xs text-muted-foreground hover:text-foreground underline" onClick={() => { setSearchTerm(""); setFiltroUf("__all"); setFiltroEsp("__all"); setFiltroTag("__all"); }}>limpar filtros</button>
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
                      whatsappProvider={whatsappProvider}
                      tagsSugeridas={tagsSugeridas}
                      onDragStart={() => setDraggedLead(cl.lead_id)}
                      onClick={() => setCampanhaLeadAbertoId(cl.id)}
                      onToggleTag={(tag) => {
                        const atuais = cl.lead?.tags || [];
                        const novas = atuais.includes(tag) ? atuais.filter((t) => t !== tag) : [...atuais, tag];
                        updateTags.mutate({ lead_id: cl.lead_id, tags: novas });
                      }}
                      onCreateTag={(label) => criarTag.mutateAsync(label)}
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
      <LeadTagCatalogDialog open={tagCatalogOpen} onOpenChange={setTagCatalogOpen} />
      <ClassificarSaidaDialog
        key={`${saidaPendente?.leadId || "closed"}:${saidaPendente?.motivo || ""}`}
        open={!!saidaPendente}
        motivoInicial={saidaPendente?.motivo || "sem_interesse_oportunidade"}
        isPending={classificarSaida.isPending}
        onClose={() => setSaidaPendente(null)}
        onConfirm={(motivo, observacao) => {
          if (!saidaPendente) return;
          classificarSaida.mutate({
            campanha_id: campanhaId,
            lead_id: saidaPendente.leadId,
            motivo,
            observacao,
          }, { onSuccess: () => setSaidaPendente(null) });
        }}
      />
    </div>
  );
}

const MOTIVOS_SAIDA: Array<{
  value: MotivoSaidaCampanha;
  label: string;
  scope: "global" | "campanha";
}> = [
  { value: "sem_whatsapp", label: "Sem WhatsApp", scope: "global" },
  { value: "aposentado", label: "Aposentado", scope: "global" },
  { value: "contato_invalido", label: "Contato inválido", scope: "global" },
  { value: "nao_contatar", label: "Não quer mais ser contatado", scope: "global" },
  { value: "distancia", label: "Distância ou região incompatível", scope: "campanha" },
  { value: "indisponivel_agora", label: "Indisponível nesta oportunidade", scope: "campanha" },
  { value: "sem_interesse_oportunidade", label: "Sem interesse nesta oportunidade", scope: "campanha" },
];

function ClassificarSaidaDialog({
  open,
  motivoInicial,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  motivoInicial: MotivoSaidaCampanha;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (motivo: MotivoSaidaCampanha, observacao: string) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoSaidaCampanha>(motivoInicial);
  const [observacao, setObservacao] = useState("");
  const meta = MOTIVOS_SAIDA.find((item) => item.value === motivo) || MOTIVOS_SAIDA[0];

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setMotivo(motivoInicial);
      setObservacao("");
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Classificar saída do médico</DialogTitle>
          <DialogDescription>
            O motivo define se a restrição vale apenas nesta oportunidade ou em todo o Sigma.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="motivo-saida">Motivo</Label>
            <Select value={motivo} onValueChange={(value) => setMotivo(value as MotivoSaidaCampanha)}>
              <SelectTrigger id="motivo-saida" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_SAIDA.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={`rounded-md border p-3 text-sm ${meta.scope === "global" ? "border-orange-200 bg-orange-50 text-orange-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
            {meta.scope === "global"
              ? "Efeito global: este médico não voltará automaticamente para outras campanhas."
              : "Efeito local: o médico sai apenas desta campanha e poderá receber outra oportunidade."}
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacao-saida">Observação</Label>
            <Textarea
              id="observacao-saida"
              rows={3}
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              placeholder="Contexto útil para a próxima pessoa que abrir o médico"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="min-h-11" onClick={onClose}>Cancelar</Button>
          <Button className="min-h-11" onClick={() => onConfirm(motivo, observacao)} disabled={isPending}>
            Confirmar classificação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function iniciais(nome?: string) {
  if (!nome) return "?";
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}

function janelaAtendimento(lastIncomingAt?: string | null) {
  if (!lastIncomingAt) return null;
  const limite = new Date(lastIncomingAt).getTime() + 24 * 60 * 60 * 1000;
  if (!Number.isFinite(limite)) return null;
  const restante = limite - Date.now();
  if (restante <= 0) {
    return { fechada: true, prioridade: false, texto: "Janela fechada · usar template" };
  }
  const horas = Math.floor(restante / (60 * 60 * 1000));
  const minutos = Math.floor((restante % (60 * 60 * 1000)) / (60 * 1000));
  const prazo = new Date(limite).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return {
    fechada: false,
    prioridade: restante <= 4 * 60 * 60 * 1000,
    texto: horas > 0 ? `Janela aberta · ${horas}h${minutos ? ` ${minutos}min` : ""}` : `Responder agora · até ${prazo}`,
  };
}

function LeadCard({
  campLead, assumidoNome, tipoEnvio, whatsappProvider, tagsSugeridas, onDragStart, onClick, onToggleTag, onCreateTag,
}: {
  campLead: CampanhaLead;
  assumidoNome?: string;
  tipoEnvio: string | undefined;
  whatsappProvider: string | undefined;
  tagsSugeridas: string[];
  onDragStart: () => void;
  onClick: () => void;
  onToggleTag: (tag: string) => void;
  onCreateTag: (label: string) => Promise<unknown>;
}) {
  const [novaTag, setNovaTag] = useState("");
  const [criandoTag, setCriandoTag] = useState(false);
  const lead = campLead.lead;
  if (!lead) return null;
  const tags = lead.tags || [];
  const atendimentoHumano = campLead.humano_assumiu === true;
  const campanhaManual = tipoEnvio === "manual";
  const janela = whatsappProvider === "twilio" ? janelaAtendimento(campLead.last_incoming_at) : null;

  return (
    <Card className="relative cursor-pointer transition-all hover:border-primary/50 hover:shadow-md" draggable onDragStart={onDragStart}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start gap-2" onClick={onClick}>
          <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{lead.nome}</p>
            {lead.especialidade && <p className="text-xs text-muted-foreground truncate">{lead.especialidade}</p>}
          </div>
          {/* quem está no lead (colaboração) */}
          {campLead.unread_messages > 0 && (
            <div
              className="flex h-6 min-w-6 shrink-0 items-center justify-center gap-1 rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white shadow-sm"
              aria-label={`${campLead.unread_messages} mensagem(ns) nova(s) do lead`}
              title={`${campLead.unread_messages} mensagem(ns) nova(s) do lead`}
            >
              <MessageCircle className="h-3 w-3" aria-hidden="true" />
              {campLead.unread_messages > 9 ? "9+" : campLead.unread_messages}
            </div>
          )}
          {janela && (
            <Badge
              variant="outline"
              className={`h-6 max-w-[145px] shrink-0 gap-1 truncate px-1.5 text-[10px] ${
                janela.fechada
                  ? "border-slate-200 bg-slate-50 text-slate-600"
                  : janela.prioridade
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
              title={janela.fechada
                ? "A janela de atendimento terminou. O próximo contato deve usar template aprovado."
                : "O lead respondeu recentemente e a equipe pode enviar texto livre dentro desta janela."}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              {janela.texto}
            </Badge>
          )}
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
          {campLead.strategy?.nome && (
            <Badge
              variant="outline"
              className="max-w-full gap-1 border-violet-200 bg-violet-50 text-[10px] text-violet-700"
              title={`Estratégia da campanha: ${campLead.strategy.nome}`}
            >
              <Target className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">Estratégia: {campLead.strategy.nome}</span>
            </Badge>
          )}
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px] gap-1 pr-1">
              {t}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleTag(t); }}
                className="inline-flex h-8 w-8 items-center justify-center hover:text-red-600"
                aria-label={`Remover tag ${t}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <button onClick={(e) => e.stopPropagation()} className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded px-2">
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
                      className={`min-h-11 text-[11px] rounded px-2 border ${on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                      {on && <span className="mr-0.5">✓</span>}{t}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1.5 border-t pt-2">
                <Input
                  value={novaTag}
                  onChange={(event) => setNovaTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || !novaTag.trim() || criandoTag) return;
                    event.preventDefault();
                    setCriandoTag(true);
                    void onCreateTag(novaTag).then((label) => {
                      onToggleTag(String(label));
                      setNovaTag("");
                    }).finally(() => setCriandoTag(false));
                  }}
                  placeholder="Nova tag"
                  className="h-9 min-w-0 text-xs"
                  maxLength={60}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 shrink-0"
                  disabled={!novaTag.trim() || criandoTag}
                  onClick={() => {
                    setCriandoTag(true);
                    void onCreateTag(novaTag).then((label) => {
                      onToggleTag(String(label));
                      setNovaTag("");
                    }).finally(() => setCriandoTag(false));
                  }}
                >
                  Criar
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                A nova tag fica disponível para toda a equipe.
              </p>
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
