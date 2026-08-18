import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CadenciaConfig } from "./CadenciaConfig";
import type { CadenciaPasso } from "@/hooks/useCadencia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Smartphone,
  UserPlus,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  Settings,
  ListChecks,
  Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChipsEmUso } from "@/hooks/useChipsEmUso";
import { toast } from "sonner";
import { ConfirmDestructive } from "@/components/common/ConfirmDestructive";
import { CampaignStrategiesConfig } from "./CampaignStrategiesConfig";
import {
  OfficialTemplateVariablesConfig,
  type OfficialTemplateBindings,
} from "./OfficialTemplateVariablesConfig";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string | null;
}

// A API oficial tem capacidade própria; não deve herdar o ritmo anti-ban dos
// chips Evolution nem nascer artificialmente limitada a 30 contatos/dia.
const DEFAULT_OFFICIAL_DAILY_LIMIT = 250;
const DEFAULT_EVOLUTION_DAILY_LIMIT = 30;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado";
}

export function ConfigurarCampanhaDialog({ open, onOpenChange, campanhaId }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("disparo");

  // State editável
  const [chipIds, setChipIds] = useState<string[]>([]);
  const [rotationStrategy, setRotationStrategy] = useState("round_robin");
  const [limiteDiario, setLimiteDiario] = useState(DEFAULT_EVOLUTION_DAILY_LIMIT);
  const [batchSize, setBatchSize] = useState(5);
  const [whatsappProvider, setWhatsappProvider] = useState<"evolution" | "twilio" | "chakra">("evolution");
  const [officialTemplateId, setOfficialTemplateId] = useState<string | null>(null);
  const [officialSenderId, setOfficialSenderId] = useState<string | null>(null);
  const [officialTemplateVariables, setOfficialTemplateVariables] = useState<OfficialTemplateBindings>({});
  const [handoffNome, setHandoffNome] = useState("");
  const [handoffTelefone, setHandoffTelefone] = useState("");
  const [handoffFrase, setHandoffFrase] = useState("");
  const [responsavelId, setResponsavelId] = useState<string | null>(null);
  // Cadência de tarefas editável na campanha já criada (pedido Bruna: mais opções na Pediatras MG)
  const [tarefaPassos, setTarefaPassos] = useState<CadenciaPasso[]>([]);
  const [tarefaTemplateId, setTarefaTemplateId] = useState<string | null>(null);

  // Carrega campanha atual
  const { data: campanha, isLoading } = useQuery({
    queryKey: ["campanha-configurar", campanhaId],
    enabled: !!campanhaId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas")
        .select("*")
        .eq("id", campanhaId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Popula state quando carrega
  useEffect(() => {
    if (!campanha) return;
    const officialConfig = campanha as typeof campanha & {
      whatsapp_provider?: "evolution" | "twilio" | "chakra";
      official_template_id?: string | null;
      official_sender_id?: string | null;
      official_template_variables?: OfficialTemplateBindings | null;
    };
    setChipIds(campanha.chip_ids || []);
    setRotationStrategy(campanha.rotation_strategy || "round_robin");
    const provider = officialConfig.whatsapp_provider || "evolution";
    setLimiteDiario(
      campanha.limite_diario_campanha ||
        (provider !== "evolution" ? DEFAULT_OFFICIAL_DAILY_LIMIT : DEFAULT_EVOLUTION_DAILY_LIMIT),
    );
    setBatchSize(campanha.batch_size || (provider !== "evolution" ? 10 : 5));
    setWhatsappProvider(provider);
    setOfficialTemplateId(officialConfig.official_template_id || null);
    setOfficialSenderId(officialConfig.official_sender_id || null);
    setOfficialTemplateVariables(officialConfig.official_template_variables || {});
    setResponsavelId(campanha.responsavel_id || null);
    const briefing = (campanha.briefing_ia || {}) as Record<string, unknown>;
    setHandoffNome(String(briefing.handoff_nome || ""));
    setHandoffTelefone(String(briefing.handoff_telefone || ""));
    setHandoffFrase(String(briefing.handoff_frase || ""));
    setTarefaPassos((campanha.tarefa_cadencia_passos || []) as unknown as CadenciaPasso[]);
    setTarefaTemplateId(campanha.tarefa_cadencia_template_id || null);
  }, [campanha]);

  // Lista de chips disponíveis (open + ativo + tipo disparos)
  const { data: chips = [] } = useQuery({
    queryKey: ["chips-configurar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips")
        .select("id, nome, numero, status, connection_state, tipo_instancia, pode_disparar, instance_name")
        .eq("tipo_instancia", "disparos")
        .eq("pode_disparar", true)
        .in("status", ["ativo", "suspeito"])
        .order("connection_state", { ascending: true })
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: officialTemplates = [] } = useQuery({
    queryKey: ["approved-whatsapp-official-templates", "pt_BR"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_official_templates" as never)
        .select("id, provider, friendly_name, category, language, twilio_account_key")
        .eq("approval_status", "approved")
        .eq("language", "pt_BR")
        .order("friendly_name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; provider: string | null; friendly_name: string; category: string | null; language: string; twilio_account_key: string | null }>;
    },
  });

  const { data: officialSenders = [] } = useQuery({
    queryKey: ["active-whatsapp-official-senders"],
    enabled: open && whatsappProvider !== "evolution",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_official_senders" as never)
        .select("id, provider, display_name, phone_e164, status, twilio_account_key, chakra_plugin_id, chakra_phone_number_id")
        .eq("provider", whatsappProvider)
        .in("status", ["approved", "online", "active", "activated", "connected"])
        .order("display_name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; provider: string; display_name: string | null; phone_e164: string; status: string; twilio_account_key: string | null; chakra_plugin_id?: string | null; chakra_phone_number_id?: string | null }>;
    },
  });

  const { data: responsaveis = [] } = useQuery({
    queryKey: ["campanha-responsaveis-ativos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo, telefone")
        .eq("status", "ativo")
        .order("nome_completo");
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (whatsappProvider !== "evolution" && !officialSenderId && officialSenders.length === 1) {
      setOfficialSenderId(officialSenders[0].id);
    }
  }, [whatsappProvider, officialSenderId, officialSenders]);

  const selectedSender = officialSenders.find((sender) => sender.id === officialSenderId);
  const compatibleOfficialTemplates = selectedSender
    ? officialTemplates.filter((template) =>
        template.provider === selectedSender.provider &&
        (selectedSender.provider === "chakra" || template.twilio_account_key === selectedSender.twilio_account_key))
    : officialTemplates;

  useEffect(() => {
    if (!selectedSender || !officialTemplateId) return;
    const selectedTemplate = officialTemplates.find((template) => template.id === officialTemplateId);
    if (selectedTemplate && (
      selectedTemplate.provider !== selectedSender.provider ||
      (selectedSender.provider !== "chakra" && selectedTemplate.twilio_account_key !== selectedSender.twilio_account_key)
    )) {
      setOfficialTemplateId(null);
      setOfficialTemplateVariables({});
    }
  }, [selectedSender, officialTemplateId, officialTemplates]);

  // Uma campanha Twilio não pode carregar chips Evolution, mesmo ao restaurar
  // uma configuração antiga ou trocar de provedor rapidamente.
  useEffect(() => {
    if (whatsappProvider !== "evolution" && chipIds.length > 0) setChipIds([]);
  }, [whatsappProvider, chipIds.length]);

  const handleProviderChange = (provider: "evolution" | "twilio" | "chakra") => {
    setWhatsappProvider(provider);
    if (provider !== "evolution") setChipIds([]);
    // Só troca defaults; um limite personalizado da operação permanece.
    if (provider !== "evolution" && limiteDiario <= DEFAULT_EVOLUTION_DAILY_LIMIT) {
      setLimiteDiario(DEFAULT_OFFICIAL_DAILY_LIMIT);
    }
    if (provider === "evolution" && limiteDiario >= DEFAULT_OFFICIAL_DAILY_LIMIT) {
      setLimiteDiario(DEFAULT_EVOLUTION_DAILY_LIMIT);
    }
    if (provider === "evolution") {
      setOfficialTemplateId(null);
      setOfficialSenderId(null);
      setOfficialTemplateVariables({});
    }
  };

  // Pedido Bruna (08/06): chip já usado por outra campanha ativa fica bloqueado aqui.
  const { data: chipsEmUso } = useChipsEmUso(campanha?.id);

  const totalLeads =
    (campanha?.total_frio || 0) +
    (campanha?.total_contatado || 0) +
    (campanha?.total_em_conversa || 0) +
    (campanha?.total_aquecido || 0) +
    (campanha?.total_quente || 0) +
    (campanha?.total_convertido || 0);

  const handoffTelefoneValido = /^\+\d{12,13}$/.test(handoffTelefone);
  const officialBindingsOk =
    Object.keys(officialTemplateVariables).length > 0 &&
    Object.values(officialTemplateVariables).every((binding) => binding.trim().length > 0);
  const briefingOperacionalOk =
    campanha?.tipo_envio === "manual" ||
    (Boolean(String((campanha?.briefing_ia as Record<string, unknown> | null)?.nome_servico || (campanha?.briefing_ia as Record<string, unknown> | null)?.tipo_servico || "").trim()) &&
      (Boolean(String((campanha?.briefing_ia as Record<string, unknown> | null)?.cidade || (campanha?.briefing_ia as Record<string, unknown> | null)?.local || "").trim()) ||
        (Array.isArray((campanha?.briefing_ia as Record<string, unknown> | null)?.locais) && ((campanha?.briefing_ia as Record<string, unknown> | null)?.locais as unknown[]).length > 0)));
  const podeAtivar =
    (whatsappProvider !== "evolution"
      ? !!officialTemplateId &&
        !!officialSenderId &&
        officialBindingsOk
      : chipIds.length > 0) &&
    handoffNome.trim().length > 0 &&
    handoffNome !== "[A_CONFIGURAR]" &&
    handoffTelefoneValido &&
    !!responsavelId &&
    totalLeads > 0 &&
    briefingOperacionalOk;

  // Mutação: salvar configurações
  const salvar = useMutation({
    mutationFn: async () => {
      if (!campanha) throw new Error("Campanha não carregada");
      const briefingAtualizado = {
        ...(campanha.briefing_ia || {}),
        handoff_nome: handoffNome.trim() || "[A_CONFIGURAR]",
        handoff_telefone: handoffTelefone.trim(),
        handoff_frase: handoffFrase.trim() || "Vai te passar todos os detalhes sobre valores, escala e condições.",
      };
      const { error } = await supabase
        .from("campanhas")
        .update({
          chip_ids: chipIds.length > 0 ? chipIds : null,
          chip_id: chipIds[0] || null,
          chip_fallback_id: chipIds[1] || null,
          rotation_strategy: rotationStrategy,
          limite_diario_campanha: limiteDiario,
          batch_size: batchSize,
          briefing_ia: briefingAtualizado,
          tarefa_cadencia_passos: tarefaPassos.length > 0 ? tarefaPassos : null,
          tarefa_cadencia_template_id: tarefaTemplateId,
          whatsapp_provider: whatsappProvider,
          official_template_id: whatsappProvider !== "evolution" ? officialTemplateId : null,
          official_sender_id: whatsappProvider !== "evolution" ? officialSenderId : null,
          official_template_variables: whatsappProvider !== "evolution" ? officialTemplateVariables : {},
          responsavel_id: responsavelId,
        } as never)
        .eq("id", campanhaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      qc.invalidateQueries({ queryKey: ["campanha-configurar", campanhaId] });
      toast.success("Configurações salvas");
    },
    onError: (error: unknown) => toast.error("Erro: " + errorMessage(error)),
  });

  // Mutação: ativar
  const ativar = useMutation({
    mutationFn: async () => {
      if (!podeAtivar) {
        throw new Error(
          !briefingOperacionalOk
            ? "Complete o briefing da IA com serviço e cidade/local antes de ativar"
            : whatsappProvider !== "evolution"
            ? "Configure número oficial, template aprovado, responsável e leads antes"
            : "Configure chip Evolution, responsável e leads antes",
        );
      }
      // Salva primeiro
      await salvar.mutateAsync();
      const { error } = await supabase
        .from("campanhas")
        .update({ status: "ativa" })
        .eq("id", campanhaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      toast.success("Campanha ATIVADA. Em até 1 minuto começa o primeiro disparo.");
      onOpenChange(false);
    },
    onError: (error: unknown) => toast.error("Erro: " + errorMessage(error)),
  });

  // Mutação: pausar / despausar
  const togglePausa = useMutation({
    mutationFn: async (novoStatus: "ativa" | "pausada") => {
      const { error } = await supabase
        .from("campanhas")
        .update({ status: novoStatus })
        .eq("id", campanhaId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      qc.invalidateQueries({ queryKey: ["campanha-configurar", campanhaId] });
      toast.success(variables === "ativa" ? "Campanha retomada" : "Campanha pausada");
    },
    onError: (error: unknown) => toast.error("Erro: " + errorMessage(error)),
  });

  if (!campanhaId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurar campanha
          </DialogTitle>
          <DialogDescription>
            {campanha?.nome} ·{" "}
            <Badge variant="outline" className="text-xs">
              {campanha?.status}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto w-max min-w-full justify-start">
              <TabsTrigger value="disparo" className="min-h-11 gap-1.5">
                <Smartphone className="h-3.5 w-3.5" />
                Canal
              </TabsTrigger>
              <TabsTrigger value="tarefas" className="min-h-11 gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />
                Tarefas
              </TabsTrigger>
              <TabsTrigger value="responsavel" className="min-h-11 gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                Responsável
              </TabsTrigger>
              <TabsTrigger value="estrategias" className="min-h-11 gap-1.5">
                <Target className="h-3.5 w-3.5" />
                Estratégias
              </TabsTrigger>
              <TabsTrigger value="ativacao" className="min-h-11 gap-1.5">
                {campanha?.status === "ativa" ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Ativação
              </TabsTrigger>
            </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              {/* ABA 1: CHIPS */}
              <TabsContent value="disparo" className="m-0 space-y-4">
                <div className="space-y-2">
                  <Label>Canal de WhatsApp</Label>
                  <Select
                    value={whatsappProvider}
                    onValueChange={(value) => handleProviderChange(value as "evolution" | "twilio" | "chakra")}
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="evolution">API não oficial · Evolution</SelectItem>
                      <SelectItem value="twilio">API oficial · Twilio/WhatsApp</SelectItem>
                      <SelectItem value="chakra">API oficial · Chakra (coexistência)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {whatsappProvider !== "evolution"
                      ? `API oficial (${whatsappProvider === "chakra" ? "Chakra" : "Twilio"}): usa template aprovado e número remetente. Não depende dos chips conectados ao Sigma.`
                      : "Evolution: usa os chips conectados selecionados para o disparo."}
                  </p>
                </div>

                {whatsappProvider !== "evolution" && (
                  <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                    <Label>Número oficial remetente</Label>
                    <Select
                      value={officialSenderId || ""}
                      onValueChange={(value) => {
                        setOfficialSenderId(value);
                        const sender = officialSenders.find((item) => item.id === value);
                        if (sender && officialTemplateId) {
                          const template = officialTemplates.find((item) => item.id === officialTemplateId);
                          if (template && (template.provider !== sender.provider || (sender.provider !== "chakra" && template.twilio_account_key !== sender.twilio_account_key))) {
                            setOfficialTemplateId(null);
                            setOfficialTemplateVariables({});
                          }
                        }
                      }}
                    >
                      <SelectTrigger className="min-h-11 bg-background">
                        <SelectValue placeholder="Selecione o número oficial" />
                      </SelectTrigger>
                      <SelectContent>
                        {officialSenders.map((sender) => (
                          <SelectItem key={sender.id} value={sender.id}>
                            {sender.display_name || "WhatsApp oficial"} · {sender.phone_e164} · {sender.provider === "chakra" ? "Chakra" : sender.twilio_account_key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {officialSenders.length === 0 && (
                      <p className="text-xs text-amber-800">
                        Nenhum número oficial ativo foi encontrado na Twilio.
                      </p>
                    )}

                    <Label>Template oficial aprovado</Label>
                    <p className="text-xs text-blue-900">
                      O primeiro contato usa o template aprovado; após a resposta, a equipe conversa por este mesmo número no Sigma.
                    </p>
                    <Select
                      value={officialTemplateId || ""}
                      onValueChange={(templateId) => {
                        setOfficialTemplateId(templateId);
                        setOfficialTemplateVariables({});
                      }}
                    >
                      <SelectTrigger className="min-h-11 bg-background">
                        <SelectValue placeholder="Selecione um template aprovado" />
                      </SelectTrigger>
                      <SelectContent>
                        {compatibleOfficialTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.friendly_name} · {template.category || "sem categoria"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {compatibleOfficialTemplates.length === 0 && (
                      <p className="text-xs text-amber-800">
                        Ainda não há template aprovado. Crie e acompanhe em “Templates WhatsApp”.
                      </p>
                    )}
                    <OfficialTemplateVariablesConfig
                      templateId={officialTemplateId}
                      value={officialTemplateVariables}
                      onChange={setOfficialTemplateVariables}
                    />
                  </div>
                )}

                {whatsappProvider === "evolution" && (
                <div>
                  <Label className="text-sm">
                    Chips a usar no disparo
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      (selecione 1 ou mais — 2+ ativam rotação automática)
                    </span>
                  </Label>
                  <div className="space-y-1.5 mt-2 border rounded-md p-2 max-h-72 overflow-y-auto">
                    {chips.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum chip disponível
                      </p>
                    ) : (
                      chips.map((c) => {
                        const selected = chipIds.includes(c.id);
                        const open = c.connection_state === "open";
                        const usadoPor = !selected ? chipsEmUso?.get(c.id) : undefined;
                        const bloqueado = !!usadoPor;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={bloqueado}
                            onClick={() =>
                              bloqueado
                                ? undefined
                                : setChipIds(
                                    selected
                                      ? chipIds.filter((id) => id !== c.id)
                                      : [...chipIds, c.id]
                                  )
                            }
                            className={`w-full flex items-center justify-between p-2 rounded border text-sm transition-colors ${
                              selected
                                ? "bg-primary/10 border-primary"
                                : bloqueado
                                ? "bg-muted/40 border-input opacity-60 cursor-not-allowed"
                                : "bg-background hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`shrink-0 h-3.5 w-3.5 rounded border ${
                                  selected
                                    ? "bg-primary border-primary"
                                    : "border-input"
                                } flex items-center justify-center`}
                              >
                                {selected && (
                                  <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                                )}
                              </span>
                              <div className="text-left min-w-0">
                                <p className="font-medium truncate">{c.nome}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {c.numero}
                                </p>
                                {usadoPor && (
                                  <p className="text-[11px] text-amber-600 truncate">
                                    já em uso por: {usadoPor}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-xs shrink-0 ml-2 ${
                                open
                                  ? "bg-green-50 text-green-700 border-green-300"
                                  : "bg-amber-50 text-amber-700 border-amber-300"
                              }`}
                            >
                              {c.connection_state}
                            </Badge>
                          </button>
                        );
                      })
                    )}
                  </div>
                  {chipIds.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {chipIds.length} chip{chipIds.length > 1 ? "s" : ""} selecionado
                      {chipIds.length > 1 ? "s" : ""}
                      {chipIds.length >= 2 ? " · rotação ativa" : ""}
                    </p>
                  )}
                </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {whatsappProvider !== "evolution"
                        ? "Limite diário oficial (novos contatos)"
                        : "Limite diário da campanha"}
                    </Label>
                    <Input
                      type="number"
                      value={limiteDiario}
                      onChange={(e) => setLimiteDiario(Number(e.target.value))}
                      min={1}
                      max={whatsappProvider !== "evolution" ? DEFAULT_OFFICIAL_DAILY_LIMIT : 500}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {whatsappProvider !== "evolution"
                        ? "Piloto atual da API oficial: até 250 novos contatos/dia."
                        : "O ritmo é governado pelos limites e pela saúde dos chips conectados."}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tamanho do lote</Label>
                    <Input
                      type="number"
                      value={batchSize}
                      onChange={(e) => setBatchSize(Number(e.target.value))}
                      min={1}
                      max={20}
                    />
                  </div>
                </div>

                <div className="bg-muted/30 rounded p-3 text-xs text-muted-foreground">
                  ⚠️ <strong>Não mexer no briefing IA</strong> (mensagem inicial, persona,
                  requisitos, gatilhos, palavras proibidas). Esses campos foram calibrados em
                  ~2 semanas de iteração e validados pela diretoria. Se precisar mudar, fale
                  com Raul.
                </div>
              </TabsContent>

              {/* ABA 2: RESPONSÁVEL */}
              <TabsContent value="tarefas" className="m-0 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Tarefas que cada lead desta campanha gera pra equipe executar (WhatsApp, ligação, Instagram, e-mail…). Edite pra adicionar mais opções. Vale pros leads que entrarem a partir de agora.
                </p>
                <CadenciaConfig
                  passos={tarefaPassos}
                  onChange={setTarefaPassos}
                  templateId={tarefaTemplateId}
                  onTemplateChange={setTarefaTemplateId}
                />
              </TabsContent>

              <TabsContent value="responsavel" className="m-0 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
                  <strong>Importante:</strong> quando a IA detectar um lead quente, ela vai
                  enviar um WhatsApp <strong>pra esse número</strong>. Confirme que é um
                  número que vocês acompanham.
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Responsável dentro do Sigma *</Label>
                  <Select
                    value={responsavelId || ""}
                    onValueChange={(id) => {
                      setResponsavelId(id);
                      const profile = responsaveis.find((item) => item.id === id);
                      if (!profile) return;
                      setHandoffNome(profile.nome_completo);
                      if (profile.telefone) {
                        const phone = profile.telefone.replace(/\D/g, "");
                        setHandoffTelefone(phone.startsWith("55") ? `+${phone}` : `+55${phone}`);
                      }
                    }}
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue placeholder="Selecione quem receberá o lead" />
                    </SelectTrigger>
                    <SelectContent>
                      {responsaveis.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.nome_completo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Leads quentes serão atribuídos automaticamente e a IA será pausada.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Nome do responsável *</Label>
                  <Input
                    value={handoffNome}
                    onChange={(e) => setHandoffNome(e.target.value)}
                    placeholder="Ester, Bruna, Raul..."
                  />
                  {(handoffNome === "[A_CONFIGURAR]" || handoffNome.trim() === "") && (
                    <p className="text-xs text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Preencha com o nome real
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Telefone do responsável (E.164) *</Label>
                  <Input
                    value={handoffTelefone}
                    onChange={(e) => setHandoffTelefone(e.target.value)}
                    placeholder="+554799514821"
                    className="font-mono"
                  />
                  {handoffTelefone && !handoffTelefoneValido && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Formato inválido. Use +55DDXXXXXXXXX (com +55, DDD e 9 dígitos)
                    </p>
                  )}
                  {handoffTelefoneValido && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Formato válido
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Frase do encaminhamento{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      (como a IA descreve o handoff pro médico)
                    </span>
                  </Label>
                  <Textarea
                    value={handoffFrase}
                    onChange={(e) => setHandoffFrase(e.target.value)}
                    placeholder="Vai te passar todos os detalhes sobre valores, escala e condições."
                    className="min-h-[80px] text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    A IA flexiona "ele/ela" automaticamente conforme o nome.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="estrategias" className="m-0">
                <CampaignStrategiesConfig campanhaId={campanhaId} />
              </TabsContent>

              {/* ABA: ATIVAÇÃO */}
              <TabsContent value="ativacao" className="m-0 space-y-4">
                <div className="border rounded p-4 space-y-2">
                  <h4 className="text-sm font-semibold">Checklist antes de ativar</h4>
                  {whatsappProvider !== "evolution" ? (
                    <>
                      <CheckItem
                        ok={!!officialSenderId}
                        label="Número oficial remetente configurado"
                      />
                      <CheckItem
                        ok={!!officialTemplateId}
                        label="Template oficial aprovado selecionado"
                      />
                      <CheckItem
                        ok={officialBindingsOk}
                        label="Variáveis do template preenchidas"
                      />
                    </>
                  ) : (
                    <CheckItem ok={chipIds.length > 0} label="Pelo menos 1 chip Evolution selecionado" />
                  )}
                  <CheckItem
                    ok={handoffNome.trim().length > 0 && handoffNome !== "[A_CONFIGURAR]"}
                    label="Nome do responsável preenchido"
                  />
                  <CheckItem
                    ok={handoffTelefoneValido}
                    label="Telefone do responsável em formato +55..."
                  />
                  <CheckItem
                    ok={totalLeads > 0}
                    label={`Base de leads carregada (${totalLeads} no momento)`}
                    sublabel={
                      totalLeads === 0
                        ? "Use o botão 'Adicionar Leads à Base' na campanha"
                        : undefined
                    }
                  />
                </div>

                {campanha?.status === "rascunho" && (
                  <div className="space-y-2">
                    {!briefingOperacionalOk && campanha.tipo_envio !== "manual" && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        Complete o briefing da IA com o serviço e a cidade/local antes de ativar.
                      </p>
                    )}
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => ativar.mutate()}
                      disabled={!podeAtivar || ativar.isPending}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {ativar.isPending ? "Ativando..." : "Ativar campanha"}
                    </Button>
                  </div>
                )}

                {campanha?.status === "ativa" && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Campanha em execução. Em até 1 minuto após qualquer mudança, o sistema
                      pega o próximo lote.
                    </p>
                    <ConfirmDestructive
                      title={`Pausar a campanha "${campanha?.nome ?? "selecionada"}"?`}
                      description={
                        <>
                          Os disparos param em até 1 minuto e leads pendentes ficam parados. Você
                          pode retomar a qualquer momento — leads em conversa com a IA continuam
                          respondendo normalmente.
                        </>
                      }
                      confirmLabel="Pausar campanha"
                      onConfirm={() => togglePausa.mutate("pausada")}
                      trigger={
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={togglePausa.isPending}
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Pausar campanha
                        </Button>
                      }
                    />
                  </div>
                )}

                {campanha?.status === "pausada" && (
                  <Button
                    className="w-full"
                    onClick={() => togglePausa.mutate("ativa")}
                    disabled={togglePausa.isPending}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Retomar campanha
                  </Button>
                )}

                {campanha?.status === "finalizada" && (
                  <p className="text-sm text-center text-muted-foreground py-4">
                    Campanha finalizada. Não é possível reativar — crie uma nova.
                  </p>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {campanha?.status !== "finalizada" && (
            <Button
              onClick={() => salvar.mutate()}
              disabled={salvar.isPending || !campanha}
            >
              {salvar.isPending ? "Salvando..." : "Salvar configurações"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckItem({
  ok,
  label,
  sublabel,
}: {
  ok: boolean;
  label: string;
  sublabel?: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <p className={ok ? "" : "text-muted-foreground"}>{label}</p>
        {sublabel && (
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        )}
      </div>
    </div>
  );
}
