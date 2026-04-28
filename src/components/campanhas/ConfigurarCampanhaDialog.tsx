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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Smartphone,
  UserPlus,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string | null;
}

export function ConfigurarCampanhaDialog({ open, onOpenChange, campanhaId }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("disparo");

  // State editável
  const [chipIds, setChipIds] = useState<string[]>([]);
  const [rotationStrategy, setRotationStrategy] = useState("round_robin");
  const [limiteDiario, setLimiteDiario] = useState(30);
  const [batchSize, setBatchSize] = useState(5);
  const [handoffNome, setHandoffNome] = useState("");
  const [handoffTelefone, setHandoffTelefone] = useState("");
  const [handoffFrase, setHandoffFrase] = useState("");

  // Carrega campanha atual
  const { data: campanha, isLoading } = useQuery({
    queryKey: ["campanha-configurar", campanhaId],
    enabled: !!campanhaId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
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
    setChipIds(campanha.chip_ids || []);
    setRotationStrategy(campanha.rotation_strategy || "round_robin");
    setLimiteDiario(campanha.limite_diario_campanha || 30);
    setBatchSize(campanha.batch_size || 5);
    const briefing = campanha.briefing_ia || {};
    setHandoffNome(briefing.handoff_nome || "");
    setHandoffTelefone(briefing.handoff_telefone || "");
    setHandoffFrase(briefing.handoff_frase || "");
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

  const totalLeads =
    (campanha?.total_frio || 0) +
    (campanha?.total_contatado || 0) +
    (campanha?.total_em_conversa || 0) +
    (campanha?.total_aquecido || 0) +
    (campanha?.total_quente || 0) +
    (campanha?.total_convertido || 0);

  const handoffTelefoneValido = /^\+\d{12,13}$/.test(handoffTelefone);
  const podeAtivar =
    chipIds.length > 0 &&
    handoffNome.trim().length > 0 &&
    handoffNome !== "[A_CONFIGURAR]" &&
    handoffTelefoneValido &&
    totalLeads > 0;

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
      const { error } = await (supabase as any)
        .from("campanhas")
        .update({
          chip_ids: chipIds.length > 0 ? chipIds : null,
          chip_id: chipIds[0] || null,
          chip_fallback_id: chipIds[1] || null,
          rotation_strategy: rotationStrategy,
          limite_diario_campanha: limiteDiario,
          batch_size: batchSize,
          briefing_ia: briefingAtualizado,
        })
        .eq("id", campanhaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      qc.invalidateQueries({ queryKey: ["campanha-configurar", campanhaId] });
      toast.success("Configurações salvas");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  // Mutação: ativar
  const ativar = useMutation({
    mutationFn: async () => {
      if (!podeAtivar) throw new Error("Configure chip + responsável + leads antes");
      // Salva primeiro
      await salvar.mutateAsync();
      const { error } = await (supabase as any)
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
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  // Mutação: pausar / despausar
  const togglePausa = useMutation({
    mutationFn: async (novoStatus: "ativa" | "pausada") => {
      const { error } = await (supabase as any)
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
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  if (!campanhaId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
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
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="disparo" className="gap-1.5">
                <Smartphone className="h-3.5 w-3.5" />
                Chips
              </TabsTrigger>
              <TabsTrigger value="responsavel" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                Responsável
              </TabsTrigger>
              <TabsTrigger value="ativacao" className="gap-1.5">
                {campanha?.status === "ativa" ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Ativação
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto py-4">
              {/* ABA 1: CHIPS */}
              <TabsContent value="disparo" className="m-0 space-y-4">
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
                      chips.map((c: any) => {
                        const selected = chipIds.includes(c.id);
                        const open = c.connection_state === "open";
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              setChipIds(
                                selected
                                  ? chipIds.filter((id) => id !== c.id)
                                  : [...chipIds, c.id]
                              )
                            }
                            className={`w-full flex items-center justify-between p-2 rounded border text-sm transition-colors ${
                              selected
                                ? "bg-primary/10 border-primary"
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

                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Limite diário</Label>
                    <Input
                      type="number"
                      value={limiteDiario}
                      onChange={(e) => setLimiteDiario(Number(e.target.value))}
                      min={1}
                      max={500}
                    />
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
              <TabsContent value="responsavel" className="m-0 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
                  <strong>Importante:</strong> quando a IA detectar um lead quente, ela vai
                  enviar um WhatsApp <strong>pra esse número</strong>. Confirme que é um
                  número que vocês acompanham.
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

              {/* ABA 3: ATIVAÇÃO */}
              <TabsContent value="ativacao" className="m-0 space-y-4">
                <div className="border rounded p-4 space-y-2">
                  <h4 className="text-sm font-semibold">Checklist antes de ativar</h4>
                  <CheckItem ok={chipIds.length > 0} label="Pelo menos 1 chip selecionado" />
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
                    label={`Pool com leads (${totalLeads} no momento)`}
                    sublabel={
                      totalLeads === 0
                        ? "Use o botão 'Adicionar Leads ao Pool' na campanha"
                        : undefined
                    }
                  />
                </div>

                {campanha?.status === "rascunho" && (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => ativar.mutate()}
                    disabled={!podeAtivar || ativar.isPending}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {ativar.isPending ? "Ativando..." : "Ativar campanha"}
                  </Button>
                )}

                {campanha?.status === "ativa" && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Campanha em execução. Em até 1 minuto após qualquer mudança, o sistema
                      pega o próximo lote.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => togglePausa.mutate("pausada")}
                      disabled={togglePausa.isPending}
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Pausar campanha
                    </Button>
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
