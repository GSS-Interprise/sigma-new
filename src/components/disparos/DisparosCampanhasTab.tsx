import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Eye, Trash2, Users, CheckCircle, XCircle, AlertTriangle, Send, Power, PowerOff, Bot, Info, Rocket, Clock, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { DisparosContatosPanel } from "./DisparosContatosPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { useCaptacaoPermissions } from "@/hooks/useCaptacaoPermissions";

interface Campanha {
  id: string;
  nome: string;
  proposta_id: string | null;
  texto_ia: string | null;
  instancia: string | null;
  chip_id: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  status: string;
  total_contatos: number;
  enviados: number;
  falhas: number;
  nozap: number;
  reenviar: number;
  created_at: string;
  ativo: boolean;
  ia_ativa: boolean;
  proximo_envio: string | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  em_andamento: { label: "Em Andamento", variant: "default" },
  pausado: { label: "Pausado", variant: "secondary" },
  agendado: { label: "Agendado", variant: "secondary" },
  concluido: { label: "Concluído", variant: "outline" },
  cancelado: { label: "Cancelado", variant: "destructive" },
};

export function DisparosCampanhasTab() {
  const [selectedCampanha, setSelectedCampanha] = useState<Campanha | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();
  const { isCaptacaoLeader } = useCaptacaoPermissions();
  const canSwitchInstance = isAdmin || isCaptacaoLeader;

  useEffect(() => {
    const channel = supabase
      .channel("disparos-campanhas-realtime")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "disparos_campanhas" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
          queryClient.invalidateQueries({ queryKey: ["disparos-instancias-em-uso"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["disparos-campanhas", mostrarInativos],
    queryFn: async () => {
      let query = supabase
        .from("disparos_campanhas")
        .select("*")
        .order("created_at", { ascending: false });
      if (!mostrarInativos) query = query.eq("ativo", true);
      const { data, error } = await query;
      if (error) throw error;
      return data as Campanha[];
    },
  });

  const { data: propostasParaMensagem = [] } = useQuery({
    queryKey: ["propostas-mensagens", campanhas.map(c => c.proposta_id)],
    queryFn: async () => {
      const propostaIds = campanhas.map(c => c.proposta_id).filter(Boolean) as string[];
      if (propostaIds.length === 0) return [];
      const { data, error } = await supabase
        .from("proposta")
        .select("id, observacoes")
        .in("id", propostaIds);
      if (error) throw error;
      return data;
    },
    enabled: campanhas.length > 0,
  });

  const { data: chips = [] } = useQuery({
    queryKey: ["chips-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips")
        .select("*")
        .eq("status", "ativo")
        .or("tipo_instancia.is.null,tipo_instancia.neq.trafego_pago")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: instanciasEmUso = [] } = useQuery({
    queryKey: ["disparos-instancias-em-uso"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparos_campanhas")
        .select("instancia, status, ativo, total_contatos, enviados")
        .not("instancia", "is", null);
      if (error) throw error;
      const instancias = (data || [])
        .filter((r) => {
          const statusEmUso = ["pendente", "em_andamento", "pausado", "agendado"].includes(r.status || "");
          const ativoComPendencia = r.ativo === true && (r.total_contatos || 0) > (r.enviados || 0);
          return statusEmUso || ativoComPendencia;
        })
        .map((r) => r.instancia)
        .filter(Boolean) as string[];
      return Array.from(new Set(instancias));
    },
  });

  const instanciasEmUsoSet = useMemo(() => new Set(instanciasEmUso), [instanciasEmUso]);

  const deletarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("disparos_campanhas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      toast.success("Campanha excluída.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("disparos_campanhas").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      toast.success(variables.ativo ? "Campanha ativada." : "Campanha inativada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleIAMutation = useMutation({
    mutationFn: async ({ id, ia_ativa }: { id: string; ia_ativa: boolean }) => {
      const { error } = await supabase.from("disparos_campanhas").update({ ia_ativa }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      toast.success(variables.ia_ativa ? "IA de auto-resposta ativada." : "IA de auto-resposta desativada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const trocarInstanciaMutation = useMutation({
    mutationFn: async ({ campanhaId, chipId: newChipId }: { campanhaId: string; chipId: string }) => {
      const chipSelecionado = chips.find(c => c.id === newChipId);
      const novaInstancia = chipSelecionado?.instance_name || null;
      const { error } = await supabase
        .from("disparos_campanhas")
        .update({ instancia: novaInstancia, chip_id: newChipId })
        .eq("id", campanhaId);
      if (error) throw error;
      return { novaInstancia };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      queryClient.invalidateQueries({ queryKey: ["disparos-instancias-em-uso"] });
      toast.success(`Instância alterada para "${data.novaInstancia}"`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dispararMutation = useMutation({
    mutationFn: async (campanhaId: string) => {
      const { data, error } = await supabase.functions.invoke("disparos-webhook", {
        body: { acao: "iniciar", campanha_id: campanhaId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return { ...(data as any), campanhaId };
    },
    onSuccess: (_data, campanhaId) => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      toast.success("Disparo iniciado.");
      // Mantém o botão travado até o status real chegar via refetch
      setDisparandoIds((prev) => {
        const next = new Set(prev);
        next.delete(campanhaId);
        return next;
      });
    },
    onError: (error: Error, campanhaId) => {
      toast.error(error.message);
      setDisparandoIds((prev) => {
        const next = new Set(prev);
        next.delete(campanhaId);
        return next;
      });
    },
  });

  const agendarMutation = useMutation({
    mutationFn: async ({ id, agendar }: { id: string; agendar: boolean }) => {
      const novoStatus = agendar ? "agendado" : "pendente";
      const { error } = await supabase
        .from("disparos_campanhas")
        .update({ status: novoStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { agendar };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      toast.success(data.agendar ? "Disparo agendado." : "Agendamento removido.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (selectedCampanha) {
    return <DisparosContatosPanel campanha={selectedCampanha} onBack={() => setSelectedCampanha(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold">Monitor de Disparos Zap</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe disparos em andamento. Novos disparos são criados pelo dossiê da proposta (aba Zap).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="mostrar-inativos" checked={mostrarInativos} onCheckedChange={setMostrarInativos} />
          <Label htmlFor="mostrar-inativos" className="text-sm cursor-pointer">Mostrar inativos</Label>
        </div>
      </div>

      {/* Aviso de novo modelo */}
      <Card className="p-4 border-primary/30 bg-primary/5 flex gap-3 items-start">
        <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">Novo modelo de disparos</p>
          <p className="text-muted-foreground">
            O envio é controlado pelo n8n (cron externo) que consome o endpoint GET <code className="text-xs bg-muted px-1 rounded">/disparos-zap-pendentes</code>.
            Para iniciar um disparo, abra a campanha → proposta → aba <strong>Zap</strong> e clique em <strong>"Adicionar disparo Zap"</strong>.
          </p>
        </div>
      </Card>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : campanhas.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nenhum disparo ativo.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campanhas.map((campanha) => {
            const config = statusConfig[campanha.status] || statusConfig.pendente;
            const progresso = campanha.total_contatos > 0
              ? Math.round((campanha.enviados / campanha.total_contatos) * 100)
              : 0;
            const mensagemProposta = propostasParaMensagem.find(p => p.id === campanha.proposta_id)?.observacoes;
            const mensagemExibir = campanha.texto_ia || mensagemProposta;

            return (
              <Card key={campanha.id} className={`p-4 ${!campanha.ativo ? 'opacity-60 bg-muted/50' : ''}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold">{campanha.nome}</h3>
                    <Badge variant={config.variant}>{config.label}</Badge>
                    {!campanha.ativo && (
                      <Badge variant="secondary" className="gap-1">
                        <PowerOff className="h-3 w-3" />Inativo
                      </Badge>
                    )}
                    {campanha.ia_ativa && (
                      <Badge variant="outline" className="gap-1">
                        <Bot className="h-3 w-3" />IA Ativa
                      </Badge>
                    )}
                    {canSwitchInstance ? (
                      <Select
                        value={chips.find(c => c.instance_name === campanha.instancia)?.id || ""}
                        onValueChange={(newChipId) => {
                          if (newChipId && newChipId !== chips.find(c => c.instance_name === campanha.instancia)?.id) {
                            trocarInstanciaMutation.mutate({ campanhaId: campanha.id, chipId: newChipId });
                          }
                        }}
                        disabled={trocarInstanciaMutation.isPending}
                      >
                        <SelectTrigger className="w-auto h-7 text-xs gap-1">
                          <Send className="h-3 w-3" />
                          <SelectValue placeholder="Selecionar instância">
                            {campanha.instancia || "Sem instância"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {chips.map((chip) => {
                            const instancia = chip.instance_name || null;
                            const bloqueada = !!instancia && instanciasEmUsoSet.has(instancia) && instancia !== campanha.instancia;
                            return (
                              <SelectItem key={chip.id} value={chip.id} disabled={bloqueada}>
                                {chip.nome} - {instancia || chip.numero}{bloqueada ? " (em uso)" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : campanha.instancia ? (
                      <Badge variant="outline" className="gap-1">
                        <Send className="h-3 w-3" />{campanha.instancia}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" /><span>{campanha.total_contatos}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" /><span>{campanha.enviados}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-yellow-600">
                      <AlertTriangle className="h-4 w-4" /><span>{campanha.nozap}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-red-600">
                      <XCircle className="h-4 w-4" /><span>{campanha.falhas}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => dispararMutation.mutate(campanha.id)}
                      disabled={dispararMutation.isPending || !campanha.ativo || campanha.total_contatos === 0}
                      title="Disparar agora (envia lote ao n8n)"
                    >
                      <Rocket className="h-4 w-4 mr-1" />
                      Disparar
                    </Button>
                    <Button
                      variant={campanha.status === "agendado" ? "secondary" : "outline"}
                      size="sm"
                      onClick={() =>
                        agendarMutation.mutate({
                          id: campanha.id,
                          agendar: campanha.status !== "agendado",
                        })
                      }
                      disabled={agendarMutation.isPending}
                      title={campanha.status === "agendado" ? "Remover agendamento" : "Agendar"}
                    >
                      <Clock className="h-4 w-4 mr-1" />
                      {campanha.status === "agendado" ? "Agendado" : "Agendar"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedCampanha(campanha)}>
                      <Eye className="h-4 w-4 mr-1" />Ver
                    </Button>
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir disparo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Todos os contatos serão removidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletarMutation.mutate(campanha.id)}
                              className="bg-destructive text-destructive-foreground"
                            >Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={campanha.ia_ativa ? "default" : "ghost"}
                            size="sm"
                            onClick={() => toggleIAMutation.mutate({ id: campanha.id, ia_ativa: !campanha.ia_ativa })}
                            disabled={toggleIAMutation.isPending}
                          >
                            <Bot className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {campanha.ia_ativa ? "Desativar IA de auto-resposta" : "Ativar IA de auto-resposta"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      variant={campanha.ativo ? "ghost" : "outline"}
                      size="sm"
                      onClick={() => toggleAtivoMutation.mutate({ id: campanha.id, ativo: !campanha.ativo })}
                      disabled={toggleAtivoMutation.isPending}
                      title={campanha.ativo ? "Inativar" : "Ativar"}
                    >
                      {campanha.ativo ? (
                        <PowerOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Power className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-col lg:flex-row gap-4">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Disparo: {campanha.id?.slice(0, 8)} | Proposta: {campanha.proposta_id?.slice(0, 8) || "N/A"}</p>
                    <p className="text-xs">
                      Criado por {campanha.responsavel_nome} em {new Date(campanha.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {mensagemExibir && (
                    <div className="flex-1 bg-primary/10 border border-primary/20 p-3 rounded-lg">
                      <p className="text-xs font-semibold text-primary mb-1">Mensagem:</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{mensagemExibir}</p>
                    </div>
                  )}
                </div>

                {campanha.total_contatos > 0 && (
                  <div className="mt-3">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${progresso}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {progresso}% concluído ({campanha.enviados} de {campanha.total_contatos})
                    </p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
