import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ClipboardList,
  MessageSquare,
  History,
  ClipboardCheck,
  UserPlus,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Bot,
  User as UserIcon,
  Phone,
  MapPin,
  Stethoscope,
  Flame,
  StickyNote,
  Mail,
  Pencil,
  Target,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeadPerfilIaSection } from "@/components/medicos/LeadPerfilIaSection";
import { LeadTimelineUnificadoSection } from "@/components/medicos/LeadTimelineUnificadoSection";
import { ValidacaoChecklist } from "./ValidacaoChecklist";
import { MarcarPerdidoDialog } from "./MarcarPerdidoDialog";
import { LeadCampanhaTasks } from "./LeadCampanhaTasks";
import { LeadConversaUnificada } from "./LeadConversaUnificada";
import { LeadIdentidadeCard } from "./LeadIdentidadeCard";
import { LeadNotasRapidas } from "./LeadNotasRapidas";
import { LeadEmailDialog } from "./LeadEmailDialog";
import { LeadQuickEditDialog } from "./LeadQuickEditDialog";
import {
  useAssumirLead,
  useAprovarLead,
  useMoverEtapa,
  type AcompanhamentoLead,
  labelEtapa,
} from "@/hooks/useAcompanhamentoLeads";

interface Props {
  lead: AcompanhamentoLead | null;
  onClose: () => void;
}

type PainelTab = "conversa" | "historico" | "validacao" | "tasks" | "notas";

