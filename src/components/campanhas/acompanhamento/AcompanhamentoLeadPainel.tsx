import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
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
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LeadPerfilIaSection } from "@/components/medicos/LeadPerfilIaSection";
import { LeadTimelineUnificadoSection } from "@/components/medicos/LeadTimelineUnificadoSection";
import { ValidacaoChecklist } from "./ValidacaoChecklist";
import { MarcarPerdidoDialog } from "./MarcarPerdidoDialog";
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

export function AcompanhamentoLeadPainel({ lead, onClose }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"conversa" | "historico" | "validacao">("validacao");
  const [perdidoDialogOpen, setPerdidoDialogOpen] = useState(false);
  const assumir = useAssumirLead();
  const aprovar = useAprovarLead();
  const mover = useMoverEtapa();

  // Histórico da conversa atual (campanha_leads.historico_conversa)
  const { data: historicoConversa = [] } = useQuery({
    queryKey: ["campanha-lead-historico-conversa", lead?.campanha_lead_id],
    enabled: !!lead?.campanha_lead_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
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
      const { data } = await (supabase as any).from("profiles").select("id, nome_completo");
      const m = new Map<string, string>();
      (data || []).forEach((p: any) => m.set(p.id, p.nome_completo));
      return m;
    },
    staleTime: 5 * 60_000,
  });

  if (!lead) return null;

  const semDono = !lead.assumido_por;
  const sou_eu = lead.assumido_por === user?.id;
  const validacoesOk = lead.validacoes_ok || 0;
  const podeAprovar = validacoesOk === 4;
  const ehTerminal = lead.etapa_acompanhamento === "aprovado" || lead.etapa_acompanhamento === "perdido" || lead.etapa_acompanhamento === "na_escala";

  const iniciaisDono = lead.assumido_por_nome
    ? lead.assumido_por_nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "";

  return (
    <>
      <Sheet open={!!lead} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-4 border-b">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg flex items-center gap-2">
                  {lead.lead_nome}
                  {lead.etapa_acompanhamento === "quente" && semDono && (
                    <Flame className="h-5 w-5 text-red-500" />
                  )}
                </SheetTitle>
                <div className="text-sm text-muted-foreground space-y-1 mt-1">
                  {lead.lead_especialidade && (
                    <p className="flex items-center gap-1.5">
                      <Stethoscope className="h-3.5 w-3.5" />
                      {lead.lead_especialidade}
                    </p>
                  )}
                  {(lead.lead_cidade || lead.lead_uf) && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {[lead.lead_cidade, lead.lead_uf].filter(Boolean).join("/")}
                    </p>
                  )}
                  {lead.lead_phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="font-mono">{lead.lead_phone}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Badge variant="outline" className="text-xs">
                  {labelEtapa(lead.etapa_acompanhamento)}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {lead.campanha_nome}
                </Badge>
                {!semDono && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[10px] bg-primary/10">{iniciaisDono}</AvatarFallback>
                    </Avatar>
                    <span>{lead.assumido_por_nome || "—"}</span>
                  </div>
                )}
              </div>
            </div>
          </SheetHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid grid-cols-3 mx-5 mt-3 flex-shrink-0">
              <TabsTrigger value="validacao" className="gap-1.5 text-xs">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Validação
                <span className="text-muted-foreground tabular-nums">{validacoesOk}/4</span>
              </TabsTrigger>
              <TabsTrigger value="conversa" className="gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                Conversa
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-1.5 text-xs">
                <History className="h-3.5 w-3.5" />
                Histórico
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="validacao" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="p-5 space-y-4">
                    <ValidacaoChecklist lead={lead} profilesMap={profilesMap} />

                    {/* Perfil IA resumo */}
                    {lead.perfil_resumo && (
                      <div className="border rounded-md p-3 bg-indigo-50/50 border-indigo-200">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Bot className="h-4 w-4 text-indigo-700" />
                          <span className="text-xs font-semibold text-indigo-700 uppercase">
                            Perfil IA
                          </span>
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

              <TabsContent value="conversa" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="p-5 space-y-2">
                    {historicoConversa.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Nenhuma conversa registrada nesta campanha ainda.
                      </p>
                    ) : (
                      historicoConversa.map((msg, i) => (
                        <BubbleMsg key={i} msg={msg} />
                      ))
                    )}
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
            </div>
          </Tabs>

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
                Mover pra Análise
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
                Aprovar {podeAprovar ? "" : `(${validacoesOk}/4)`}
              </Button>
            )}

            {lead.etapa_acompanhamento === "aprovado" && (
              <Button
                size="sm"
                variant="default"
                onClick={() => mover.mutate({ campanha_lead_id: lead.campanha_lead_id, etapa: "na_escala" })}
                disabled={mover.isPending}
              >
                Marcar na escala
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
    </>
  );
}

function BubbleMsg({ msg }: { msg: { role: string; text: string; ts: string } }) {
  const isLead = msg.role === "medico";
  const Icon = isLead ? UserIcon : Bot;
  let hora = "";
  try {
    hora = format(new Date(msg.ts), "dd/MM HH:mm", { locale: ptBR });
  } catch {}

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
