import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { User, RefreshCw, Inbox, Unlock, Plus, Loader2, Send, X, MessageCircle, Wifi, WifiOff, AlertCircle, UserX, Tag as TagIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { normalizeToDigitsOnly, normalizeToE164 } from "@/lib/phoneUtils";
import { sigzapNormalizePhoneKey } from "@/lib/sigzapPhoneKey";
import { SigZapConversaContextMenu } from "./SigZapConversaContextMenu";

interface SigZapMinhasConversasColumnProps {
  selectedConversaId: string | null;
  onSelectConversa: (id: string) => void;
  selectedInstanceIds: string[];
  onDragStart?: (conversaId: string) => void;
  onDragEnd?: () => void;
  onTransfer?: (conversaId: string) => void;
}

export function SigZapMinhasConversasColumn({
  selectedConversaId,
  onSelectConversa,
  selectedInstanceIds,
  onDragStart,
  onDragEnd,
  onTransfer,
}: SigZapMinhasConversasColumnProps) {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const [showNewInput, setShowNewInput] = useState(false);
  const [novoNumero, setNovoNumero] = useState("");
  const [novaInstanciaId, setNovaInstanciaId] = useState<string>("");
  const attemptedPhotoSyncContactIdsRef = useRef<Set<string>>(new Set());

  // Filtro: todos | nao_lido | tag:<nome>
  const [filtro, setFiltro] = useState<string>("todos");

  // Tags disponíveis (mesmas do Kanban)
  const { data: tagsConfig } = useQuery({
    queryKey: ['leads-etiquetas-config-sigzap'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads_etiquetas_config')
        .select('nome, cor')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
  });

  // Mutation to sync contact photos on demand
  const syncPhotosMutation = useMutation({
    mutationFn: async ({ contactIds }: { contactIds: string[] }) => {
      const { data, error } = await supabase.functions.invoke('sync-contact-photos', {
        body: { contact_ids: contactIds, limit: contactIds.length }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
    },
    onError: (_error, variables) => {
      variables.contactIds.forEach(id => attemptedPhotoSyncContactIdsRef.current.delete(id));
    },
  });

  // Fetch instances for the new conversation selector (exclude deleted)
  const { data: instances } = useQuery({
    queryKey: ['sigzap-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sigzap_instances')
        .select('*')
        .neq('status', 'deleted')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Filter instances based on selection
  const availableInstances = useMemo(() => {
    if (selectedInstanceIds.length === 0) return instances || [];
    return instances?.filter(i => selectedInstanceIds.includes(i.id)) || [];
  }, [instances, selectedInstanceIds]);

  // Auto-select instance when showing new input or when available instances change
  useEffect(() => {
    if (showNewInput && availableInstances.length > 0) {
      // Se novaInstanciaId ainda não está setado, ou não existe mais na lista, seleciona a primeira
      const currentIsValid = novaInstanciaId && availableInstances.some(i => i.id === novaInstanciaId);
      if (!currentIsValid) {
        setNovaInstanciaId(availableInstances[0].id);
      }
    }
  }, [showNewInput, availableInstances, novaInstanciaId]);

  // Fetch MY conversations (assigned to me) - show ALL regardless of instance filter
  const { data: minhasConversas, isLoading, refetch } = useQuery({
    queryKey: ['sigzap-minhas-conversas', user?.id],
    queryFn: async (): Promise<any[]> => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('sigzap_conversations')
        .select(`
          *,
          contact:sigzap_contacts(*),
          instance:sigzap_instances(id, name),
          lead:leads!sigzap_conversations_lead_id_fkey(id, nome, tags)
        `)
        .eq('assigned_user_id', user.id)
        .neq('status', 'inactive')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      
      if (error) throw error;
      
      // Deduplicate por telefone normalizado (trata variações como +55, espaços e JID)
      const seen = new Map<string, any>();
      (data || []).forEach((conv) => {
        const contact = conv.contact as any;
        const phoneRaw = contact?.contact_phone || contact?.contact_jid || '';
        const normalizedPhone = sigzapNormalizePhoneKey(phoneRaw);
        const fallback = contact?.id || conv.contact_id || conv.id;
        const key = `${conv.instance_id}-${normalizedPhone || fallback}`;

        if (!seen.has(key)) {
          seen.set(key, conv);
        } else {
          // Keep the most recent one
          const existing = seen.get(key);
          if (new Date(conv.last_message_at || 0) > new Date(existing.last_message_at || 0)) {
            seen.set(key, conv);
          }
        }
      });

      return Array.from(seen.values());
    },
    enabled: !!user?.id && selectedInstanceIds.length > 0,
  });

  // Extract all unique phone numbers from conversations to fetch leads
  const phoneNumbers = useMemo(() => {
    if (!minhasConversas) return [];
    return minhasConversas
      .map(c => (c.contact as any)?.contact_phone)
      .filter(Boolean)
      .map(phone => normalizeToE164(phone))
      .filter(Boolean) as string[];
  }, [minhasConversas]);

  // Conversas filtradas
  const conversasFiltradas = useMemo(() => {
    if (!minhasConversas) return [];
    if (filtro === "todos") return minhasConversas;
    if (filtro === "nao_lido") {
      return minhasConversas.filter((c: any) => (c.unread_count || 0) > 0);
    }
    if (filtro.startsWith("tag:")) {
      const tagNome = filtro.slice(4);
      return minhasConversas.filter((c: any) => {
        const tags = (c.lead as any)?.tags;
        return Array.isArray(tags) && tags.includes(tagNome);
      });
    }
    return minhasConversas;
  }, [minhasConversas, filtro]);

  // Fetch leads by phone numbers (phone_e164 + telefones_adicionais)
  const { data: leadsMap } = useQuery({
    queryKey: ['sigzap-leads-by-phone', phoneNumbers],
    queryFn: async () => {
      if (phoneNumbers.length === 0) return {};
      
      // First: direct match on phone_e164
      const { data: directLeads, error } = await supabase
        .from('leads')
        .select('id, nome, phone_e164, telefones_adicionais')
        .in('phone_e164', phoneNumbers);
      
      if (error) throw error;
      
      const map: Record<string, string> = {};
      const foundPhones = new Set<string>();

      directLeads?.forEach(lead => {
        if (lead.phone_e164 && lead.nome) {
          map[lead.phone_e164] = lead.nome;
          foundPhones.add(lead.phone_e164);
        }
      });

      // Second: for phones not found via phone_e164, search telefones_adicionais
      const missingPhones = phoneNumbers.filter(p => !foundPhones.has(p));
      if (missingPhones.length > 0) {
        const { data: extraLeads } = await supabase
          .from('leads')
          .select('id, nome, telefones_adicionais')
          .not('telefones_adicionais', 'is', null);

        extraLeads?.forEach(lead => {
          if (!lead.telefones_adicionais || !lead.nome) return;
          for (const phone of missingPhones) {
            if (lead.telefones_adicionais.includes(phone)) {
              map[phone] = lead.nome;
            }
          }
        });
      }

      return map;
    },
    enabled: phoneNumbers.length > 0,
  });

  // Mark conversation as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (conversaId: string) => {
      const { error } = await supabase
        .from('sigzap_conversations')
        .update({ unread_count: 0 })
        .eq('id', conversaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
    },
  });

  // Mark as read when selecting a conversation
  const handleSelectConversa = (conversaId: string, unreadCount: number) => {
    onSelectConversa(conversaId);
    if (unreadCount > 0) {
      markAsReadMutation.mutate(conversaId);
    }

    // Sync photo on click if missing
    const conversa = minhasConversas?.find(c => c.id === conversaId);
    const contact = conversa?.contact as any;
    if (contact?.id && !contact?.profile_picture_url && !attemptedPhotoSyncContactIdsRef.current.has(contact.id)) {
      attemptedPhotoSyncContactIdsRef.current.add(contact.id);
      syncPhotosMutation.mutate({ contactIds: [contact.id] });
    }
  };

  // Fetch current user's captador color
  const { data: minhaCor } = useQuery({
    queryKey: ['captador-minha-cor', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('captacao_permissoes_usuario')
        .select('cor')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.cor || null;
    },
    enabled: !!user?.id,
  });

  // Subscribe to realtime updates
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const channel = supabase
      .channel('sigzap-minhas-conversas-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sigzap_conversations'
        },
        () => {
          refetchRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Release conversation mutation
  const releaseMutation = useMutation({
    mutationFn: async (conversaId: string) => {
      const { error } = await supabase
        .from('sigzap_conversations')
        .update({ 
          assigned_user_id: null,
          status: 'open',
          updated_at: new Date().toISOString()
        })
        .eq('id', conversaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });
      toast.success('Conversa liberada!');
    },
    onError: (error) => {
      console.error('Error releasing conversation:', error);
      toast.error('Erro ao liberar conversa');
    },
  });

  // Create new conversation mutation
  const createConversaMutation = useMutation({
    mutationFn: async ({ phone, instanceId }: { phone: string; instanceId: string }) => {
      if (!instanceId) {
        throw new Error('Selecione uma instância primeiro');
      }
      
      // Normalize phone number (adds 55 and 9 digit if needed)
      const normalizedPhone = normalizeToDigitsOnly(phone);
      if (!normalizedPhone) {
        throw new Error('Número inválido. Digite um número com DDD.');
      }

      // Get instance name for Evolution API call
      const selectedInstance = availableInstances.find(i => i.id === instanceId);
      if (!selectedInstance?.name) {
        throw new Error('Instância não encontrada');
      }

      // Check if number exists on WhatsApp via Evolution API
      const { data: checkResult, error: checkError } = await supabase.functions.invoke('evolution-api-proxy', {
        body: {
          action: 'checkIsOnWhatsapp',
          instanceName: selectedInstance.name,
          data: { numbers: [normalizedPhone] },
        },
      });

      if (checkError) {
        console.error('Erro ao verificar WhatsApp:', checkError);
        throw new Error('Erro ao verificar se o número tem WhatsApp');
      }

      // Check response - Evolution API returns array with exists: true/false
      const results = Array.isArray(checkResult) ? checkResult : [];
      const numberExists = results.some((r: any) => r.exists === true);
      
      if (!numberExists) {
        throw new Error('Este número não possui WhatsApp. Verifique o número e tente novamente.');
      }

      // Use the JID returned by the API if available, otherwise build it
      const apiJid = results.find((r: any) => r.exists)?.jid;
      const contactJid = apiJid || `${normalizedPhone}@s.whatsapp.net`;
      
      // Check if contact exists
      let { data: existingContact } = await supabase
        .from('sigzap_contacts')
        .select('id')
        .eq('instance_id', instanceId)
        .eq('contact_jid', contactJid)
        .maybeSingle();

      let contactId: string;

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        // Create new contact
        const { data: newContact, error: contactError } = await supabase
          .from('sigzap_contacts')
          .insert({
            instance_id: instanceId,
            contact_jid: contactJid,
            contact_phone: normalizedPhone,
          })
          .select('id')
          .single();
        
        if (contactError) throw contactError;
        contactId = newContact.id;
      }

      // Check if conversation already exists
      let { data: existingConv } = await supabase
        .from('sigzap_conversations')
        .select('id')
        .eq('instance_id', instanceId)
        .eq('contact_id', contactId)
        .maybeSingle();

      if (existingConv) {
        // Assign to current user and return existing
        await supabase
          .from('sigzap_conversations')
          .update({ 
            assigned_user_id: user?.id,
            status: 'in_progress'
          })
          .eq('id', existingConv.id);
        return existingConv.id;
      }

      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from('sigzap_conversations')
        .insert({
          instance_id: instanceId,
          contact_id: contactId,
          assigned_user_id: user?.id,
          status: 'in_progress',
        })
        .select('id')
        .single();
      
      if (convError) throw convError;

      // Count as manual disparo - search for existing lead by phone variations
      const phoneE164 = `+${normalizedPhone}`;
      const phoneWithout9 = normalizedPhone.length === 13 
        ? normalizedPhone.slice(0, 4) + normalizedPhone.slice(5) 
        : null;
      const phoneVariations = [phoneE164];
      if (phoneWithout9) phoneVariations.push(`+${phoneWithout9}`);

      const { data: matchedLeads } = await supabase
        .from('leads')
        .select('id, nome')
        .in('phone_e164', phoneVariations)
        .limit(1);

      const linkedLeadId = matchedLeads?.[0]?.id || null;
      const linkedLeadNome = matchedLeads?.[0]?.nome || null;

      // Get user profile name
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user!.id)
        .maybeSingle();

      // Register as disparo manual in disparos_log
      await supabase.from('disparos_log').insert({
        usuario_id: user!.id,
        usuario_nome: userProfile?.nome_completo || 'Captador',
        especialidade: 'Manual - SigZap',
        mensagem: `Conversa iniciada manualmente via SigZap com ${linkedLeadNome || normalizedPhone}`,
        total_destinatarios: 1,
        enviados: 1,
        falhas: 0,
        tipo_disparo: 'whatsapp',
        destinatarios: [{ 
          telefone: phoneE164, 
          nome: linkedLeadNome || `Contato ${normalizedPhone}`,
          lead_id: linkedLeadId 
        }],
      });

      // Also register in disparos_contatos for granular tracking
      await supabase.from('disparos_contatos').insert({
        telefone_original: phone,
        telefone_e164: phoneE164,
        status: '2-ENVIADO',
        data_envio: new Date().toISOString(),
        mensagem_enviada: 'Conversa manual SigZap',
        tentativas: 1,
        lead_id: linkedLeadId,
      });

      return newConv.id;
    },
    onSuccess: (conversaId) => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });
      setShowNewInput(false);
      setNovoNumero("");
      setNovaInstanciaId("");
      toast.success('Conversa iniciada!');
      onSelectConversa(conversaId);
    },
    onError: (error) => {
      console.error('Error creating conversation:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar conversa');
    },
  });

  const handleCreateConversa = () => {
    if (!novoNumero.trim()) {
      toast.error('Digite o número');
      return;
    }
    if (!novaInstanciaId) {
      toast.error('Selecione uma instância');
      return;
    }
    createConversaMutation.mutate({ phone: novoNumero, instanceId: novaInstanciaId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateConversa();
    } else if (e.key === 'Escape') {
      setShowNewInput(false);
      setNovoNumero("");
      setNovaInstanciaId("");
    }
  };

  return (
    <div className="flex flex-col h-full border-r overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b bg-muted/30 flex items-center justify-between h-12">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Minhas Conversas</h3>
        </div>
        {!showNewInput && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowNewInput(true)}
            title="Nova conversa"
            disabled={selectedInstanceIds.length === 0}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Inline new conversation input */}
      {showNewInput && (
        <div className="p-2 border-b bg-muted/20 space-y-2">
          {/* Instance selector with connection status indicators */}
          {availableInstances.length > 1 && (
            <Select value={novaInstanciaId} onValueChange={setNovaInstanciaId}>
              <SelectTrigger className="h-8 text-xs">
                <div className="flex items-center gap-2">
                  {(() => {
                    const selectedInstance = availableInstances.find(i => i.id === novaInstanciaId);
                    const isConnected = selectedInstance?.status === 'connected';
                    return isConnected ? (
                      <Wifi className="h-3 w-3 text-green-500" />
                    ) : (
                      <WifiOff className="h-3 w-3 text-destructive" />
                    );
                  })()}
                  <SelectValue placeholder="Instância" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {availableInstances.map((instance) => {
                  const isConnected = instance.status === 'connected';
                  return (
                    <SelectItem 
                      key={instance.id} 
                      value={instance.id} 
                      className={cn("text-xs", !isConnected && "opacity-60")}
                    >
                      <div className="flex items-center gap-2">
                        {isConnected ? (
                          <Wifi className="h-3 w-3 text-green-500" />
                        ) : (
                          <WifiOff className="h-3 w-3 text-destructive" />
                        )}
                        {instance.name}
                        {!isConnected && (
                          <span className="text-[10px] text-destructive font-medium ml-1">OFF</span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          
          {/* Show single instance status when only one is available */}
          {availableInstances.length === 1 && (
            <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/40 text-xs">
              {availableInstances[0].status === 'connected' ? (
                <>
                  <Wifi className="h-3 w-3 text-green-500" />
                  <span>{availableInstances[0].name}</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-destructive" />
                  <span className="text-destructive">{availableInstances[0].name} (desconectada)</span>
                </>
              )}
            </div>
          )}
          
          {/* Warning when selected instance is disconnected */}
          {novaInstanciaId && (() => {
            const selectedInstance = availableInstances.find(i => i.id === novaInstanciaId);
            return selectedInstance && selectedInstance.status !== 'connected' ? (
              <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-destructive text-[11px]">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Instância desconectada. Mensagens não serão enviadas até reconectar.</span>
              </div>
            ) : null;
          })()}
          
          <div className="flex items-center gap-2">
            <Input
              placeholder="5547999758708"
              value={novoNumero}
              onChange={(e) => setNovoNumero(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm flex-1"
              autoFocus
            />
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={handleCreateConversa}
              disabled={createConversaMutation.isPending || !novoNumero.trim() || !novaInstanciaId}
            >
              {createConversaMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setShowNewInput(false);
                setNovoNumero("");
                setNovaInstanciaId("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Count + refresh */}
      <div className="flex items-center justify-between px-3 py-2 border-b text-xs text-muted-foreground">
        <span>
          {conversasFiltradas.length} conversa{conversasFiltradas.length !== 1 ? 's' : ''}
          {(() => {
            const naoLidos = conversasFiltradas.reduce((acc, c: any) => acc + (c.unread_count || 0), 0);
            return naoLidos > 0 ? ` · ${naoLidos} não lida${naoLidos !== 1 ? 's' : ''}` : '';
          })()}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/10">
        <Button
          variant={filtro === "todos" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setFiltro("todos")}
        >
          Todos
        </Button>
        <Button
          variant={filtro === "nao_lido" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setFiltro("nao_lido")}
        >
          Não lido
        </Button>
        <Select
          value={filtro.startsWith("tag:") ? filtro : ""}
          onValueChange={(v) => setFiltro(v)}
        >
          <SelectTrigger
            className={cn(
              "h-7 text-[11px] flex-1 min-w-0",
              filtro.startsWith("tag:") && "bg-secondary"
            )}
          >
            <div className="flex items-center gap-1 min-w-0">
              <TagIcon className="h-3 w-3 flex-shrink-0" />
              <SelectValue placeholder="Tag" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {(tagsConfig || []).length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma tag</div>
            ) : (
              (tagsConfig || []).map((t: any) => (
                <SelectItem key={t.nome} value={`tag:${t.nome}`} className="text-xs">
                  {t.nome}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {filtro !== "todos" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={() => setFiltro("todos")}
            title="Limpar filtro"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-2">
          {selectedInstanceIds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Inbox className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p>Selecione instâncias</p>
              <p className="text-xs mt-1">para ver suas conversas</p>
            </div>
          ) : isLoading ? (
            [...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))
          ) : !minhasConversas || minhasConversas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Inbox className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p>Nenhuma conversa atribuída</p>
              <p className="text-xs mt-1">Clique em uma conversa livre para assumir</p>
            </div>
          ) : conversasFiltradas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Inbox className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p>Nenhuma conversa nesse filtro</p>
            </div>
          ) : (
            conversasFiltradas.map((conversa) => {
              const contact = conversa.contact as any;
              const instance = conversa.instance as any;
              const lastMessageAt = conversa.last_message_at;
              const msgCount = conversa.unread_count || 0;
              
              // Get lead name - prioritize join, then phone lookup
              const leadFromJoin = conversa.lead as any;
              const phoneE164 = contact?.contact_phone ? normalizeToE164(contact.contact_phone) : null;
              const leadName = leadFromJoin?.nome || (phoneE164 && leadsMap ? leadsMap[phoneE164] : null);
              const displayName = leadName || contact?.contact_name || contact?.contact_phone || 'Contato';
              
              return (
                <Card
key={conversa.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', conversa.id);
                    e.dataTransfer.effectAllowed = 'move';
                    onDragStart?.(conversa.id);
                  }}
                  onDragEnd={() => onDragEnd?.()}
                  className={cn(
                    "p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-md group border-l-4",
                    selectedConversaId !== conversa.id && "hover:bg-muted/40"
                  )}
                  style={{ 
                    borderLeftColor: minhaCor || 'hsl(var(--primary))',
                    ...(selectedConversaId === conversa.id ? {
                      backgroundColor: minhaCor ? `${minhaCor}` : 'hsl(var(--primary))',
                      color: 'white',
                    } : {})
                  }}
                  onClick={() => handleSelectConversa(conversa.id, msgCount)}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <div 
                        className="h-9 w-9 rounded-full flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: minhaCor ? `${minhaCor}20` : 'hsl(var(--primary) / 0.1)' }}
                      >
                        {contact?.profile_picture_url ? (
                          <img 
                            src={contact.profile_picture_url} 
                            alt={displayName}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <User className={cn("h-4 w-4 absolute", contact?.profile_picture_url && "hidden")} style={{ color: minhaCor || 'hsl(var(--primary))' }} />
                      </div>
                      {msgCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center z-10">
                          {msgCount > 99 ? '99+' : msgCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className={cn("font-medium text-sm truncate", selectedConversaId === conversa.id && "text-white")}>
                          {displayName}
                        </h4>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {lastMessageAt && (
                            <span className={cn("text-[10px]", selectedConversaId === conversa.id ? "text-white/70" : "text-muted-foreground")}>
                              {format(new Date(lastMessageAt), "dd/MM HH:mm", { locale: ptBR })}
                            </span>
                          )}
                          <SigZapConversaContextMenu
                            conversaId={conversa.id}
                            contactPhone={contact?.contact_phone}
                            contactName={displayName}
                            instanceName={instance?.name}
                            onTransfer={onTransfer}
                          />
                        </div>
                      </div>
                      <p className={cn("text-xs truncate mt-0.5", selectedConversaId === conversa.id ? "text-white/70" : "text-muted-foreground")}>
                        {contact?.contact_phone}
                      </p>
                      
                      {/* Last message preview */}
                      {conversa.last_message_text && (
                        <p className={cn("text-xs truncate mt-1 italic", selectedConversaId === conversa.id ? "text-white/60" : "text-muted-foreground/80")}>
                          {conversa.last_message_text}
                        </p>
                      )}
                      
                      {/* Badges + Release button */}
                      <div className="flex items-start justify-between gap-2 mt-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                          {instance?.name && (
                            <Badge variant="outline" className={cn("text-[10px] h-5 max-w-full truncate", selectedConversaId === conversa.id ? "border-white/40 text-white bg-white/10" : "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500 dark:text-white")}>
                              <span className="truncate">{instance.name}</span>
                            </Badge>
                          )}
                          <Badge
                            className={cn("text-[10px] h-5", selectedConversaId === conversa.id ? "border-white/40 text-white bg-white/20" : "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-white")}
                          >
                            Atendendo
                          </Badge>
                          {msgCount > 0 && (
                            <Badge className={cn("text-[10px] h-5 gap-1", selectedConversaId === conversa.id ? "bg-white/20 text-white" : "bg-emerald-700 text-white border-emerald-700")}>
                              <MessageCircle className="h-3 w-3" />
                              {msgCount}
                            </Badge>
                          )}
                          {conversa.not_the_doctor && (
                            <Badge variant="outline" className={cn("text-[10px] h-5 gap-0.5", selectedConversaId === conversa.id ? "border-white/40 text-white bg-white/20" : "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500 dark:text-white")}>
                              <UserX className="h-3 w-3" />
                              Não é o médico
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            releaseMutation.mutate(conversa.id);
                          }}
                          disabled={releaseMutation.isPending}
                          title="Liberar conversa"
                        >
                          <Unlock className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
