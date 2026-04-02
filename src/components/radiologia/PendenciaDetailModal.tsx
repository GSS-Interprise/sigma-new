import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toLocalTime } from "@/lib/dateUtils";
import { 
  Clock, 
  CheckCircle2, 
  Mail, 
  FileText, 
  MessageSquare, 
  Paperclip,
  AlertCircle,
  User,
  Calendar,
  EyeOff
} from "lucide-react";
import { ImageUpload } from "./ImageUpload";

interface PendenciaDetailModalProps {
  pendenciaId: string | null;
  open: boolean;
  onClose: () => void;
}

export function PendenciaDetailModal({ pendenciaId, open, onClose }: PendenciaDetailModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [comentario, setComentario] = useState("");
  const [anexosComentario, setAnexosComentario] = useState<string[]>([]);
  const [descricaoResolucao, setDescricaoResolucao] = useState("");
  const [confirmResolverOpen, setConfirmResolverOpen] = useState(false);

  // Buscar detalhes da pendência
  const { data: pendencia, isLoading } = useQuery({
    queryKey: ["pendencia-detail", pendenciaId],
    queryFn: async () => {
      if (!pendenciaId) return null;
      
      const { data, error } = await supabase
        .from("radiologia_pendencias")
        .select(`
          *,
          clientes:cliente_id (nome_empresa),
          medicos!medico_id (nome_completo, email),
          medico_atribuido:medicos!medico_atribuido_id (nome_completo, email)
        `)
        .eq("id", pendenciaId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!pendenciaId && open,
  });

  // Buscar histórico
  const { data: historico = [] } = useQuery({
    queryKey: ["pendencia-historico", pendenciaId],
    queryFn: async () => {
      if (!pendenciaId) return [];
      
      const { data, error } = await supabase
        .from("radiologia_pendencias_historico")
        .select("*")
        .eq("pendencia_id", pendenciaId)
        .order("data_hora", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!pendenciaId && open,
  });

  // Buscar comentários
  const { data: comentarios = [] } = useQuery({
    queryKey: ["pendencia-comentarios", pendenciaId],
    queryFn: async () => {
      if (!pendenciaId) return [];
      
      const { data, error } = await supabase
        .from("radiologia_pendencias_comentarios")
        .select("*")
        .eq("pendencia_id", pendenciaId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!pendenciaId && open,
  });

  // Mutation para adicionar comentário
  const adicionarComentarioMutation = useMutation({
    mutationFn: async () => {
      if (!pendenciaId || !comentario.trim()) return;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", user?.id)
        .single();

      const { error: comentarioError } = await supabase
        .from("radiologia_pendencias_comentarios")
        .insert({
          pendencia_id: pendenciaId,
          usuario_id: user?.id,
          usuario_nome: profile?.nome_completo || "Usuário",
          comentario: comentario,
          anexos: anexosComentario,
        });

      if (comentarioError) throw comentarioError;

      // Registrar no histórico
      await supabase.from("radiologia_pendencias_historico").insert({
        pendencia_id: pendenciaId,
        usuario_id: user?.id,
        usuario_nome: profile?.nome_completo || "Usuário",
        acao: "comentario_adicionado",
        detalhes: comentario.substring(0, 100),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendencia-comentarios", pendenciaId] });
      queryClient.invalidateQueries({ queryKey: ["pendencia-historico", pendenciaId] });
      setComentario("");
      setAnexosComentario([]);
      toast({ title: "Comentário adicionado com sucesso!" });
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao adicionar comentário", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Mutation para marcar como resolvida
  const resolverPendenciaMutation = useMutation({
    mutationFn: async () => {
      if (!pendenciaId) return;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .single();

      const { error } = await supabase
        .from("radiologia_pendencias")
        .update({
          status_pendencia: "resolvida",
          data_resolucao: new Date().toISOString(),
          descricao_resolucao: descricaoResolucao,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendenciaId);

      if (error) throw error;

      // Registrar no histórico
      await supabase.from("radiologia_pendencias_historico").insert({
        pendencia_id: pendenciaId,
        usuario_id: user?.id,
        usuario_nome: profile?.nome_completo || "Usuário",
        acao: "marcada_resolvida",
        detalhes: descricaoResolucao,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia-pendencias"] });
      queryClient.invalidateQueries({ queryKey: ["pendencia-detail", pendenciaId] });
      queryClient.invalidateQueries({ queryKey: ["pendencia-historico", pendenciaId] });
      toast({ title: "Pendência resolvida com sucesso!" });
      onClose();
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao resolver pendência", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Mutation para ignorar/desigNorar pendência
  const toggleIgnoradaMutation = useMutation({
    mutationFn: async (ignorar: boolean) => {
      if (!pendenciaId) return;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .single();

      const { error } = await supabase
        .from("radiologia_pendencias")
        .update({
          ignorada: ignorar,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendenciaId);

      if (error) throw error;

      // Registrar no histórico
      await supabase.from("radiologia_pendencias_historico").insert({
        pendencia_id: pendenciaId,
        usuario_id: user?.id,
        usuario_nome: profile?.nome_completo || "Usuário",
        acao: ignorar ? "pendencia_ignorada" : "pendencia_reativada",
        detalhes: ignorar ? "Pendência marcada como ignorada" : "Pendência reativada",
      });
    },
    onSuccess: (_, ignorar) => {
      queryClient.invalidateQueries({ queryKey: ["radiologia-pendencias"] });
      queryClient.invalidateQueries({ queryKey: ["pendencia-detail", pendenciaId] });
      queryClient.invalidateQueries({ queryKey: ["pendencia-historico", pendenciaId] });
      toast({ 
        title: ignorar ? "Pendência ignorada" : "Pendência reativada",
        description: ignorar 
          ? "Esta pendência será excluída dos relatórios e métricas" 
          : "Esta pendência voltou a ser considerada nos relatórios"
      });
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao atualizar pendência", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Mutation para notificar médico
  const notificarMedicoMutation = useMutation({
    mutationFn: async () => {
      if (!pendencia || !pendencia.medicos) return;

      const response = await supabase.functions.invoke("notify-radiologia-pendencia", {
        body: {
          pendenciaId: pendencia.id,
          medicoEmail: pendencia.medicos.email,
          medicoNome: pendencia.medicos.nome_completo,
          clienteNome: pendencia.clientes.nome_empresa,
          segmento: pendencia.segmento,
          quantidadePendente: pendencia.quantidade_pendente,
          descricaoInicial: pendencia.descricao_inicial,
          prazoLimiteSla: pendencia.prazo_limite_sla,
        },
      });

      if (response.error) throw response.error;
    },
    onSuccess: () => {
      toast({ title: "Médico notificado com sucesso!" });
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao notificar médico", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  if (!pendencia || isLoading) return null;

  const statusColors: Record<string, string> = {
    aberta: "bg-gray-500",
    em_analise: "bg-yellow-500",
    encaminhada_medico: "bg-blue-500",
    aguardando_laudo: "bg-purple-500",
    resolvida: "bg-green-500",
  };

  const statusLabels: Record<string, string> = {
    aberta: "Aberta",
    em_analise: "Em Análise",
    encaminhada_medico: "Encaminhada ao Médico",
    aguardando_laudo: "Aguardando Laudo",
    resolvida: "Resolvida",
  };

  const isPrazoVencido = new Date() > toLocalTime(pendencia.prazo_limite_sla);
  const tempoAberto = pendencia.data_resolucao
    ? formatDistanceToNow(toLocalTime(pendencia.data_deteccao), { 
        locale: ptBR, 
        addSuffix: false 
      })
    : formatDistanceToNow(toLocalTime(pendencia.data_deteccao), { 
        locale: ptBR, 
        addSuffix: true 
      });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Detalhes da Pendência</span>
            <div className="flex items-center gap-3">
              {pendencia.ignorada && (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  <EyeOff className="mr-1 h-3 w-3" />
                  Ignorada
                </Badge>
              )}
              <Badge className={statusColors[pendencia.status_pendencia]}>
                {statusLabels[pendencia.status_pendencia]}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Checkbox para ignorar pendência */}
        <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg border">
          <Checkbox
            id="ignorar-pendencia"
            checked={pendencia.ignorada || false}
            onCheckedChange={(checked) => toggleIgnoradaMutation.mutate(checked === true)}
            disabled={toggleIgnoradaMutation.isPending}
          />
          <Label 
            htmlFor="ignorar-pendencia" 
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Ignorar esta pendência nos dados e relatórios
          </Label>
          {toggleIgnoradaMutation.isPending && (
            <span className="text-xs text-muted-foreground ml-2">Salvando...</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 p-4 bg-muted rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="font-medium truncate">{pendencia.clientes?.nome_empresa || "Sem cliente"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Médico Prescritor</p>
              <p className="font-medium truncate">{pendencia.medicos?.nome_completo || "Sem médico"}</p>
            </div>
          </div>
          {(pendencia.medico_atribuido || pendencia.medico_atribuido_nome) && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Médico Atribuído</p>
                <p className="font-medium truncate">
                  {pendencia.medico_atribuido?.nome_completo || pendencia.medico_atribuido_nome || "-"}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">ID Paciente</p>
              <p className="font-medium truncate">{pendencia.id_paciente || "-"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Código de Acesso</p>
              <p className="font-medium truncate">{pendencia.cod_acesso || "-"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Segmento</p>
              <p className="font-medium truncate">{pendencia.segmento}</p>
            </div>
          </div>
          {pendencia.sla && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">SLA</p>
                <p className="font-medium truncate">{pendencia.sla} ({pendencia.sla_horas}h)</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Data de Detecção</p>
              <p className="font-medium truncate">
                {format(toLocalTime(pendencia.data_deteccao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Tempo Aberto</p>
              <p className="font-medium truncate">{tempoAberto}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPrazoVencido && <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />}
            {!isPrazoVencido && <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Prazo Limite (SLA)</p>
              <p className={`font-medium truncate ${isPrazoVencido ? "text-destructive" : ""}`}>
                {format(toLocalTime(pendencia.prazo_limite_sla), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
        </div>

        {pendencia.status_pendencia !== "resolvida" && (
          <div className="flex gap-2">
            <Button
              onClick={() => setConfirmResolverOpen(true)}
              disabled={resolverPendenciaMutation.isPending}
              className="flex-1"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar como Resolvida
            </Button>
            {pendencia.medicos && (
              <Button
                onClick={() => notificarMedicoMutation.mutate()}
                disabled={notificarMedicoMutation.isPending}
                variant="outline"
                className="flex-1"
              >
                <Mail className="mr-2 h-4 w-4" />
                Notificar Médico
              </Button>
            )}
          </div>
        )}

        <Tabs defaultValue="resumo" className="w-full flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="comentarios">Comentários</TabsTrigger>
            <TabsTrigger value="anexos">Anexos</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto min-h-0 mt-2">
          <TabsContent value="resumo" className="space-y-4 mt-0">
            <div>
              <h3 className="font-semibold mb-2">Descrição Inicial</h3>
              <p className="text-sm text-muted-foreground">
                {pendencia.descricao_inicial || "Sem descrição"}
              </p>
            </div>

            {pendencia.observacoes_internas && (
              <div>
                <h3 className="font-semibold mb-2">Observações Internas</h3>
                <p className="text-sm text-muted-foreground">
                  {pendencia.observacoes_internas}
                </p>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Quantidade Pendente</h3>
              <p className="text-sm text-muted-foreground">
                {pendencia.quantidade_pendente} laudo(s)
              </p>
            </div>

            {pendencia.status_pendencia === "resolvida" && (
              <div>
                <h3 className="font-semibold mb-2">Solução/Resolução</h3>
                <p className="text-sm text-muted-foreground">
                  {pendencia.descricao_resolucao || "Sem descrição de resolução"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Resolvida em: {format(toLocalTime(pendencia.data_resolucao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
            )}

            {pendencia.status_pendencia !== "resolvida" && (
              <div className="space-y-2">
                <h3 className="font-semibold">Descrição da Resolução</h3>
                <Textarea
                  placeholder="Descreva como a pendência foi resolvida..."
                  value={descricaoResolucao}
                  onChange={(e) => setDescricaoResolucao(e.target.value)}
                  rows={4}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-4 mt-0">
            <div className="space-y-4">
              {historico.map((item) => (
                <div key={item.id} className="flex gap-4 pb-4 border-b last:border-0">
                  <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-primary"></div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm">{item.usuario_nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(toLocalTime(item.data_hora), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <p className="text-sm text-primary font-medium">{item.acao}</p>
                    {item.detalhes && (
                      <p className="text-sm text-muted-foreground mt-1">{item.detalhes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="comentarios" className="space-y-4 mt-0">
            <div className="space-y-4">
              {comentarios.map((item) => (
                <div key={item.id} className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm">{item.usuario_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(toLocalTime(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <p className="text-sm">{item.comentario}</p>
                  {item.anexos && item.anexos.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {item.anexos.map((anexo, idx) => (
                        <a
                          key={idx}
                          href={anexo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Paperclip className="h-3 w-3" />
                          Anexo {idx + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Textarea
                placeholder="Adicionar comentário..."
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={3}
              />
              <ImageUpload
                value={anexosComentario}
                onChange={setAnexosComentario}
              />
              <Button
                onClick={() => adicionarComentarioMutation.mutate()}
                disabled={!comentario.trim() || adicionarComentarioMutation.isPending}
                className="w-full"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Adicionar Comentário
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="anexos" className="space-y-4 mt-0">
            {pendencia.anexos && pendencia.anexos.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {pendencia.anexos.map((anexo, idx) => (
                  <a
                    key={idx}
                    href={anexo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 border rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <Paperclip className="h-4 w-4" />
                    <span className="text-sm">Anexo {idx + 1}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum anexo disponível
              </p>
            )}
          </TabsContent>
          </div>
        </Tabs>
      </DialogContent>

      {/* Modal de Confirmação */}
      <AlertDialog open={confirmResolverOpen} onOpenChange={setConfirmResolverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Resolução</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja marcar esta pendência como resolvida? 
              Esta ação não poderá ser desfeita facilmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resolverPendenciaMutation.mutate();
                setConfirmResolverOpen(false);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
