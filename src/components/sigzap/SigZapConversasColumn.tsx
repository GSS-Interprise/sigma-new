import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, RefreshCw, User, Wifi, MessageCircle, Camera, Loader2, ChevronDown, UserX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { normalizeToE164 } from "@/lib/phoneUtils";
import { sigzapNormalizePhoneKey } from "@/lib/sigzapPhoneKey";
import { SigZapInstanceMultiSelect } from "./SigZapInstanceMultiSelect";
import { SigZapConversaContextMenu } from "./SigZapConversaContextMenu";

interface SigZapConversasColumnProps {
  selectedConversaId: string | null;
  onSelectConversa: (id: string) => void;
  selectedInstanceIds: string[];
  onSelectInstances: (ids: string[]) => void;
  onDragStart?: (conversaId: string) => void;
  onDragEnd?: () => void;
  onTransfer?: (conversaId: string) => void;
}

export function SigZapConversasColumn({
  selectedConversaId,
  onSelectConversa,
  selectedInstanceIds,
  onSelectInstances,
  onDragStart,
  onDragEnd,
  onTransfer,
}: SigZapConversasColumnProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<"todas" | "nao_lidas">("todas");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const attemptedPhotoSyncContactIdsRef = useRef<Set<string>>(new Set());

  // Fetch current user profile name
  const { data: meuPerfil } = useQuery({
    queryKey: ['meu-perfil-conversas', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('profiles').select('nome_completo').eq('id', user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  // Auto-assign mutation - immediately assigns conversation when clicked
  const autoAssignMutation = useMutation({
    mutationFn: async (conversaId: string) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { error } = await supabase
        .from('sigzap_conversations')
        .update({ 
          assigned_user_id: user.id,
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', conversaId);
      
      if (error) throw error;

      // Insert system message
      const nome = meuPerfil?.nome_completo?.split(' ')[0] || 'Alguém';
      await supabase.from('sigzap_messages').insert({
        conversation_id: conversaId,
        from_me: true,
        message_text: `📋 ${nome} assumiu esta conversa`,
        message_type: 'system',
        message_status: 'delivered',
        sent_at: new Date().toISOString(),
        sent_by_user_id: user.id,
      });

      return conversaId;
    },
    onSuccess: (conversaId) => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversa-detail'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-chat-conversa', conversaId] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-messages'] });
      toast.success('Conversa atribuída a você!');
    },
    onError: (error) => {
      console.error('Error auto-assigning conversation:', error);
      toast.error('Erro ao atribuir conversa');
    },
  });

  // Handle conversation selection with auto-assign for free conversations
  const handleSelectConversa = (conversa: any) => {
    onSelectConversa(conversa.id);
    
    // Auto-assign if conversation is free (no assigned user)
    if (!conversa.assigned_user_id) {
      autoAssignMutation.mutate(conversa.id);
    }
  };

  // Fetch ALL conversations (both free and assigned)
  const { data: conversas, isLoading: loadingConversas, refetch } = useQuery({
    queryKey: ['sigzap-conversations', selectedInstanceIds],
    queryFn: async () => {
      if (selectedInstanceIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('sigzap_conversations')
        .select(`
          *,
          contact:sigzap_contacts(*),
          instance:sigzap_instances(id, name),
          assigned_user:profiles!sigzap_conversations_assigned_user_id_fkey(id, nome_completo),
          lead:leads!sigzap_conversations_lead_id_fkey(id, nome)
        `)
        .in('instance_id', selectedInstanceIds)
        .neq('status', 'inactive')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      
      if (error) throw error;
      
      // Deduplicate por telefone normalizado
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
          const existing = seen.get(key);
          if (new Date(conv.last_message_at || 0) > new Date(existing.last_message_at || 0)) {
            seen.set(key, conv);
          }
        }
      });

      return Array.from(seen.values());
    },
    enabled: selectedInstanceIds.length > 0,
  });

  // Fetch captador colors for all assigned users
  const assignedUserIds = useMemo(() => {
    if (!conversas) return [];
    return [...new Set(conversas.map(c => c.assigned_user_id).filter(Boolean))] as string[];
  }, [conversas]);

  const { data: captadorCores } = useQuery({
    queryKey: ['captador-cores', assignedUserIds],
    queryFn: async () => {
      if (assignedUserIds.length === 0) return {};
      const { data, error } = await supabase
        .from('captacao_permissoes_usuario')
        .select('user_id, cor')
        .in('user_id', assignedUserIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach(p => { if (p.cor) map[p.user_id] = p.cor; });
      return map;
    },
    enabled: assignedUserIds.length > 0,
  });

  // Mutation to sync contact photos
  const syncPhotosMutation = useMutation({
    mutationFn: async ({
      contactIds,
      instanceIds,
      silent,
    }: {
      contactIds?: string[];
      instanceIds?: string[];
      silent?: boolean;
    } = {}) => {
      const uniqueContactIds = [...new Set((contactIds || []).filter(Boolean))];
      const uniqueInstanceIds = [...new Set((instanceIds || []).filter(Boolean))];

      if (uniqueContactIds.length > 0) {
        const { data, error } = await supabase.functions.invoke('sync-contact-photos', {
          body: {
            contact_ids: uniqueContactIds,
            limit: uniqueContactIds.length,
          }
        });

        if (error) throw error;
        return { ...data, silent };
      }

      if (uniqueInstanceIds.length === 0) {
        const { data, error } = await supabase.functions.invoke('sync-contact-photos', {
          body: { limit: 50 }
        });

        if (error) throw error;
        return { ...data, silent };
      }

      const results = await Promise.all(uniqueInstanceIds.map(async (instanceId) => {
        const { data, error } = await supabase.functions.invoke('sync-contact-photos', {
          body: {
            instance_id: instanceId,
            limit: 100,
          }
        });

        if (error) throw error;
        return data;
      }));

      return results.reduce(
        (acc, result) => ({
          synced: acc.synced + (result?.synced || 0),
          errors: acc.errors + (result?.errors || 0),
          total: acc.total + (result?.total || 0),
          silent,
        }),
        { synced: 0, errors: 0, total: 0, silent }
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });

      if (!data?.silent) {
        toast.success(`Fotos sincronizadas: ${data.synced || 0} atualizadas`);
      }
    },
    onError: (error, variables) => {
      console.error('Error syncing photos:', error);

      if (variables?.contactIds?.length) {
        variables.contactIds.forEach((contactId) => attemptedPhotoSyncContactIdsRef.current.delete(contactId));
      }

      if (!variables?.silent) {
        toast.error('Erro ao sincronizar fotos');
      }
    },
  });

  // Extract all unique phone numbers from conversations to fetch leads
  const phoneNumbers = useMemo(() => {
    if (!conversas) return [];
    return conversas
      .map(c => (c.contact as any)?.contact_phone)
      .filter(Boolean)
      .map(phone => normalizeToE164(phone))
      .filter(Boolean) as string[];
  }, [conversas]);

  // Fetch leads by phone numbers
  const { data: leadsMap } = useQuery({
    queryKey: ['sigzap-leads-by-phone-livres', phoneNumbers],
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
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });
    },
  });

  // Extended handler that also marks as read
  const handleSelectConversaWithRead = (conversa: any) => {
    handleSelectConversa(conversa);
    if (conversa.unread_count > 0) {
      markAsReadMutation.mutate(conversa.id);
    }

    // Sync photo on click if missing
    const contact = conversa.contact as any;
    if (contact?.id && !contact?.profile_picture_url && !attemptedPhotoSyncContactIdsRef.current.has(contact.id)) {
      attemptedPhotoSyncContactIdsRef.current.add(contact.id);
      syncPhotosMutation.mutate({ contactIds: [contact.id], silent: true });
    }
  };

  // Subscribe to realtime updates
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const channel = supabase
      .channel('sigzap-conversations-realtime')
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

  useEffect(() => {
    if (!conversas?.length || syncPhotosMutation.isPending) return;

    const missingContactIds = Array.from(
      new Set(
        conversas
          .filter((conversa) => {
            const contact = conversa.contact as any;
            return !!contact?.id && !contact?.profile_picture_url && !attemptedPhotoSyncContactIdsRef.current.has(contact.id);
          })
          .map((conversa) => (conversa.contact as any)?.id)
          .filter(Boolean)
      )
    );

    if (missingContactIds.length === 0) return;

    missingContactIds.forEach((contactId) => attemptedPhotoSyncContactIdsRef.current.add(contactId));

    syncPhotosMutation.mutate({
      contactIds: missingContactIds,
      silent: true,
    });
  }, [conversas, syncPhotosMutation]);

  // Filter conversations by search term, exclude those assigned to current user (they show in "Minhas Conversas")
  const filteredConversas = conversas?.filter(c => {
    // Hide conversations assigned to the current user - they appear in column 2
    if (c.assigned_user_id === user?.id) return false;

    // Filter by tab
    if (filtroAtivo === "nao_lidas" && (c.unread_count || 0) === 0) return false;

    const contact = c.contact as any;
    const searchLower = searchTerm.toLowerCase();
    return (
      contact?.contact_name?.toLowerCase().includes(searchLower) ||
      contact?.contact_phone?.includes(searchTerm) ||
      c.last_message_text?.toLowerCase().includes(searchLower)
    );
  }) || [];

  // Single unified list - no more split between Livres/Atribuídas

  const toHslWithAlpha = (color: string, alpha: number) => {
    if (color.startsWith('hsl(')) {
      return color.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
    }
    if (color.startsWith('#')) return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
    return color;
  };

  const renderConversaCard = (conversa: any, corCaptador: string | null) => {
    const contact = conversa.contact as any;
    const instance = conversa.instance as any;
    const assignedUser = conversa.assigned_user as any;
    const lastMessageAt = conversa.last_message_at;
    const msgCount = conversa.unread_count || 0;
    const isAssigned = !!conversa.assigned_user_id;
    const isSelected = selectedConversaId === conversa.id;
    const activeColor = isAssigned && corCaptador ? corCaptador : null;
    const assignedName = assignedUser?.nome_completo?.split(' ')[0] || null;
    
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
          !isSelected && !isAssigned && "hover:bg-muted/40"
        )}
        style={{
          borderLeftColor: isAssigned && corCaptador ? corCaptador : 'transparent',
          ...(isSelected ? {
            backgroundColor: activeColor || 'hsl(var(--primary))',
            color: 'white',
          } : isAssigned && corCaptador ? {
             backgroundColor: toHslWithAlpha(corCaptador, 0.1),
          } : {})
        }}
        onClick={() => handleSelectConversaWithRead(conversa)}
      >
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <div 
              className="h-9 w-9 rounded-full flex items-center justify-center overflow-hidden"
              style={{ 
                backgroundColor: isAssigned && corCaptador 
                  ? toHslWithAlpha(corCaptador, 0.12) 
                  : 'hsl(var(--muted) / 0.5)' 
              }}
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
              <User 
                className={cn("h-4 w-4 absolute", contact?.profile_picture_url && "hidden")} 
                style={{ color: isAssigned && corCaptador ? corCaptador : 'hsl(var(--muted-foreground))' }} 
              />
            </div>
            {msgCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center z-10">
                {msgCount > 99 ? '99+' : msgCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className={cn("font-medium text-sm truncate", isSelected && "text-white")}>{displayName}</h4>
              <div className="flex items-center gap-1 flex-shrink-0">
                {lastMessageAt && (
                  <span className={cn("text-[10px]", isSelected ? "text-white/70" : "text-muted-foreground")}>
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
            <p className={cn("text-xs truncate mt-0.5", isSelected ? "text-white/70" : "text-muted-foreground")}>
              {contact?.contact_phone}
            </p>
            {conversa.last_message_text && (
              <p className={cn("text-xs truncate mt-1 italic", isSelected ? "text-white/60" : "text-muted-foreground/80")}>
                {conversa.last_message_text}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {instance?.name && (
                <Badge variant="outline" className={cn("text-[10px] h-5", isSelected ? "border-white/40 text-white bg-white/10" : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300")}>
                  {instance.name}
                </Badge>
              )}
              {isAssigned ? (
                <Badge 
                  variant="outline" 
                  className={cn("text-[10px] h-5 font-semibold", isSelected ? "border-white/40 text-white bg-white/20" : "")}
                  style={!isSelected ? { 
                    backgroundColor: corCaptador ? toHslWithAlpha(corCaptador, 0.1) : undefined,
                    color: corCaptador || 'hsl(var(--emerald-700, 160 84% 39%))',
                    borderColor: corCaptador ? toHslWithAlpha(corCaptador, 0.3) : undefined,
                  } : {}}
                >
                  {assignedName ? `${assignedName}` : 'Atendendo'}
                </Badge>
              ) : (
                <Badge variant="outline" className={cn("text-[10px] h-5", isSelected ? "border-white/40 text-white bg-white/20" : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300")}>
                  Livre
                </Badge>
              )}
              {msgCount > 0 && (
                <Badge className={cn("text-[10px] h-5 gap-1", isSelected ? "bg-white/20 text-white" : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700")}>
                  <MessageCircle className="h-3 w-3" />
                  {msgCount}
                </Badge>
              )}
              {conversa.not_the_doctor && (
                <Badge variant="outline" className={cn("text-[10px] h-5 gap-0.5", isSelected ? "border-white/40 text-white bg-white/20" : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300")}>
                  <UserX className="h-3 w-3" />
                  Não é o médico
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="flex flex-col h-full border-r overflow-hidden">
      {/* Header 1: Instance Dropdown */}
      <div className="p-3 border-b bg-muted/30 flex items-center gap-2 h-12">
        <Wifi className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm flex-1">Conversas</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6" 
            onClick={() => syncPhotosMutation.mutate({ instanceIds: selectedInstanceIds })}
            disabled={syncPhotosMutation.isPending}
            title="Sincronizar fotos de contatos"
          >
            {syncPhotosMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Camera className="h-3 w-3" />
            )}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-7 w-7">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3 max-h-[60vh] overflow-hidden" align="end">
              <SigZapInstanceMultiSelect
                selectedIds={selectedInstanceIds}
                onSelectionChange={onSelectInstances}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Header 3: Search Bar */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Conversations count */}
      <div className="flex items-center justify-between px-3 py-2 border-b text-xs text-muted-foreground">
        <span>{filteredConversas.length} conversa{filteredConversas.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-2">
          {selectedInstanceIds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Wifi className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p>Selecione instâncias</p>
              <p className="text-xs mt-1">para ver as conversas</p>
            </div>
          ) : loadingConversas ? (
            [...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))
          ) : filteredConversas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma conversa encontrada
            </div>
          ) : (
            <>
              {filteredConversas.map((conversa) => {
                const corCaptador = conversa.assigned_user_id 
                  ? captadorCores?.[conversa.assigned_user_id] || null 
                  : null;
                return renderConversaCard(conversa, corCaptador);
              })}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
