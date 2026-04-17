import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Play, Pause, Eye, Trash2, UserPlus, Users, CheckCircle, XCircle, AlertTriangle, Clock, Send, Power, PowerOff, Bot } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { DisparosContatosPanel } from "./DisparosContatosPanel";
import { DisparosImportDialog } from "./DisparosImportDialog";
import { CampanhaPropostasVinculadas } from "./CampanhaPropostasVinculadas";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCampanha, setSelectedCampanha] = useState<Campanha | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [campanhaParaImportar, setCampanhaParaImportar] = useState<string | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [campanhaEmProcessamento, setCampanhaEmProcessamento] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();
  const { isCaptacaoLeader } = useCaptacaoPermissions();
  const canSwitchInstance = isAdmin || isCaptacaoLeader;

  // Form state
  const [propostaId, setPropostaId] = useState("");
  const [chipId, setChipId] = useState("");

  // Realtime subscription para campanhas
  useEffect(() => {
    const channel = supabase
      .channel("disparos-campanhas-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "disparos_campanhas",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
          queryClient.invalidateQueries({ queryKey: ["disparos-instancias-em-uso"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Buscar campanhas
  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["disparos-campanhas", mostrarInativos],
    queryFn: async () => {
      let query = supabase
        .from("disparos_campanhas")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (!mostrarInativos) {
        query = query.eq("ativo", true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Campanha[];
    },
  });

  // Buscar propostas para obter mensagens das campanhas antigas
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

  // Buscar chips para select
  const { data: chips = [] } = useQuery({
    queryKey: ["chips-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips")
        .select("*")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Instâncias em uso (há disparo não concluído)
  const { data: instanciasEmUso = [] } = useQuery({
    queryKey: ["disparos-instancias-em-uso"],
    queryFn: async () => {
      // Buscar campanhas que estão em andamento OU ativas com envios pendentes
      const { data, error } = await supabase
        .from("disparos_campanhas")
        .select("instancia, status, ativo, total_contatos, enviados")
        .not("instancia", "is", null);

      if (error) throw error;

      // Considerar como "em uso" se:
      // 1. Status pendente/em_andamento/pausado
      // 2. Ativo=true e ainda tem contatos não enviados
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

  // Buscar propostas disponíveis (apenas tipo 'zap' ou sem tipo definido)
  const { data: propostas = [] } = useQuery({
    queryKey: ["propostas-disponiveis-zap"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta")
        .select("id, id_proposta, descricao, observacoes, contrato_id, status, criado_em, tipo_disparo")
        .or("tipo_disparo.eq.zap,tipo_disparo.is.null")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Criar campanha
  const criarMutation = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", user?.id)
        .single();

      const chipSelecionado = chips.find((c) => c.id === chipId);
      const propostaSelecionada = propostas.find((p) => p.id === propostaId);

      const instanciaSelecionada = chipSelecionado?.instance_name || null;
      if (instanciaSelecionada && instanciasEmUsoSet.has(instanciaSelecionada)) {
        throw new Error(
          `A instância "${instanciaSelecionada}" já está em um disparo não concluído. Conclua/encerre o disparo atual ou selecione outro chip.`
        );
      }

      // Usar descrição da proposta como nome da campanha
      const nomeCampanha =
        propostaSelecionada?.descricao?.replace(/^Proposta de Captação\s*-\s*/i, "") ||
        propostaSelecionada?.id_proposta ||
        `Campanha ${propostaId.slice(0, 8)}`;

      const { error } = await supabase.from("disparos_campanhas").insert({
        nome: nomeCampanha,
        proposta_id: propostaId || null,
        texto_ia: propostaSelecionada?.observacoes || null,
        instancia: instanciaSelecionada,
        chip_id: chipId || null,
        responsavel_id: user?.id,
        responsavel_nome: profile?.nome_completo || "Usuário",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      queryClient.invalidateQueries({ queryKey: ["disparos-instancias-em-uso"] });
      toast.success("Campanha criada com sucesso!");
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Iniciar/Pausar campanha
  const acaoMutation = useMutation({
    mutationFn: async ({ campanhaId, acao }: { campanhaId: string; acao: string }) => {
      setCampanhaEmProcessamento(campanhaId);
      const { data, error } = await supabase.functions.invoke("disparos-webhook", {
        body: { campanha_id: campanhaId, acao },
      });
      if (error) throw error;
      // Verificar se a resposta contém erro (ex: contatos em TRATANDO)
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      setCampanhaEmProcessamento(null);
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      if (variables.acao === "iniciar") {
        const msg = data.proximo_envio
          ? `Disparo iniciado! ${data.contatos_enviados || 0} contatos enviados. Restantes agendados para o proximo dia.`
          : `Disparo iniciado! ${data.contatos_enviados || data.contatos?.length || 0} contatos na fila.`;
        toast.success(msg);
      } else if (variables.acao === "pausar") {
        const msg = data?.contatos_tratando > 0
          ? `Campanha pausada. ${data.contatos_tratando} contatos ainda em processamento.`
          : "Campanha pausada.";
        toast.success(msg);
      }
    },
    onError: (error: Error) => {
      setCampanhaEmProcessamento(null);
      toast.error(error.message);
    },
  });

  // Deletar campanha
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

  // Toggle ativo/inativo
  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("disparos_campanhas")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      toast.success(variables.ativo ? "Campanha ativada." : "Campanha inativada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Toggle IA ativa/inativa
  const toggleIAMutation = useMutation({
    mutationFn: async ({ id, ia_ativa }: { id: string; ia_ativa: boolean }) => {
      const { error } = await supabase
        .from("disparos_campanhas")
        .update({ ia_ativa })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      toast.success(variables.ia_ativa ? "IA de auto-resposta ativada." : "IA de auto-resposta desativada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Trocar instância da campanha
  const trocarInstanciaMutation = useMutation({
    mutationFn: async ({ campanhaId, chipId: newChipId }: { campanhaId: string; chipId: string }) => {
      const chipSelecionado = chips.find(c => c.id === newChipId);
      const novaInstancia = chipSelecionado?.instance_name || null;
      
      const { error } = await supabase
        .from("disparos_campanhas")
        .update({ 
          instancia: novaInstancia,
          chip_id: newChipId 
        })
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

  const resetForm = () => {
    setPropostaId("");
    setChipId("");
  };

  const handleImportarContatos = (campanhaId: string) => {
    setCampanhaParaImportar(campanhaId);
    setImportDialogOpen(true);
  };

  if (selectedCampanha) {
    return (
      <DisparosContatosPanel
        campanha={selectedCampanha}
        onBack={() => setSelectedCampanha(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold">Campanhas de Disparo</h2>
          <p className="text-sm text-muted-foreground">Gerencie suas campanhas de WhatsApp</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="mostrar-inativos"
              checked={mostrarInativos}
              onCheckedChange={setMostrarInativos}
            />
            <Label htmlFor="mostrar-inativos" className="text-sm cursor-pointer">
              Mostrar inativos
            </Label>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Campanha
              </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Nova Campanha</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Proposta *</Label>
                <Select value={propostaId} onValueChange={setPropostaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma proposta" />
                  </SelectTrigger>
                  <SelectContent>
                    {propostas.map((proposta) => {
                      const descricaoLimpa = proposta.descricao?.replace(/^Proposta de Captação\s*-\s*/i, "") || "";
                      return (
                        <SelectItem key={proposta.id} value={proposta.id}>
                          {proposta.id_proposta || descricaoLimpa || `Proposta ${proposta.id.slice(0, 8)}`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chip/Instância Evolution</Label>
                <Select value={chipId} onValueChange={setChipId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um chip" />
                  </SelectTrigger>
                  <SelectContent>
                    {chips.map((chip) => {
                      const instancia = chip.instance_name || null;
                      const bloqueada = !!instancia && instanciasEmUsoSet.has(instancia);

                      return (
                        <SelectItem key={chip.id} value={chip.id} disabled={bloqueada}>
                          {chip.nome} - {instancia || chip.numero}
                          {bloqueada ? " (em uso)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Chips marcados como “em uso” já estão vinculados a um disparo pendente/pausado/em andamento.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => criarMutation.mutate()}
                disabled={!propostaId || criarMutation.isPending}
              >
                {criarMutation.isPending ? "Criando..." : "Criar Campanha"}
              </Button>
            </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

      {/* Lista de campanhas */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : campanhas.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nenhuma campanha criada ainda.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campanhas.map((campanha) => {
            const config = statusConfig[campanha.status] || statusConfig.pendente;
            const progresso = campanha.total_contatos > 0
              ? Math.round((campanha.enviados / campanha.total_contatos) * 100)
              : 0;

            // Obter mensagem: priorizar texto_ia salvo, senão buscar da proposta
            const mensagemProposta = propostasParaMensagem.find(p => p.id === campanha.proposta_id)?.observacoes;
            const mensagemExibir = campanha.texto_ia || mensagemProposta;

            return (
              <Card key={campanha.id} className={`p-4 ${!campanha.ativo ? 'opacity-60 bg-muted/50' : ''}`}>
                {/* Cabeçalho com título, instância, métricas e ações */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold">{campanha.nome}</h3>
                    <Badge variant={config.variant}>{config.label}</Badge>
                    {!campanha.ativo && (
                      <Badge variant="secondary" className="gap-1">
                        <PowerOff className="h-3 w-3" />
                        Inativo
                      </Badge>
                    )}
                    {campanha.ia_ativa && (
                      <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
                        <Bot className="h-3 w-3" />
                        IA Ativa
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
                        <SelectTrigger className="w-auto h-7 text-xs gap-1 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20">
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
                                {chip.nome} - {instancia || chip.numero}
                                {bloqueada ? " (em uso)" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : campanha.instancia ? (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
                        <Send className="h-3 w-3" />
                        {campanha.instancia}
                      </Badge>
                    ) : null}
                  </div>

                  {/* Métricas */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{campanha.total_contatos}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>{campanha.enviados}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-yellow-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{campanha.nozap}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-orange-600">
                      <Clock className="h-4 w-4" />
                      <span>{campanha.reenviar}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span>{campanha.falhas}</span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleImportarContatos(campanha.id)}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Adicionar Leads
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCampanha(campanha)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Ver
                    </Button>
                    {campanha.status === "pendente" || campanha.status === "pausado" ? (
                      <Button
                        size="sm"
                        onClick={() => acaoMutation.mutate({ campanhaId: campanha.id, acao: "iniciar" })}
                        disabled={campanha.total_contatos === 0 || campanhaEmProcessamento === campanha.id}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {campanhaEmProcessamento === campanha.id ? "Iniciando..." : "Iniciar"}
                      </Button>
                    ) : campanha.status === "em_andamento" || campanha.status === "agendado" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => acaoMutation.mutate({ campanhaId: campanha.id, acao: "pausar" })}
                        disabled={campanhaEmProcessamento === campanha.id}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        {campanhaEmProcessamento === campanha.id ? "Pausando..." : "Pausar"}
                      </Button>
                    ) : campanha.status === "concluido" && (campanha.total_contatos - campanha.enviados - campanha.nozap - campanha.falhas) > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acaoMutation.mutate({ campanhaId: campanha.id, acao: "iniciar" })}
                        disabled={campanhaEmProcessamento === campanha.id}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {campanhaEmProcessamento === campanha.id ? "Retomando..." : "Retomar"}
                      </Button>
                    ) : null}
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Todos os contatos serão removidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletarMutation.mutate(campanha.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Excluir
                            </AlertDialogAction>
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
                            className={campanha.ia_ativa ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
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
                      title={campanha.ativo ? "Inativar campanha" : "Ativar campanha"}
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
                    <p className="text-xs">Criado por {campanha.responsavel_nome} em {new Date(campanha.created_at).toLocaleDateString("pt-BR")}</p>
                    {campanha.status === "agendado" && campanha.proximo_envio && (
                      <p className="text-xs font-medium text-blue-600 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Limite diario atingido (120) - proximo envio: {new Date(campanha.proximo_envio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </p>
                    )}
                  </div>
                  {mensagemExibir && (
                    <div className="flex-1 bg-primary/10 border border-primary/20 p-3 rounded-lg">
                      <p className="text-xs font-semibold text-primary mb-1">Mensagem a ser enviada:</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{mensagemExibir}</p>
                    </div>
                  )}
                </div>

                {/* Propostas vinculadas multi-canal */}
                <div className="mt-4 pt-4 border-t">
                  <CampanhaPropostasVinculadas campanhaId={campanha.id} />
                </div>

                {/* Progress bar */}
                {campanha.total_contatos > 0 && (
                  <div className="mt-3">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progresso}%` }}
                      />
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

      {/* Dialog de importação */}
      {campanhaParaImportar && (
        <DisparosImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          campanhaId={campanhaParaImportar}
          propostaId={campanhas.find(c => c.id === campanhaParaImportar)?.proposta_id}
          totalContatosAtual={campanhas.find(c => c.id === campanhaParaImportar)?.total_contatos || 0}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
            setImportDialogOpen(false);
            setCampanhaParaImportar(null);
          }}
        />
      )}
    </div>
  );
}