export function AcompanhamentoLeadPainel({ lead, onClose }: Props) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  // Mobile: 4 tabs (Validacao/Tasks/Conversa/Historico)
  // Desktop: master-detail — coluna E tem 3 tabs (Tasks/Validacao/Historico),
  // coluna D mostra Conversa sempre. F2.4 master-detail real.
  const [tab, setTab] = useState<PainelTab>("tasks");
  const [perdidoDialogOpen, setPerdidoDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const queryClient = useQueryClient();
  const assumir = useAssumirLead();
  const aprovar = useAprovarLead();
  const mover = useMoverEtapa();

  useEffect(() => {
    // No desktop a conversa fica sempre visível; no mobile só consideramos lida
    // quando a operadora realmente abre a aba Conversa.
    if (!lead?.lead_id || lead.unread_messages <= 0 || (isMobile && tab !== "conversa")) return;
    let active = true;
    const marcarComoLida = async () => {
      const { error } = await supabase
        .from("sigzap_conversations")
        .update({ unread_count: 0 })
        .eq("lead_id", lead.lead_id)
        .gt("unread_count", 0);
      if (!error && active) {
        // Reflete a leitura imediatamente no card aberto e no Kanban. Antes só
        // outro cache era invalidado, por isso a bolinha sumia apenas no refresh.
        queryClient.setQueryData(
          ["acompanhamento-lead-by-campanha-lead", lead.campanha_lead_id],
          (current: typeof lead | null | undefined) => current
            ? { ...current, unread_messages: 0 }
            : current,
        );
        queryClient.setQueryData(
          ["campanha-leads", lead.campanha_id],
          (current: Array<{ lead_id: string; unread_messages: number }> | undefined) =>
            current?.map((item) => item.lead_id === lead.lead_id
              ? { ...item, unread_messages: 0 }
              : item),
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["acompanhamento-leads"] }),
          queryClient.invalidateQueries({ queryKey: ["campanha-leads", lead.campanha_id] }),
          queryClient.invalidateQueries({
            queryKey: ["acompanhamento-lead-by-campanha-lead", lead.campanha_lead_id],
          }),
        ]);
      }
    };
    void marcarComoLida();
    return () => {
      active = false;
    };
  }, [
    isMobile,
    lead?.campanha_id,
    lead?.campanha_lead_id,
    lead?.lead_id,
    lead?.unread_messages,
    queryClient,
    tab,
  ]);

  // Histórico da conversa atual (campanha_leads.historico_conversa)
  const { data: historicoConversa = [] } = useQuery({
    queryKey: ["campanha-lead-historico-conversa", lead?.campanha_lead_id],
    enabled: !!lead?.campanha_lead_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("campanha_leads")
        .select("historico_conversa")
        .eq("id", lead!.campanha_lead_id)
        .maybeSingle();
      return (data?.historico_conversa || []) as Array<{ role: string; text: string; ts: string }>;
    },
  });

  // Profiles map pro audit do checklist (nome de quem validou)
  const { data: profilesMap = new Map() } = useQuery({
    queryKey: ["acompanhamento-profiles-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome_completo");
      const m = new Map<string, string>();
      (data || []).forEach((profile) => m.set(profile.id, profile.nome_completo));
      return m;
    },
    staleTime: 5 * 60_000,
  });

  if (!lead) return null;

  const semDono = !lead.assumido_por;
  const sou_eu = lead.assumido_por === user?.id;
  const validacoesOk = lead.validacoes_ok || 0;
  const podeAprovar = validacoesOk === 4;
  const ehTerminal = lead.etapa_acompanhamento === "perdido" || lead.etapa_acompanhamento === "na_escala";

  const iniciaisDono = lead.assumido_por_nome
    ? lead.assumido_por_nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "";
  const iniciaisLead = (lead.lead_nome || "?")
    .split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const quente = lead.etapa_acompanhamento === "quente";
  const ultimoContatoLabel = lead.data_ultimo_contato
    ? formatDistanceToNow(new Date(lead.data_ultimo_contato), { locale: ptBR, addSuffix: true })
    : null;

  return (
    <>
      <Sheet open={!!lead} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl md:max-w-5xl lg:max-w-6xl p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-4 border-b">
            <div className="flex items-start gap-3">
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                  {iniciaisLead}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg flex items-center gap-2 flex-wrap">
                  <span className="truncate">{lead.lead_nome}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs shrink-0",
                      quente && "border-red-300 bg-red-50 text-red-700"
                    )}
                  >
                    {quente && <Flame className="h-3 w-3 mr-1" />}
                    {labelEtapa(lead.etapa_acompanhamento)}
                  </Badge>
                </SheetTitle>
                <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {lead.lead_especialidade && (
                    <span className="flex items-center gap-1">
                      <Stethoscope className="h-3.5 w-3.5" />
                      {lead.lead_especialidade}
                    </span>
                  )}
                  {(lead.lead_cidade || lead.lead_uf) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {[lead.lead_cidade, lead.lead_uf].filter(Boolean).join("/")}
                    </span>
                  )}
                  {lead.lead_phone && (
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="h-3.5 w-3.5" />
                      {lead.lead_phone}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {lead.campanha_nome}
                  </span>
                  {ultimoContatoLabel && <span>· último contato {ultimoContatoLabel}</span>}
                </div>
                {lead.strategy_name && (
                  <Badge
                    variant="outline"
                    className="mt-2 max-w-full gap-1 border-violet-200 bg-violet-50 text-violet-700"
                    title={`Estratégia da campanha: ${lead.strategy_name}`}
                  >
                    <Target className="h-3 w-3 shrink-0" />
                    <span className="truncate">Estratégia: {lead.strategy_name}</span>
                  </Badge>
                )}
              </div>
              {!semDono && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px] bg-primary/10">{iniciaisDono}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">{lead.assumido_por_nome || "—"}</span>
                </div>
              )}
            </div>

            {/* F2.9 — Contexto 360º (badges de sinais relevantes do lead) */}
            <LeadIdentidadeCard leadId={lead.lead_id} />
          </SheetHeader>

          {/* MOBILE (< md): 4 tabs como antes */}
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as PainelTab)}
            className="flex-1 flex flex-col overflow-hidden md:hidden"
          >
            <div className="mx-4 mt-3 flex-shrink-0 overflow-x-auto pb-1">
            <TabsList className="h-auto w-max min-w-full justify-start">
              <TabsTrigger value="validacao" className="min-h-11 gap-1.5 text-xs">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Validação
                <span className="text-muted-foreground tabular-nums">{validacoesOk}/4</span>
              </TabsTrigger>
              <TabsTrigger value="tasks" className="min-h-11 gap-1.5 text-xs">
                <ClipboardList className="h-3.5 w-3.5" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="conversa" className="min-h-11 gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                Conversa
              </TabsTrigger>
              <TabsTrigger value="historico" className="min-h-11 gap-1.5 text-xs">
                <History className="h-3.5 w-3.5" />
                Histórico
              </TabsTrigger>
              <TabsTrigger value="notas" className="min-h-11 gap-1.5 text-xs">
                <StickyNote className="h-3.5 w-3.5" />
                Notas
              </TabsTrigger>
            </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <TabsContent value="validacao" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="p-5 space-y-4">
                    <ValidacaoChecklist lead={lead} profilesMap={profilesMap} />
                    {lead.perfil_resumo && (
                      <div className="border rounded-md p-3 bg-indigo-50/50 border-indigo-200">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Bot className="h-4 w-4 text-indigo-700" />
                          <span className="text-xs font-semibold text-indigo-700 uppercase">Perfil IA</span>
                          {lead.perfil_confianca && (
                            <Badge variant="outline" className="text-xs">{lead.perfil_confianca}% confiança</Badge>
                          )}
                        </div>
                        <p className="text-sm">{lead.perfil_resumo}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="tasks" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <LeadCampanhaTasks campanhaLeadId={lead.campanha_lead_id} />
                </ScrollArea>
              </TabsContent>
              <TabsContent value="conversa" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="p-5">
                    <LeadConversaUnificada leadId={lead.lead_id} historicoCampanhaFallback={historicoConversa} campanhaId={lead.campanha_id} campanhaLeadId={lead.campanha_lead_id} leadPhone={lead.lead_phone} />
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="historico" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="p-5">
                    <p className="text-xs text-muted-foreground mb-3">
                      Cross-canal: outras campanhas, conversas manuais e touchpoints.
                    </p>
                    <LeadTimelineUnificadoSection leadId={lead.lead_id} />
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="notas" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <LeadNotasRapidas leadId={lead.lead_id} />
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>

          {/* DESKTOP (≥ md): master-detail real lado-a-lado */}
          <div className="hidden md:grid md:grid-cols-[42%_58%] flex-1 min-h-0 overflow-hidden">
            {/* Coluna esquerda: 3 tabs (Tasks / Validação / Histórico) */}
            <div className="border-r flex flex-col min-h-0 overflow-hidden">
              <Tabs
                value={tab === "conversa" ? "tasks" : tab}
                onValueChange={(value) => setTab(value as PainelTab)}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <TabsList className="grid grid-cols-4 mx-4 mt-3 flex-shrink-0">
                  <TabsTrigger value="tasks" className="gap-1.5 text-xs">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Tasks
                  </TabsTrigger>
                  <TabsTrigger value="validacao" className="gap-1.5 text-xs">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Validação
                    <span className="text-muted-foreground tabular-nums">{validacoesOk}/4</span>
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="gap-1.5 text-xs">
                    <History className="h-3.5 w-3.5" />
                    Histórico
                  </TabsTrigger>
                  <TabsTrigger value="notas" className="gap-1.5 text-xs">
                    <StickyNote className="h-3.5 w-3.5" />
                    Notas
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 min-h-0 overflow-hidden">
                  <TabsContent value="tasks" className="m-0 h-full">
                    <ScrollArea className="h-full">
                      <LeadCampanhaTasks campanhaLeadId={lead.campanha_lead_id} />
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="validacao" className="m-0 h-full">
                    <ScrollArea className="h-full">
                      <div className="p-4 space-y-4">
                        <ValidacaoChecklist lead={lead} profilesMap={profilesMap} />
                        {lead.perfil_resumo && (
                          <div className="border rounded-md p-3 bg-indigo-50/50 border-indigo-200">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Bot className="h-4 w-4 text-indigo-700" />
                              <span className="text-xs font-semibold text-indigo-700 uppercase">Perfil IA</span>
                              {lead.perfil_confianca && (
                                <Badge variant="outline" className="text-xs">
                                  {lead.perfil_confianca}% confiança
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm">{lead.perfil_resumo}</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="historico" className="m-0 h-full">
                    <ScrollArea className="h-full">
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground mb-3">
                          Cross-canal: outras campanhas, conversas manuais e touchpoints.
                        </p>
                        <LeadTimelineUnificadoSection leadId={lead.lead_id} />
                      </div>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="notas" className="m-0 h-full">
                    <ScrollArea className="h-full">
                      <LeadNotasRapidas leadId={lead.lead_id} />
                    </ScrollArea>
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            {/* Coluna direita: Conversa SEMPRE visível */}
            <div className="flex flex-col min-h-0 overflow-hidden bg-muted/10">
              <div className="px-4 py-2 border-b flex items-center gap-2 text-xs text-muted-foreground bg-background flex-shrink-0">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="font-semibold">Conversa unificada</span>
                <span className="opacity-60">— últimas mensagens cross-campanha</span>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4">
                  <LeadConversaUnificada
                    leadId={lead.lead_id}
                    historicoCampanhaFallback={historicoConversa}
                    campanhaId={lead.campanha_id}
                    campanhaLeadId={lead.campanha_lead_id}
                    leadPhone={lead.lead_phone}
                  />
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Footer com ações */}
          <div className="border-t p-4 bg-muted/20 flex items-center gap-2 flex-wrap">
            {semDono ? (
              <Button
                size="sm"
                onClick={() => assumir.mutate(lead.campanha_lead_id)}
                disabled={assumir.isPending || ehTerminal}
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                Assumir lead
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled
                className="text-muted-foreground"
              >
                {sou_eu ? "Você assumiu" : `Assumido por ${lead.assumido_por_nome}`}
              </Button>
            )}

            {lead.etapa_acompanhamento === "quente" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => mover.mutate({ campanha_lead_id: lead.campanha_lead_id, etapa: "em_analise" })}
                disabled={mover.isPending}
              >
                Iniciar qualificação
              </Button>
            )}

            {(lead.etapa_acompanhamento === "em_analise" || lead.etapa_acompanhamento === "quente") && (
              <Button
                size="sm"
                variant="default"
                onClick={() => aprovar.mutate(lead.campanha_lead_id)}
                disabled={!podeAprovar || aprovar.isPending}
                title={!podeAprovar ? "Marque as 4 validações primeiro" : ""}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Encaminhar para oportunidade {podeAprovar ? "" : `(${validacoesOk}/4)`}
              </Button>
            )}

            {lead.etapa_acompanhamento === "aprovado" && (
              <Button
                size="sm"
                variant="default"
                onClick={() => mover.mutate({ campanha_lead_id: lead.campanha_lead_id, etapa: "na_escala" })}
                disabled={mover.isPending}
              >
                Confirmar envio a Contratos
              </Button>
            )}

            {!ehTerminal && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setPerdidoDialogOpen(true)}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Perdido
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-9"
              onClick={() => setEmailDialogOpen(true)}
            >
              <Mail className="mr-1.5 h-4 w-4" />
              E-mail
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-9"
              onClick={() => setQuickEditOpen(true)}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Editar contato
            </Button>

            <div className="ml-auto">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Abre prontuário do médico (rota Ewerton)
                  window.open(`/medicos?lead=${lead.lead_id}`, "_blank");
                }}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Prontuário
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <MarcarPerdidoDialog
        open={perdidoDialogOpen}
        onOpenChange={setPerdidoDialogOpen}
        campanhaLeadId={lead.campanha_lead_id}
        leadNome={lead.lead_nome}
        onSuccess={onClose}
      />
      <LeadEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        leadId={lead.lead_id}
        campanhaId={lead.campanha_id}
        campanhaLeadId={lead.campanha_lead_id}
      />
      <LeadQuickEditDialog
        open={quickEditOpen}
        onOpenChange={setQuickEditOpen}
        leadId={lead.lead_id}
      />
    </>
  );
}

function BubbleMsg({ msg }: { msg: { role: string; text: string; ts: string } }) {
  const isLead = msg.role === "medico";
  const Icon = isLead ? UserIcon : Bot;
  let hora = "";
  try {
    hora = format(new Date(msg.ts), "dd/MM HH:mm", { locale: ptBR });
  } catch {
    hora = "";
  }

  return (
    <div className={`flex gap-2 ${isLead ? "" : "flex-row-reverse"}`}>
      <div
        className={`shrink-0 mt-0.5 h-6 w-6 rounded-full flex items-center justify-center ${
          isLead ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className={`flex flex-col ${isLead ? "items-start" : "items-end"} max-w-[80%]`}>
        <div
          className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
            isLead ? "bg-emerald-50 border border-emerald-100" : "bg-indigo-50 border border-indigo-100"
          }`}
        >
          {msg.text}
        </div>
        <span className="text-[10px] text-muted-foreground mt-0.5">
          {isLead ? "Médico" : "IA"} · {hora}
        </span>
      </div>
    </div>
  );
}
