import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PlusCircle, Image, X, Trash2, AlertTriangle, Ban, 
  Undo2, StickyNote, Calendar, User, Loader2, Send, FileText, MessageCircle, CheckCheck, Eye, UserX
} from "lucide-react";
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

interface LeadHistoricoAnotacoesSectionProps {
  leadId: string;
  phoneE164?: string | null;
  onConversaClick?: (conversaId: string) => void;
}

export function LeadHistoricoAnotacoesSection({ leadId, phoneE164, onConversaClick }: LeadHistoricoAnotacoesSectionProps) {
  const { user } = useAuth();
  const { isAdmin, isLeader } = usePermissions();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [imagensPreview, setImagensPreview] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch anotações
  const { data: anotacoes, isLoading: loadingAnotacoes } = useQuery({
    queryKey: ['lead-anotacoes', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_anotacoes')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });

  // Fetch eventos de desconversão e conversão do histórico
  const { data: eventosHistorico } = useQuery({
    queryKey: ['lead-historico-eventos', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_historico')
        .select('*')
        .eq('lead_id', leadId)
        .in('tipo_evento', ['desconvertido_para_lead', 'convertido_em_medico', 'outro'])
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });

  const desconversoes = eventosHistorico?.filter(e => e.tipo_evento === 'desconvertido_para_lead') || [];
  const conversoes = eventosHistorico?.filter(e => e.tipo_evento === 'convertido_em_medico') || [];
  const outrosEventos = eventosHistorico?.filter(e => e.tipo_evento === 'outro') || [];

  // Fetch blacklist entries by phone
  const { data: blacklistEntries } = useQuery({
    queryKey: ['lead-blacklist', phoneE164],
    queryFn: async () => {
      if (!phoneE164) return [];
      const { data, error } = await supabase
        .from('blacklist')
        .select('*')
        .eq('phone_e164', phoneE164)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!phoneE164,
  });

  // Fetch participação em campanhas de disparo (propostas)
  const { data: disparosParticipacao } = useQuery({
    queryKey: ['lead-disparos-participacao', leadId, phoneE164],
    queryFn: async () => {
      // Normalizar telefone: remover o + para buscar no banco
      const phoneNormalized = phoneE164?.replace(/^\+/, '');
      
      // Buscar contatos de disparo pelo lead_id OU telefone (para retrocompatibilidade)
      let query = supabase
        .from('disparos_contatos')
        .select(`
          id,
          status,
          data_envio,
          created_at,
          campanha_id,
          lead_id,
          mensagem_enviada
        `)
        .order('created_at', { ascending: false });

      // Buscar por lead_id OU telefone (normalizado sem +)
      if (phoneNormalized) {
        query = query.or(`lead_id.eq.${leadId},telefone_e164.eq.${phoneNormalized}`);
      } else {
        query = query.eq('lead_id', leadId);
      }
      
      const { data: contatos, error } = await query;
      
      if (error) throw error;
      if (!contatos || contatos.length === 0) return [];

      // Buscar dados das campanhas
      const campanhaIds = [...new Set(contatos.map(c => c.campanha_id))];
      const { data: campanhas } = await supabase
        .from('disparos_campanhas')
        .select('id, nome, proposta_id, instancia, responsavel_nome, created_at')
        .in('id', campanhaIds);

      // Buscar dados das propostas vinculadas às campanhas
      const propostaIds = campanhas?.map(c => c.proposta_id).filter(Boolean) || [];
      let propostasData: any[] = [];
      let propostaItensMap: Record<string, any[]> = {};
      
      if (propostaIds.length > 0) {
        // Buscar propostas
        const { data: propostas } = await supabase
          .from('proposta')
          .select('id, id_proposta, valor, descricao, observacoes, status')
          .in('id', propostaIds);
        propostasData = propostas || [];
        
        // Buscar itens das propostas (onde estão os valores reais)
        const { data: itens } = await supabase
          .from('proposta_itens')
          .select('proposta_id, item_nome, valor_medico, valor_contrato, quantidade')
          .in('proposta_id', propostaIds);
        
        // Agrupar itens por proposta_id
        (itens || []).forEach(item => {
          if (!propostaItensMap[item.proposta_id]) {
            propostaItensMap[item.proposta_id] = [];
          }
          propostaItensMap[item.proposta_id].push(item);
        });
      }

      // Combinar dados
      return contatos.map(contato => {
        const campanha = campanhas?.find(c => c.id === contato.campanha_id);
        const proposta = campanha?.proposta_id ? propostasData.find(p => p.id === campanha.proposta_id) : null;
        const propostaItens = campanha?.proposta_id ? propostaItensMap[campanha.proposta_id] || [] : [];
        return {
          ...contato,
          campanha,
          proposta,
          propostaItens
        };
      });
    },
    enabled: !!leadId,
  });

  // Fetch propostas vinculadas ao lead (tabela proposta) com itens
  const { data: propostasLead } = useQuery({
    queryKey: ['lead-propostas-historico', leadId],
    queryFn: async () => {
      const { data: propostas, error } = await supabase
        .from('proposta')
        .select(`
          id,
          id_proposta,
          valor,
          status,
          descricao,
          observacoes,
          criado_em,
          criado_por_nome,
          licitacao_id,
          contrato_id,
          unidade_id,
          contrato:contratos!proposta_contrato_id_fkey(id, codigo_contrato, cliente:clientes!contratos_cliente_id_fkey(nome_empresa))
        `)
        .eq('lead_id', leadId)
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      if (!propostas || propostas.length === 0) return [];
      
      // Buscar itens de todas as propostas
      const propostaIds = propostas.map(p => p.id);
      const { data: itens } = await supabase
        .from('proposta_itens')
        .select('proposta_id, item_nome, valor_medico, valor_contrato, quantidade')
        .in('proposta_id', propostaIds);
      
      // Agrupar itens por proposta_id
      const itensMap: Record<string, any[]> = {};
      (itens || []).forEach(item => {
        if (!itensMap[item.proposta_id]) {
          itensMap[item.proposta_id] = [];
        }
        itensMap[item.proposta_id].push(item);
      });
      
      // Combinar propostas com seus itens
      return propostas.map(p => ({
        ...p,
        itens: itensMap[p.id] || []
      }));
    },
    enabled: !!leadId,
  });

  // Fetch conversas SigZap vinculadas ao lead
  const { data: sigzapConversas } = useQuery({
    queryKey: ['lead-sigzap-conversas', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sigzap_conversations')
        .select(`
          id,
          status,
          last_message_at,
          last_message_text,
          unread_count,
          created_at,
          contact:sigzap_contacts(contact_name, contact_phone),
          instance:sigzap_instances(id, name),
          assigned_user:profiles!sigzap_conversations_assigned_user_id_fkey(nome_completo)
        `)
        .eq('lead_id', leadId)
        .order('last_message_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!leadId,
  });

  // Fetch visualizações de todos os usuários para este lead
  const { data: visualizacoes = [] } = useQuery({
    queryKey: ['lead-historico-visualizacoes', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_historico_visualizacoes' as any)
        .select('*')
        .eq('lead_id', leadId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!leadId,
  });

  // Timer ref for 2s delay before marking entries as viewed
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMarkedRef = useRef(false);

  // Function to mark all visible entries as viewed after 2s on tab
  const markEntriesAsViewed = useCallback(async (entries: { id: string; source: string }[]) => {
    if (!user?.id || !leadId || entries.length === 0) return;

    const userName = user?.user_metadata?.nome_completo || user?.email || 'Usuário';
    
    // Filter out entries already viewed by this user
    const viewedKeys = new Set(visualizacoes.map((v: any) => `${v.entry_source}-${v.entry_id}`));
    const newEntries = entries.filter(e => !viewedKeys.has(`${e.source}-${e.id}`));
    
    if (newEntries.length === 0) return;

    // Upsert visualizations
    const rows = newEntries.map(e => ({
      lead_id: leadId,
      entry_id: e.id,
      entry_source: e.source,
      user_id: user.id,
      user_nome: userName,
      visualizado_em: new Date().toISOString(),
    }));

    await supabase
      .from('lead_historico_visualizacoes' as any)
      .upsert(rows, { onConflict: 'entry_id,entry_source,user_id' });
    
    queryClient.invalidateQueries({ queryKey: ['lead-historico-visualizacoes', leadId] });
    queryClient.invalidateQueries({ queryKey: ['lead-historico-viewed', leadId, user.id] });
  }, [user, leadId, visualizacoes, queryClient]);

  // Helper to get visualizations for a specific entry
  const getEntryViews = useCallback((entryId: string, entrySource: string) => {
    return visualizacoes.filter((v: any) => v.entry_id === entryId && v.entry_source === entrySource);
  }, [visualizacoes]);

  // Create anotação mutation
  const createMutation = useMutation({
    mutationFn: async (data: { titulo?: string; conteudo: string; imagens: string[] }) => {
      const { error } = await supabase
        .from('lead_anotacoes')
        .insert({
          lead_id: leadId,
          tipo: 'nota',
          titulo: data.titulo || null,
          conteudo: data.conteudo,
          imagens: data.imagens,
          usuario_id: user?.id,
          usuario_nome: user?.user_metadata?.nome_completo || user?.email || 'Usuário'
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-anotacoes', leadId] });
      toast.success('Anotação salva com sucesso');
      resetForm();
    },
    onError: (error) => {
      console.error('Erro ao salvar anotação:', error);
      toast.error('Erro ao salvar anotação');
    }
  });

  // Delete anotação mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lead_anotacoes')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-anotacoes', leadId] });
      toast.success('Anotação excluída');
      setDeleteId(null);
    },
    onError: () => {
      toast.error('Erro ao excluir anotação');
    }
  });

  const resetForm = () => {
    setShowForm(false);
    setTitulo("");
    setConteudo("");
    setImagensPreview([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: { file: File; preview: string }[] = [];
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        newImages.push({
          file,
          preview: URL.createObjectURL(file)
        });
      }
    });
    setImagensPreview(prev => [...prev, ...newImages]);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const newImages: { file: File; preview: string }[] = [];
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          newImages.push({
            file,
            preview: URL.createObjectURL(file)
          });
        }
      }
    }
    
    if (newImages.length > 0) {
      setImagensPreview(prev => [...prev, ...newImages]);
    }
  };

  const removeImage = (index: number) => {
    setImagensPreview(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (!conteudo.trim()) {
      toast.error('Digite o conteúdo da anotação');
      return;
    }

    setUploading(true);
    try {
      // Upload images
      const uploadedUrls: string[] = [];
      for (const img of imagensPreview) {
        const fileName = `${leadId}/${Date.now()}-${img.file.name}`;
        const { data, error } = await supabase.storage
          .from('lead-anotacoes')
          .upload(fileName, img.file);
        
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage
          .from('lead-anotacoes')
          .getPublicUrl(data.path);
        
        uploadedUrls.push(publicUrl);
      }

      // Save anotação
      await createMutation.mutateAsync({
        titulo: titulo.trim() || undefined,
        conteudo: conteudo.trim(),
        imagens: uploadedUrls
      });
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar anotação');
    } finally {
      setUploading(false);
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'desconversao': return <Undo2 className="h-4 w-4" />;
      case 'conversao': return <FileText className="h-4 w-4" />;
      case 'blacklist': return <Ban className="h-4 w-4" />;
      case 'alerta': return <AlertTriangle className="h-4 w-4" />;
      case 'disparo': return <Send className="h-4 w-4" />;
      case 'proposta': return <FileText className="h-4 w-4" />;
      case 'conversa': return <MessageCircle className="h-4 w-4" />;
      case 'outro_evento': return <UserX className="h-4 w-4" />;
      default: return <StickyNote className="h-4 w-4" />;
    }
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'desconversao': return 'bg-amber-500';
      case 'conversao': return 'bg-green-500';
      case 'blacklist': return 'bg-red-500';
      case 'alerta': return 'bg-orange-500';
      case 'disparo': return 'bg-blue-500';
      case 'proposta': return 'bg-indigo-500';
      case 'conversa': return 'bg-green-500';
      case 'outro_evento': return 'bg-rose-500';
      default: return 'bg-primary';
    }
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'desconversao': return 'Desconversão';
      case 'conversao': return 'Conversão';
      case 'blacklist': return 'Blacklist';
      case 'alerta': return 'Alerta';
      case 'disparo': return 'Disparo';
      case 'proposta': return 'Proposta';
      case 'conversa': return 'Conversa WhatsApp';
      case 'outro_evento': return 'Alerta';
      default: return 'Anotação';
    }
  };

  const getDisparoStatusLabel = (status: string) => {
    switch (status) {
      case '1-ENVIAR': return 'Aguardando envio';
      case '2-REENVIAR': return 'Aguardando reenvio';
      case '3-TRATANDO': return 'Em processamento';
      case '4-ENVIADO': return 'Mensagem enviada';
      case '5-NOZAP': return 'Sem WhatsApp';
      case '6-BLOQUEADORA': return 'Instância bloqueada';
      default: return status;
    }
  };

  // Combine all entries for timeline
  const allEntries = [
    ...(anotacoes || []).map(a => ({ ...a, source: 'anotacao' as const })),
    ...(desconversoes || []).map(d => ({
      id: d.id,
      tipo: 'desconversao',
      titulo: 'Desconversão para Lead',
      conteudo: d.descricao_resumida || 'Médico foi revertido para lead',
      metadados: d.metadados,
      usuario_nome: d.usuario_nome,
      created_at: d.criado_em,
      imagens: [],
      source: 'historico' as const
    })),
    ...(conversoes || []).map(c => ({
      id: c.id,
      tipo: 'conversao',
      titulo: 'Convertido em Médico',
      conteudo: (c.metadados as any)?.dados_conversao?.motivo_conversao || c.descricao_resumida || 'Lead convertido em médico',
      metadados: c.metadados,
      usuario_nome: c.usuario_nome,
      created_at: c.criado_em,
      imagens: [],
      source: 'historico' as const
    })),
    ...(outrosEventos || []).map(o => ({
      id: o.id,
      tipo: 'outro_evento',
      titulo: o.descricao_resumida || 'Evento',
      conteudo: o.descricao_resumida || '',
      metadados: o.metadados,
      usuario_nome: o.usuario_nome,
      created_at: o.criado_em,
      imagens: [],
      source: 'historico' as const
    })),
    ...(blacklistEntries || []).map(b => ({
      id: b.id,
      tipo: 'blacklist',
      titulo: 'Adicionado à Blacklist',
      conteudo: b.reason || 'Sem motivo informado',
      metadados: { origem: b.origem },
      usuario_nome: b.created_by,
      created_at: b.created_at,
      imagens: [],
      source: 'blacklist' as const
    })),
    ...(disparosParticipacao || []).map(d => ({
      id: d.id,
      tipo: 'disparo',
      titulo: `Campanha: ${d.campanha?.nome || 'Sem nome'}`,
      conteudo: `Status: ${getDisparoStatusLabel(d.status)}${d.data_envio ? ` • Enviado em ${format(new Date(d.data_envio), "dd/MM/yyyy HH:mm", { locale: ptBR })}` : ''}`,
      metadados: { 
        campanha_nome: d.campanha?.nome,
        proposta_id: d.campanha?.proposta_id,
        proposta_descricao: d.proposta?.descricao,
        proposta_status: d.proposta?.status,
        proposta_observacoes: d.proposta?.observacoes,
        proposta_itens: d.propostaItens || [],
        mensagem_enviada: d.mensagem_enviada,
        instancia: d.campanha?.instancia,
        status: d.status
      },
      usuario_nome: d.campanha?.responsavel_nome,
      created_at: d.created_at,
      imagens: [],
      source: 'disparo' as const
    })),
    ...(propostasLead || []).map(p => ({
      id: p.id,
      tipo: 'proposta',
      titulo: `Proposta: ${p.descricao || p.id_proposta || 'Sem identificação'}`,
      conteudo: `Status: ${p.status || 'Pendente'}`,
      metadados: { 
        id_proposta: p.id_proposta,
        valor: p.valor,
        status: p.status,
        descricao: p.descricao,
        observacoes: p.observacoes,
        proposta_itens: p.itens || [],
        contrato_codigo: p.contrato?.codigo_contrato,
        cliente_nome: p.contrato?.cliente?.nome_empresa
      },
      usuario_nome: p.criado_por_nome || null,
      created_at: p.criado_em,
      imagens: [],
      source: 'proposta' as const
    })),
    ...(sigzapConversas || []).map(c => {
      const contact = c.contact as any;
      const instance = c.instance as any;
      const assignedUser = c.assigned_user as any;
      const statusLabel = c.status === 'active' ? 'Ativa' : c.status === 'inactive' ? 'Inativa' : c.status;
      const msgCount = c.unread_count || 0;
      return {
        id: c.id,
        tipo: 'conversa',
        titulo: `${instance?.name || 'Instância'} • ${contact?.contact_phone || ''}`,
        conteudo: `Status: ${statusLabel}${msgCount > 0 ? ` • ${msgCount} não lidas` : ''}${c.last_message_text ? `\n"${c.last_message_text}"` : ''}`,
        metadados: {
          instance_name: instance?.name,
          contact_phone: contact?.contact_phone,
          contact_name: contact?.contact_name,
          assigned_to: assignedUser?.nome_completo,
          status: c.status,
          unread_count: msgCount
        },
        usuario_nome: assignedUser?.nome_completo || null,
        created_at: c.last_message_at || c.created_at,
        imagens: [],
        source: 'conversa' as const
      };
    })
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // 2s timer: mark all entries as viewed after staying on the tab for 2 seconds
  useEffect(() => {
    if (allEntries.length === 0) return;
    
    hasMarkedRef.current = false;
    viewTimerRef.current = setTimeout(() => {
      if (!hasMarkedRef.current) {
        hasMarkedRef.current = true;
        const entriesToMark = allEntries.map(e => ({ id: e.id, source: e.source }));
        markEntriesAsViewed(entriesToMark);
      }
    }, 2000);

    return () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    };
  }, [allEntries.length, leadId]);

  return (
    <div className="space-y-4" onPaste={handlePaste}>
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Anotações & Histórico</h3>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          variant={showForm ? "secondary" : "default"}
        >
          <PlusCircle className="h-4 w-4 mr-1" />
          Nova Anotação
        </Button>
      </div>

      {/* New annotation form */}
      {showForm && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <Input
            placeholder="Título (opcional)"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="font-medium"
          />
          <Textarea
            placeholder="Escreva sua anotação aqui... (Ctrl+V para colar imagens)"
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            rows={4}
          />
          
          {/* Image previews */}
          {imagensPreview.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {imagensPreview.map((img, index) => (
                <div key={index} className="relative group">
                  <img
                    src={img.preview}
                    alt={`Preview ${index + 1}`}
                    className="h-20 w-20 object-cover rounded border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Image className="h-4 w-4 mr-1" />
              Adicionar Imagens
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={uploading || !conteudo.trim()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Anotação'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <ScrollArea className="h-[calc(100vh-450px)]">
        {loadingAnotacoes ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : allEntries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <StickyNote className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhuma anotação</p>
            <p className="text-sm">Clique em "Nova Anotação" para adicionar observações sobre este profissional.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border" />

            <div className="space-y-4">
              {allEntries.map((entry: any) => (
                <div key={`${entry.source}-${entry.id}`} className="relative flex gap-4">
                  {/* Icon */}
                  <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-white shrink-0 ${getTipoColor(entry.tipo)}`}>
                    {getTipoIcon(entry.tipo)}
                  </div>

                  {/* Content */}
                  <div 
                    className={`flex-1 rounded-lg border bg-card p-4 group ${entry.tipo === 'conversa' && onConversaClick ? 'cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all' : ''}`}
                    onClick={() => {
                      if (entry.tipo === 'conversa' && onConversaClick) {
                        onConversaClick(entry.id);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={
                            entry.tipo === 'blacklist' ? 'border-red-500 text-red-500' :
                            entry.tipo === 'desconversao' ? 'border-amber-500 text-amber-500' :
                            ''
                          }>
                            {getTipoLabel(entry.tipo)}
                          </Badge>
                          {entry.titulo && (
                            <span className="font-medium text-sm">{entry.titulo}</span>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{entry.conteudo}</p>
                      </div>
                      <div className="flex items-start gap-2 shrink-0">
                        <div className="text-right text-xs text-muted-foreground">
                          <p className="flex items-center gap-1 justify-end">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(entry.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                          <p>{format(new Date(entry.created_at), "HH:mm", { locale: ptBR })}</p>
                        </div>
                        {entry.source === 'anotacao' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(entry.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Images */}
                    {entry.imagens && entry.imagens.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {entry.imagens.map((url: string, idx: number) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img
                              src={url}
                              alt={`Imagem ${idx + 1}`}
                              className="h-24 w-auto object-cover rounded border hover:border-primary transition-colors"
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* JUS verification image for conversão */}
                    {entry.tipo === 'conversao' && entry.metadados && typeof entry.metadados === 'object' && (entry.metadados as any).dados_conversao?.jus_verificacao_url && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-1 font-medium">📎 Validação JUS</p>
                        <a href={(entry.metadados as any).dados_conversao.jus_verificacao_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={(entry.metadados as any).dados_conversao.jus_verificacao_url}
                            alt="Validação JUS"
                            className="max-h-[200px] rounded-md border object-contain cursor-pointer hover:opacity-80 transition-opacity"
                          />
                        </a>
                      </div>
                    )}

                    {/* Metadados (for desconversão) */}
                    {entry.tipo === 'desconversao' && entry.metadados && (
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                        {typeof entry.metadados === 'object' && entry.metadados.motivo && (
                          <p><strong>Motivo:</strong> {entry.metadados.motivo}</p>
                        )}
                      </div>
                    )}

                    {/* Metadados (for disparo) */}
                    {entry.tipo === 'disparo' && entry.metadados && (
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-2">
                        {typeof entry.metadados === 'object' && (
                          <>
                            {/* Proposta vinculada */}
                            {entry.metadados.proposta_descricao && (
                              <div className="bg-muted/50 rounded p-2 space-y-1">
                                <p className="font-medium text-foreground">Proposta Vinculada:</p>
                                <p>{entry.metadados.proposta_descricao}</p>
                                {entry.metadados.proposta_status && (
                                  <p><strong>Status:</strong> {entry.metadados.proposta_status}</p>
                                )}
                                {/* Itens da proposta com valores */}
                                {entry.metadados.proposta_itens && entry.metadados.proposta_itens.length > 0 && (
                                  <div className="mt-1 space-y-1">
                                    <p className="font-medium">Valores da Proposta:</p>
                                    {entry.metadados.proposta_itens.map((item: any, idx: number) => (
                                      <p key={idx} className="ml-2">
                                        • {item.item_nome}: <strong>R$ {Number(item.valor_medico || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                        {item.quantidade > 1 && ` (x${item.quantidade})`}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {entry.metadados.proposta_observacoes && (
                                  <p className="italic mt-1">{entry.metadados.proposta_observacoes}</p>
                                )}
                              </div>
                            )}
                            
                            {/* Mensagem enviada */}
                            {entry.metadados.mensagem_enviada && (
                              <div className="bg-muted/50 rounded p-2">
                                <p className="font-medium text-foreground mb-1">Mensagem Enviada:</p>
                                <p className="whitespace-pre-wrap">{entry.metadados.mensagem_enviada}</p>
                              </div>
                            )}
                            
                            {entry.metadados.instancia && (
                              <p><strong>Instância:</strong> {entry.metadados.instancia}</p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Metadados (for proposta) */}
                    {entry.tipo === 'proposta' && entry.metadados && (
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-2">
                        {typeof entry.metadados === 'object' && (
                          <div className="bg-muted/50 rounded p-2 space-y-1">
                            {/* Contrato/Cliente */}
                            {(entry.metadados.contrato_codigo || entry.metadados.cliente_nome) && (
                              <p className="text-foreground">
                                {entry.metadados.cliente_nome && <span className="font-medium">{entry.metadados.cliente_nome}</span>}
                                {entry.metadados.contrato_codigo && <span className="text-muted-foreground"> • {entry.metadados.contrato_codigo}</span>}
                              </p>
                            )}
                            
                            {/* Descrição */}
                            {entry.metadados.descricao && (
                              <p className="text-foreground">{entry.metadados.descricao}</p>
                            )}
                            
                            {/* Itens da proposta com valores */}
                            {entry.metadados.proposta_itens && entry.metadados.proposta_itens.length > 0 && (
                              <div className="mt-1 space-y-1">
                                <p className="font-medium text-foreground">Valores da Proposta:</p>
                                {entry.metadados.proposta_itens.map((item: any, idx: number) => (
                                  <p key={idx} className="ml-2">
                                    • {item.item_nome}: <strong className="text-foreground">R$ {Number(item.valor_medico || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                    {item.quantidade > 1 && ` (x${item.quantidade})`}
                                  </p>
                                ))}
                              </div>
                            )}
                            
                            {/* Observações */}
                            {entry.metadados.observacoes && (
                              <p className="italic mt-1 text-amber-600">{entry.metadados.observacoes}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* User info */}
                    {entry.usuario_nome && (
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {entry.usuario_nome}
                      </p>
                    )}

                    {/* Read receipts - quem visualizou (só admins e líderes veem) */}
                    {(isAdmin || isLeader) && (() => {
                      const views = getEntryViews(entry.id, entry.source);
                      if (views.length === 0) return null;
                      return (
                        <div className="mt-2 pt-2 border-t flex items-center gap-2 flex-wrap">
                          <CheckCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {views.map((v: any) => (
                              <span key={v.id} className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Eye className="h-2.5 w-2.5" />
                                <span className="font-medium">{v.user_nome}</span>
                                <span className="opacity-60">
                                  {format(new Date(v.visualizado_em), "dd/MM HH:mm", { locale: ptBR })}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anotação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}