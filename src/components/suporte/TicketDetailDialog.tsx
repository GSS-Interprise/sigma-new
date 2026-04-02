import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Clock, User, FileText, Download, Paperclip, MessageSquare, Send, Eye, CheckCircle, XCircle, Upload, X, AlertTriangle, UserCog, Shield, Target } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { FileViewerDialog } from "./FileViewerDialog";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/usePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TicketDetailDialogProps {
  ticketId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_COLORS = {
  aberto: "bg-gray-500",
  pendente: "bg-yellow-500",
  em_analise: "bg-blue-500",
  aguardando_usuario: "bg-orange-500",
  em_validacao: "bg-purple-500",
  aguardando_confirmacao: "bg-cyan-500",
  resolvido: "bg-emerald-500",
  concluido: "bg-green-500",
};

const STATUS_LABELS = {
  aberto: "Aberto",
  pendente: "Pendente",
  em_analise: "Em Análise",
  aguardando_usuario: "Aguardando Usuário",
  em_validacao: "Em Validação",
  aguardando_confirmacao: "Aguardando Confirmação",
  resolvido: "Resolvido",
  concluido: "Concluído",
};

const URGENCIA_CONFIG = {
  critica: { label: "Crítica", color: "bg-red-600 text-white", sla: "15min / 4h" },
  alta: { label: "Alta", color: "bg-orange-500 text-white", sla: "12h / 24h" },
  media: { label: "Média", color: "bg-yellow-500 text-black", sla: "24h / 48h" },
  baixa: { label: "Baixa", color: "bg-green-500 text-white", sla: "48h / 72h" },
};

const TIPO_IMPACTO_OPTIONS = [
  { value: "sistema", label: "Sistema" },
  { value: "infraestrutura", label: "Infraestrutura" },
  { value: "acesso_permissao", label: "Acesso / Permissão" },
  { value: "integracao", label: "Integração" },
  { value: "duvida_operacional", label: "Dúvida / Operacional" },
  { value: "melhoria", label: "Melhoria" },
];

export function TicketDetailDialog({ ticketId, open, onOpenChange }: TicketDetailDialogProps) {
  const { user } = useAuth();
  const { isAdmin, userRoles } = usePermissions();
  const isExterno = userRoles?.some(r => r.role === 'externos');
  const hasFullAccess = isAdmin || isExterno;
  const queryClient = useQueryClient();
  const [novoComentario, setNovoComentario] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [anexosComentario, setAnexosComentario] = useState<File[]>([]);

  const { data: ticket } = useQuery({
    queryKey: ['ticket-detail', ticketId],
    enabled: !!ticketId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suporte_tickets')
        .select('*')
        .eq('id', ticketId!)
        .single();
      
      if (error) throw error;
      
      // Marcar como visualizado pelo admin quando abrir
      await supabase
        .from('suporte_tickets')
        .update({ ultima_visualizacao_admin: new Date().toISOString() })
        .eq('id', ticketId!);
      
      // Invalidar queries para atualizar os indicadores
      queryClient.invalidateQueries({ queryKey: ['admin-tickets-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['tickets-comentarios-count'] });
      
      // Buscar setor do solicitante se não tiver setor_nome no ticket
      if (!data.setor_nome && data.solicitante_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('setores(nome)')
          .eq('id', data.solicitante_id)
          .single();
        
        return {
          ...data,
          setor_atualizado: profile?.setores?.nome
        } as any;
      }
      
      return data;
    },
  });

  // Buscar analistas disponíveis: setor TI + qualquer um com role 'externos' (Encerramento de Tickets)
  const { data: analistasTI = [] } = useQuery({
    queryKey: ['analistas-ti'],
    queryFn: async (): Promise<{ id: string; nome_completo: string | null; email: string | null }[]> => {
      // 1. Buscar usuários do setor TI
      const setoresResult = await supabase.from('setores').select('id, nome');
      const setorTI = (setoresResult.data || []).find((s) => {
        const nome = s.nome?.toLowerCase() || '';
        return nome.includes('tecnologia') || nome === 'ti';
      });

      const tiProfilesPromise = setorTI
        ? supabase.from('profiles').select('id, nome_completo, email, status').eq('setor_id', setorTI.id)
        : Promise.resolve({ data: [], error: null });

      // 2. Buscar usuários com role 'externos' (Encerramento de Tickets)
      const externosRolesPromise = supabase.from('user_roles').select('user_id').eq('role', 'externos');

      const [tiRes, externosRes] = await Promise.all([tiProfilesPromise, externosRolesPromise]);

      const userMap = new Map<string, { id: string; nome_completo: string | null; email: string | null }>();

      // Adicionar usuários de TI ativos
      (tiRes.data || []).filter((p: any) => p.status === 'ativo').forEach((p: any) => userMap.set(p.id, p));

      // Adicionar usuários com role externos
      const externosIds = (externosRes.data || []).map((r: any) => r.user_id);
      if (externosIds.length > 0) {
        const { data: externosProfiles } = await supabase
          .from('profiles')
          .select('id, nome_completo, email, status')
          .in('id', externosIds);
        (externosProfiles || []).filter((p: any) => p.status === 'ativo').forEach((p: any) => userMap.set(p.id, p));
      }

      return Array.from(userMap.values()).sort((a, b) => (a.nome_completo || '').localeCompare(b.nome_completo || ''));
    },
  });

  const { data: comentarios = [] } = useQuery({
    queryKey: ['ticket-comentarios', ticketId],
    enabled: !!ticketId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suporte_comentarios')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Mutation para atualizar campos de gestão TI
  const updateGestaoTIMutation = useMutation({
    mutationFn: async (updates: {
      nivel_urgencia?: 'critica' | 'alta' | 'media' | 'baixa';
      tipo_impacto?: 'sistema' | 'infraestrutura' | 'acesso_permissao' | 'integracao' | 'duvida_operacional' | 'melhoria';
      responsavel_ti_id?: string | null;
      responsavel_ti_nome?: string | null;
    }) => {
      const { error } = await supabase
        .from('suporte_tickets')
        .update({
          ...updates,
          data_ultima_atualizacao: new Date().toISOString(),
        })
        .eq('id', ticketId!);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket atualizado");
      queryClient.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['admin-tickets-kanban'] });
    },
    onError: (error) => {
      toast.error("Erro ao atualizar ticket");
      console.error(error);
    },
  });

  const handleUrgenciaChange = (value: string) => {
    updateGestaoTIMutation.mutate({ nivel_urgencia: value as 'critica' | 'alta' | 'media' | 'baixa' });
  };

  const handleTipoImpactoChange = (value: string) => {
    updateGestaoTIMutation.mutate({ tipo_impacto: value as 'sistema' | 'infraestrutura' | 'acesso_permissao' | 'integracao' | 'duvida_operacional' | 'melhoria' });
  };

  const handleResponsavelChange = (responsavelId: string) => {
    const analista = analistasTI.find(a => a.id === responsavelId);
    updateGestaoTIMutation.mutate({
      responsavel_ti_id: responsavelId,
      responsavel_ti_nome: analista?.nome_completo || null,
    });
  };

  // Calcular status do SLA
  const getSlaInfo = () => {
    if (!ticket?.sla_resolucao_minutos || ticket?.status === 'concluido') return null;
    
    const abertura = new Date(ticket.data_abertura);
    const agora = new Date();
    const minutosPassados = differenceInMinutes(agora, abertura);
    const percentual = (minutosPassados / ticket.sla_resolucao_minutos) * 100;
    const minutosRestantes = ticket.sla_resolucao_minutos - minutosPassados;
    
    const formatTempo = (minutos: number) => {
      if (minutos < 0) return 'Vencido';
      const horas = Math.floor(Math.abs(minutos) / 60);
      const mins = Math.abs(minutos) % 60;
      return horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;
    };
    
    return {
      percentual,
      tempoRestante: formatTempo(minutosRestantes),
      vencido: percentual >= 100,
      critico: percentual >= 75,
    };
  };

  const confirmarResolucaoMutation = useMutation({
    mutationFn: async (resolvido: boolean) => {
      console.log('=== INICIANDO CONFIRMAÇÃO DE RESOLUÇÃO ===');
      console.log('Ticket ID:', ticketId);
      console.log('User ID:', user?.id);
      console.log('Resolvido:', resolvido);
      
      if (!ticketId) {
        throw new Error('ID do ticket não encontrado');
      }

      if (!user?.id) {
        throw new Error('Usuário não autenticado');
      }

      const novoStatus = resolvido ? 'concluido' : 'em_analise';
      console.log('Novo status:', novoStatus);
      
      const { error: updateError } = await supabase
        .from('suporte_tickets')
        .update({ 
          status: novoStatus,
          data_ultima_atualizacao: new Date().toISOString(),
          ...(resolvido && { data_conclusao: new Date().toISOString() })
        })
        .eq('id', ticketId);

      if (updateError) {
        console.error('Erro ao atualizar ticket:', updateError);
        throw updateError;
      }

      console.log('Ticket atualizado com sucesso');

      // Buscar perfil do usuário para obter o nome
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.warn('Erro ao buscar perfil:', profileError);
      }

      const autorNome = profile?.nome_completo || user?.email || 'Usuário';
      console.log('Autor do comentário:', autorNome);

      // Adicionar comentário automático
      const mensagemAutomatica = resolvido 
        ? `${autorNome} confirmou que o problema foi resolvido.`
        : `${autorNome} informou que o problema ainda persiste. O ticket foi reaberto.`;

      const { error: commentError } = await supabase
        .from('suporte_comentarios')
        .insert({
          ticket_id: ticketId,
          autor_id: user.id,
          autor_nome: autorNome,
          autor_email: user?.email || '',
          mensagem: mensagemAutomatica,
          is_externo: false,
        });

      if (commentError) {
        console.error('Erro ao adicionar comentário:', commentError);
        throw commentError;
      }

      console.log('Comentário adicionado com sucesso');
      console.log('=== CONFIRMAÇÃO CONCLUÍDA COM SUCESSO ===');
    },
    onSuccess: (_, resolvido) => {
      console.log('onSuccess chamado');
      toast.success(resolvido ? "Ticket concluído com sucesso!" : "Ticket reaberto. Por favor, informe o que ainda não funciona.");
      queryClient.invalidateQueries({ queryKey: ['ticket-comentarios', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-tickets-kanban'] });
    },
    onError: (error) => {
      console.error('=== ERRO NA CONFIRMAÇÃO ===');
      console.error('Erro:', error);
      toast.error("Erro ao atualizar o ticket: " + (error as Error).message);
    },
  });

  const adicionarComentarioMutation = useMutation({
    mutationFn: async (mensagem: string) => {
      console.log('=== INICIANDO ADIÇÃO DE COMENTÁRIO ===');
      console.log('User ID:', user?.id);
      console.log('Ticket ID:', ticketId);
      console.log('Mensagem:', mensagem);
      console.log('Anexos:', anexosComentario.length);
      
      // Buscar perfil do usuário para obter o nome
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo, email')
        .eq('id', user?.id)
        .single();

      const autorNome = profile?.nome_completo || user?.email || 'Usuário';

      // Upload de anexos se houver
      const anexosUrls: string[] = [];
      if (anexosComentario.length > 0) {
        console.log('Iniciando upload de', anexosComentario.length, 'arquivos');
        
        for (const file of anexosComentario) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${ticketId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          // CORRIGIDO: Usar pasta com user.id para atender às políticas RLS
          const filePath = `${user?.id}/${fileName}`;
          
          console.log('Fazendo upload do arquivo:', file.name);
          console.log('Caminho destino:', filePath);

          const { error: uploadError } = await supabase.storage
            .from('suporte-anexos')
            .upload(filePath, file);

          if (uploadError) {
            console.error('=== ERRO NO UPLOAD ===');
            console.error('Arquivo:', file.name);
            console.error('Caminho:', filePath);
            console.error('Erro:', uploadError);
            throw new Error(`Erro ao fazer upload de ${file.name}: ${uploadError.message}`);
          }
          
          console.log('Upload concluído:', filePath);
          anexosUrls.push(filePath);
        }
        
        console.log('Todos os arquivos foram enviados com sucesso');
      }

      const { error } = await supabase
        .from('suporte_comentarios')
        .insert({
          ticket_id: ticketId!,
          autor_id: user?.id,
          autor_nome: autorNome,
          autor_email: user?.email || '',
          mensagem,
          is_externo: false,
          anexos: anexosUrls.length > 0 ? anexosUrls : null,
        });

      if (error) throw error;

      // Atualizar data_ultima_atualizacao
      await supabase
        .from('suporte_tickets')
        .update({ data_ultima_atualizacao: new Date().toISOString() })
        .eq('id', ticketId!);

      // Enviar email de notificação para o solicitante (se não for o próprio autor)
      if (ticket && ticket.solicitante_id !== user?.id) {
        try {
          // Buscar email do solicitante
          const { data: solicitanteProfile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', ticket.solicitante_id)
            .single();

          if (solicitanteProfile?.email) {
            const { error: emailError } = await supabase.functions.invoke(
              "notify-ticket-comment",
              {
                body: {
                  ticketNumero: ticket.numero,
                  solicitanteNome: ticket.solicitante_nome,
                  solicitanteEmail: solicitanteProfile.email,
                  autorNome: autorNome,
                  mensagem: mensagem,
                  dataComentario: new Date().toISOString(),
                },
              }
            );

            if (emailError) {
              console.error("Erro ao enviar email de notificação:", emailError);
              // Não bloqueia o processo se falhar o email
            }
          }
        } catch (emailError) {
          console.error("Erro ao enviar email de notificação:", emailError);
          // Não bloqueia o processo se falhar o email
        }
      }
    },
    onSuccess: () => {
      console.log('=== COMENTÁRIO ADICIONADO COM SUCESSO ===');
      toast.success("Comentário adicionado com sucesso");
      setNovoComentario("");
      setAnexosComentario([]);
      queryClient.invalidateQueries({ queryKey: ['ticket-comentarios', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
    },
    onError: (error: any) => {
      console.error('=== ERRO AO ADICIONAR COMENTÁRIO ===');
      console.error('Erro completo:', error);
      console.error('Mensagem:', error?.message);
      console.error('Código:', error?.code);
      console.error('========================================');
      
      let friendlyError = 'Erro ao adicionar comentário';
      
      // Erros de permissão RLS
      if (error?.message?.includes('policy') || error?.message?.includes('permission') || error?.code === '42501') {
        friendlyError = 'Você não tem permissão para anexar arquivos neste ticket. Contate o administrador.';
      }
      
      // Erros de upload
      if (error?.message?.includes('upload') || error?.message?.includes('storage')) {
        friendlyError = `Erro ao fazer upload dos arquivos: ${error.message}`;
      }
      
      // Erros de tamanho de arquivo
      if (error?.message?.includes('size') || error?.message?.includes('large')) {
        friendlyError = 'Arquivo muito grande. O tamanho máximo permitido é 50MB.';
      }
      
      toast.error(friendlyError, { duration: 6000 });
    },
  });

  const handleAdicionarComentario = () => {
    if (!novoComentario.trim() && anexosComentario.length === 0) {
      toast.error("Digite uma mensagem ou adicione um anexo");
      return;
    }
    adicionarComentarioMutation.mutate(novoComentario);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAnexosComentario(prev => [...prev, ...files]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setAnexosComentario(prev => prev.filter((_, i) => i !== index));
  };

  const handleViewFile = (anexoPath: string) => {
    setSelectedFile(anexoPath);
    setFileViewerOpen(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setAnexosComentario(prev => [...prev, ...files]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageFiles = items
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null);
    
    if (imageFiles.length > 0) {
      setAnexosComentario(prev => [...prev, ...imageFiles]);
    }
  };

  const handleDownloadAnexo = async (anexoPath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('suporte-anexos')
        .download(anexoPath);

      if (error) throw error;

      // Extrair e formatar o nome do arquivo
      const fullFileName = anexoPath.split('/').pop() || 'anexo';
      // Remove o timestamp prefix e substitui underlines por espaços
      const cleanFileName = fullFileName.replace(/^\d+_/, '').replace(/_/g, ' ');
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = cleanFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download iniciado');
    } catch (error) {
      console.error('Erro ao baixar anexo:', error);
      toast.error('Erro ao baixar arquivo');
    }
  };

  if (!ticket) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-2xl">{ticket.numero}</DialogTitle>
            <Badge className={STATUS_COLORS[ticket.status as keyof typeof STATUS_COLORS]}>
              {STATUS_LABELS[ticket.status as keyof typeof STATUS_LABELS]}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Solicitante</p>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <p className="text-sm">{ticket.solicitante_nome}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Setor</p>
              <p className="text-sm">{ticket.setor_nome || (ticket as any).setor_atualizado || 'Sem setor'}</p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Data de Abertura</p>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <p className="text-sm">
                  {format(new Date(ticket.data_abertura), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Última Atualização</p>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <p className="text-sm">
                  {format(new Date(ticket.data_ultima_atualizacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Tipo</p>
              <Badge variant="outline">
                {ticket.tipo === 'software' ? 'Software' : 'Hardware'}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Destino</p>
              <Badge variant="outline">
                {ticket.destino === 'interno' ? 'Interno' : 'Externo'}
              </Badge>
            </div>
          </div>

          {/* Painel de Gestão TI (admins e externos) */}
          {hasFullAccess && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-medium">Gestão TI</p>
                  {ticket.nivel_urgencia && (
                    <Badge className={cn("ml-2", URGENCIA_CONFIG[ticket.nivel_urgencia as keyof typeof URGENCIA_CONFIG]?.color)}>
                      {URGENCIA_CONFIG[ticket.nivel_urgencia as keyof typeof URGENCIA_CONFIG]?.label}
                    </Badge>
                  )}
                </div>
                
                {/* SLA Info */}
                {(() => {
                  const slaInfo = getSlaInfo();
                  if (slaInfo) {
                    return (
                      <div className={cn(
                        "p-3 rounded-lg border flex items-center gap-3",
                        slaInfo.vencido ? "bg-red-50 border-red-200" : 
                        slaInfo.critico ? "bg-orange-50 border-orange-200" : 
                        "bg-green-50 border-green-200"
                      )}>
                        <AlertTriangle className={cn(
                          "h-5 w-5",
                          slaInfo.vencido ? "text-red-600" : 
                          slaInfo.critico ? "text-orange-500" : 
                          "text-green-600"
                        )} />
                        <div>
                          <p className={cn(
                            "text-sm font-medium",
                            slaInfo.vencido ? "text-red-700" : 
                            slaInfo.critico ? "text-orange-700" : 
                            "text-green-700"
                          )}>
                            {slaInfo.vencido ? "SLA Vencido" : `Tempo restante: ${slaInfo.tempoRestante}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            SLA: {ticket.sla_resposta_minutos && ticket.sla_resolucao_minutos 
                              ? `${ticket.sla_resposta_minutos < 60 ? `${ticket.sla_resposta_minutos}min` : `${Math.floor(ticket.sla_resposta_minutos / 60)}h`} resposta / ${ticket.sla_resolucao_minutos < 60 ? `${ticket.sla_resolucao_minutos}min` : `${Math.floor(ticket.sla_resolucao_minutos / 60)}h`} resolução`
                              : "Não definido"}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="grid grid-cols-3 gap-4">
                  {/* Nível de Urgência */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      Nível de Urgência *
                    </label>
                    <Select
                      value={ticket.nivel_urgencia || ""}
                      onValueChange={handleUrgenciaChange}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critica">
                          <span className="flex items-center gap-2">🔴 Crítica (15min/4h)</span>
                        </SelectItem>
                        <SelectItem value="alta">
                          <span className="flex items-center gap-2">🟠 Alta (12h/24h)</span>
                        </SelectItem>
                        <SelectItem value="media">
                          <span className="flex items-center gap-2">🟡 Média (24h/48h)</span>
                        </SelectItem>
                        <SelectItem value="baixa">
                          <span className="flex items-center gap-2">🟢 Baixa (48h/72h)</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {!ticket.nivel_urgencia && ticket.status !== 'aberto' && ticket.status !== 'concluido' && (
                      <p className="text-xs text-red-500">⚠️ Defina a urgência</p>
                    )}
                  </div>

                  {/* Tipo de Impacto */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Tipo de Impacto</label>
                    <Select
                      value={ticket.tipo_impacto || ""}
                      onValueChange={handleTipoImpactoChange}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPO_IMPACTO_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Responsável TI */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <UserCog className="h-3.5 w-3.5" />
                      Responsável TI
                    </label>
                    <Select
                      value={ticket.responsavel_ti_id || ""}
                      onValueChange={handleResponsavelChange}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {analistasTI.map((analista) => (
                          <SelectItem key={analista.id} value={analista.id}>
                            {analista.nome_completo || analista.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Info de urgência para não-admins/externos */}
          {!hasFullAccess && ticket.nivel_urgencia && (
            <>
              <Separator />
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Badge className={cn(URGENCIA_CONFIG[ticket.nivel_urgencia as keyof typeof URGENCIA_CONFIG]?.color)}>
                  {URGENCIA_CONFIG[ticket.nivel_urgencia as keyof typeof URGENCIA_CONFIG]?.label}
                </Badge>
                {ticket.responsavel_ti_nome && (
                  <span className="text-sm text-muted-foreground">
                    Responsável: <span className="font-medium text-foreground">{ticket.responsavel_ti_nome}</span>
                  </span>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Descrição */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <p className="text-sm font-medium">Descrição do Problema</p>
            </div>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{ticket.descricao}</p>
            </div>
          </div>

          {/* Anexos */}
          {ticket.anexos && ticket.anexos.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  <p className="text-sm font-medium">Anexos ({ticket.anexos.length})</p>
                </div>
                <div className="space-y-2">
                  {ticket.anexos.map((anexoPath: string, index: number) => {
                    // Extrair nome do arquivo e decodificar caracteres especiais
                    const fullFileName = anexoPath.split('/').pop() || `Anexo ${index + 1}`;
                    // Remove o timestamp prefix (formato: 1234567890_nome_arquivo.ext)
                    const fileName = fullFileName.replace(/^\d+_/, '');
                    // Substitui underlines por espaços para melhor legibilidade
                    const displayName = fileName.replace(/_/g, ' ');
                    
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => handleViewFile(anexoPath)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" title={displayName}>
                              {displayName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewFile(anexoPath)}
                            title="Visualizar arquivo"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownloadAnexo(anexoPath)}
                            title="Baixar arquivo"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Histórico de Comunicação */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <p className="text-sm font-medium">Histórico de Comunicação</p>
            </div>

            {comentarios.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {comentarios.map((comentario: any) => (
                  <div
                    key={comentario.id}
                    className={`p-4 rounded-lg border ${
                      comentario.is_externo
                        ? "bg-blue-50 border-blue-200"
                        : "bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {comentario.autor_nome}
                        </span>
                        {comentario.is_externo && (
                          <Badge variant="outline" className="text-xs">
                            Externo
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(comentario.created_at), "dd/MM/yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comentario.mensagem}</p>
                    
                    {/* Anexos do comentário */}
                    {comentario.anexos && comentario.anexos.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          Anexos:
                        </p>
                        <div className="space-y-1">
                          {comentario.anexos.map((anexoPath: string, index: number) => {
                            const fullFileName = anexoPath.split('/').pop() || `Anexo ${index + 1}`;
                            const fileName = fullFileName.replace(/^\d+_/, '');
                            const displayName = fileName.replace(/_/g, ' ');
                            
                            return (
                              <div
                                key={index}
                                className="flex items-center justify-between p-2 border rounded bg-background/50 hover:bg-background transition-colors text-xs cursor-pointer"
                                onClick={() => handleViewFile(anexoPath)}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="truncate" title={displayName}>
                                    {displayName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleViewFile(anexoPath)}
                                    title="Visualizar"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleDownloadAnexo(anexoPath)}
                                    title="Baixar"
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum comentário ainda
              </p>
            )}

            {/* Confirmação de Resolução ou Adicionar novo comentário */}
            {ticket.status === 'aguardando_confirmacao' && ticket.solicitante_id === user?.id ? (
              <div className="space-y-3 pt-2">
                <div className="bg-cyan-50 border-2 border-cyan-200 rounded-lg p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <MessageSquare className="h-6 w-6 text-cyan-600 flex-shrink-0 mt-1" />
                    <div>
                      <h4 className="font-semibold text-cyan-900 mb-1">
                        O atendente marcou este ticket como resolvido
                      </h4>
                      <p className="text-sm text-cyan-700">
                        A sua solicitação ({ticket.numero}) foi atendida?
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <Button
                      onClick={() => confirmarResolucaoMutation.mutate(true)}
                      disabled={confirmarResolucaoMutation.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-5 w-5 mr-2" />
                      Sim, o problema foi resolvido
                    </Button>
                    <Button
                      onClick={() => confirmarResolucaoMutation.mutate(false)}
                      disabled={confirmarResolucaoMutation.isPending}
                      variant="outline"
                      className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="h-5 w-5 mr-2" />
                      Não, o problema persiste
                    </Button>
                  </div>
                </div>
              </div>
            ) : ticket.status !== 'concluido' ? (
              <div 
                className="space-y-2 pt-2"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <Textarea
                  placeholder="Digite sua mensagem ou arraste arquivos aqui..."
                  value={novoComentario}
                  onChange={(e) => setNovoComentario(e.target.value)}
                  onPaste={handlePaste}
                  className="min-h-[100px]"
                />
                
                {anexosComentario.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {anexosComentario.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 bg-muted px-3 py-2 rounded-md text-sm">
                        <Paperclip className="h-4 w-4" />
                        <span className="truncate max-w-[200px]">{file.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0"
                          onClick={() => handleRemoveFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <div>
                    <Input
                      id="anexos-comentario"
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('anexos-comentario')?.click()}
                      disabled={adicionarComentarioMutation.isPending}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Adicionar Arquivos
                    </Button>
                  </div>
                  <Button
                    onClick={handleAdicionarComentario}
                    disabled={adicionarComentarioMutation.isPending || (!novoComentario.trim() && anexosComentario.length === 0)}
                    size="sm"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Enviar Mensagem
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="text-sm text-green-700 font-medium">
                  Ticket fechado com sucesso. Agradecemos sua confirmação!
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <FileViewerDialog
        filePath={selectedFile}
        open={fileViewerOpen}
        onOpenChange={setFileViewerOpen}
      />
    </Dialog>
  );
}
