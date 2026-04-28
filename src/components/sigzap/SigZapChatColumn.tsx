import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Send, Loader2, User, RefreshCw, MessageCircle, 
  Phone, FileText, UserCheck, Image, Video, Mic, FileIcon,
  CheckCheck, Check, Clock, Paperclip, History, X, Ban,
  MapPin, BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { SigZapAudioRecorder, SigZapMicButton } from "./SigZapAudioRecorder";
import { SigZapAudioPlayer, SigZapVideoPlayer } from "./SigZapMediaPlayer";
import { SigZapDocumentCard } from "./SigZapDocumentCard";
import { 
  SigZapStagingArea, 
  SigZapDropOverlay, 
  StagedFile, 
  getFileMediaType, 
  createFilePreview 
} from "./SigZapStagingArea";
import { SigZapMessageContextMenu, SigZapReplyPreview, SigZapEditPreview } from "./SigZapMessageContextMenu";
import { LeadProntuarioDialog } from "@/components/medicos/LeadProntuarioDialog";
import { SigZapLeadLinkDialog } from "./SigZapLeadLinkDialog";
import { SigZapLeadAutoMatchDialog } from "./SigZapLeadAutoMatchDialog";
import { normalizeToE164 } from "@/lib/phoneUtils";
import { renderMessageWithPhoneLinks } from "./SigZapPhoneLink";
import { SigZapPhonePopover } from "./SigZapPhoneLink";
import { formatWhatsappNode } from "@/lib/whatsappFormat";

interface SigZapChatColumnProps {
  conversaId: string | null;
  hideLeadButton?: boolean;
}

interface SigZapMessage {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  from_me: boolean;
  message_text: string | null;
  message_type: string;
  message_status: string | null;
  media_storage_path: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  media_caption: string | null;
  media_filename: string | null;
  reaction: string | null;
  sent_at: string;
  created_at: string;
  sent_by_user_id: string | null;
  sent_via_instance_name: string | null;
  contact_data?: any;
  location_data?: any;
  poll_data?: any;
  raw_payload?: any;
}

interface SenderInfo {
  nome: string;
  cor: string | null;
  initials: string;
}

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB

export function SigZapChatColumn({ conversaId, hideLeadButton = false }: SigZapChatColumnProps) {
  const [mensagem, setMensagem] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<{id: string; text: string; timestamp: Date}[]>([]);
  const [replyingTo, setReplyingTo] = useState<{
    messageId: string;
    waMessageId: string | null;
    messageText: string | null;
  } | null>(null);
  const [editingMessage, setEditingMessage] = useState<{
    messageId: string;
    waMessageId: string;
    currentText: string;
  } | null>(null);
  
  // Lead Prontuario state
  const [prontuarioOpen, setProntuarioOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isNewLead, setIsNewLead] = useState(false);
  const [isCheckingLead, setIsCheckingLead] = useState(false);
  const [leadLinkDialogOpen, setLeadLinkDialogOpen] = useState(false);
  const [pendingContactPhone, setPendingContactPhone] = useState("");
  const [pendingContactName, setPendingContactName] = useState("");
  const [autoMatchDialogOpen, setAutoMatchDialogOpen] = useState(false);
  const [autoMatchLead, setAutoMatchLead] = useState<any>(null);
  
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const realtimeChannelInstanceIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Fetch conversation details
  const { data: conversa, isLoading: loadingConversa } = useQuery({
    queryKey: ['sigzap-chat-conversa', conversaId],
    queryFn: async () => {
      if (!conversaId) return null;
      const { data, error } = await supabase
        .from('sigzap_conversations')
        .select(`
          *,
          contact:sigzap_contacts(*),
          instance:sigzap_instances(id, name, instance_uuid),
          assigned_user:profiles!sigzap_conversations_assigned_user_id_fkey(id, nome_completo),
          lead:leads!sigzap_conversations_lead_id_fkey(id, nome, phone_e164, telefones_adicionais)
        `)
        .eq('id', conversaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!conversaId,
  });

  // Fetch captador color based on assigned user
  const assignedUserId = conversa?.assigned_user_id;
  const { data: captadorPermissao } = useQuery({
    queryKey: ['captador-cor', assignedUserId],
    queryFn: async () => {
      if (!assignedUserId) return null;
      const { data, error } = await supabase
        .from('captacao_permissoes_usuario')
        .select('cor')
        .eq('user_id', assignedUserId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!assignedUserId,
  });

  const captadorColor = captadorPermissao?.cor || null;

  // Check if conversation has a linked lead (prefer lead_id from join, fallback to phone/name lookup)
  const contactPhone = (conversa?.contact as any)?.contact_phone;
  const contactName = (conversa?.contact as any)?.contact_name || '';
  const contactJid = (conversa?.contact as any)?.contact_jid || '';
  const isLidContact = contactJid.includes('@lid') || (contactPhone && contactPhone.length > 15);
  const leadFromJoin = conversa?.lead as any;
  const hasLinkedLead = !!conversa?.lead_id || !!leadFromJoin?.id;

  // Extract the real phone number from contact_jid (strip @s.whatsapp.net)
  // For LID contacts, resolve from message raw_payload
  const jidPhone = (!isLidContact && contactJid.includes('@s.whatsapp.net'))
    ? contactJid.replace('@s.whatsapp.net', '')
    : null;

  const { data: resolvedLidPhone } = useQuery({
    queryKey: ['sigzap-resolve-lid-phone', conversaId, contactJid],
    queryFn: async () => {
      if (!conversaId) return null;
      const { data: recentMessages } = await supabase
        .from('sigzap_messages')
        .select('raw_payload')
        .eq('conversation_id', conversaId)
        .not('raw_payload', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(20);
      if (!recentMessages) return null;
      for (const msg of recentMessages) {
        let payload = msg.raw_payload as any;
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch { continue; }
        }
        const alt = payload?.data?.key?.remoteJidAlt;
        const rjid = payload?.key?.remoteJid;
        if (alt?.includes('@s.whatsapp.net')) return alt.replace('@s.whatsapp.net', '');
        if (rjid?.includes('@s.whatsapp.net') && !rjid.includes('@lid')) return rjid.replace('@s.whatsapp.net', '');
      }
      return null;
    },
    enabled: !!conversaId && isLidContact,
    staleTime: 5 * 60 * 1000,
  });

  // The resolved display phone: jidPhone for normal contacts, resolvedLidPhone for LID
  const resolvedDisplayPhone = jidPhone || resolvedLidPhone || null;

  // Auto-link ONLY for disparo fallback matches. Everything else is manual.
  const { data: leadMatchResult } = useQuery({
    queryKey: ['sigzap-linked-lead', conversaId, conversa?.lead_id, contactPhone, isLidContact],
    queryFn: async () => {
      // Only auto-link if we have a real phone number (not LID)
      if (!isLidContact && contactPhone) {
        const phoneE164 = normalizeToE164(contactPhone);
        if (phoneE164) {
          // Check if this phone was part of a disparo and has a linked lead_id
          const { data: disparoMatch } = await supabase
            .from('disparos_contatos')
            .select('lead_id')
            .eq('telefone_e164', phoneE164)
            .not('lead_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (disparoMatch?.lead_id) {
            // Fetch the lead details for silent auto-link
            const { data: lead } = await supabase
              .from('leads')
              .select('id, nome, phone_e164, telefones_adicionais, email, uf, especialidade')
              .eq('id', disparoMatch.lead_id)
              .maybeSingle();
            if (lead) {
              return { mode: 'auto-silent' as const, lead: { ...lead, score: 100 } };
            }
          }

          // Exact lead match by phone in base → silent auto-link too
          const { data: exactLead } = await supabase
            .from('leads')
            .select('id, nome, phone_e164, telefones_adicionais, email, uf, especialidade')
            .eq('phone_e164', phoneE164)
            .maybeSingle();

          if (exactLead) {
            return { mode: 'auto-silent' as const, lead: { ...exactLead, score: 100 } };
          }

          const { data: extraPhoneLead } = await supabase
            .from('leads')
            .select('id, nome, phone_e164, telefones_adicionais, email, uf, especialidade')
            .contains('telefones_adicionais', [phoneE164])
            .maybeSingle();

          if (extraPhoneLead) {
            return { mode: 'auto-silent' as const, lead: { ...extraPhoneLead, score: 100 } };
          }
        }
      }

      // Everything else → manual linking
      if (contactPhone || (contactName && contactName.length >= 3)) {
        return { mode: 'manual' as const };
      }

      return null;
    },
    enabled: !!conversaId && !loadingConversa && !hasLinkedLead && (!!contactPhone || (!!contactName && contactName.length >= 3)),
    staleTime: 0,
  });

  const linkedLead = leadMatchResult?.mode === 'auto-silent' ? leadMatchResult.lead : null;

  // Check if contact phone is blacklisted
  const phoneForBlacklist = resolvedDisplayPhone 
    ? normalizeToE164(resolvedDisplayPhone) 
    : (!isLidContact ? normalizeToE164(contactPhone) : null);
  
  const { data: isBlacklisted } = useQuery({
    queryKey: ['sigzap-blacklist-check', phoneForBlacklist],
    queryFn: async () => {
      if (!phoneForBlacklist) return false;
      const { count, error } = await supabase
        .from('blacklist')
        .select('id', { count: 'exact', head: true })
        .eq('phone_e164', phoneForBlacklist);
      if (error) return false;
      return (count || 0) > 0;
    },
    enabled: !!phoneForBlacklist,
    staleTime: 60 * 1000,
  });

  // Show auto-match confirmation modal when lead found but not yet linked
  // Auto-silent: link automatically without confirmation for disparo matches
  // Manual: open the manual search dialog for everything else
  useEffect(() => {
    if (!conversaId || loadingConversa || hasLinkedLead) {
      setLeadLinkDialogOpen(false);
      setAutoMatchDialogOpen(false);
      setAutoMatchLead(null);
      return;
    }

    const phoneDisplay = resolvedDisplayPhone
      ? (normalizeToE164(resolvedDisplayPhone) || resolvedDisplayPhone)
      : (!isLidContact ? (normalizeToE164(contactPhone) || contactPhone || '') : '');

    setPendingContactPhone(phoneDisplay);
    setPendingContactName(contactName || 'Contato');

    if (leadMatchResult?.mode === 'auto-silent' && leadMatchResult.lead?.id) {
      // Silently auto-link — no modal needed
      (async () => {
        await supabase
          .from('sigzap_conversations')
          .update({ lead_id: leadMatchResult.lead.id })
          .eq('id', conversaId);
        queryClient.invalidateQueries({ queryKey: ['sigzap-chat-conversa', conversaId] });
        queryClient.invalidateQueries({ queryKey: ['sigzap-linked-lead'] });
        toast.success("Lead vinculado automaticamente (disparo)");
      })();
      return;
    }

    if (leadMatchResult?.mode === 'manual') {
      setAutoMatchLead(null);
      setAutoMatchDialogOpen(false);
      setLeadLinkDialogOpen(true);
      return;
    }

    setLeadLinkDialogOpen(false);
  }, [leadMatchResult, hasLinkedLead, loadingConversa, conversaId, contactPhone, contactName, isLidContact, resolvedDisplayPhone]);

  // Reset dismissed state when conversation changes
  const prevConversaIdRef = useRef<string | null>(null);

  // Fetch messages with proper cache handling for conversation switches
  const { data: mensagens, isLoading: loadingMensagens, refetch, isFetching } = useQuery({
    queryKey: ['sigzap-messages', conversaId],
    queryFn: async () => {
      if (!conversaId) return [];
      
      const { data, error } = await supabase
        .from('sigzap_messages')
        .select('*, sent_by_user_id, sent_via_instance_name')
        .eq('conversation_id', conversaId)
        .order('sent_at', { ascending: true });
      
      if (error) throw error;
      return (data || []).map(msg => ({ ...msg, reaction: msg.reaction ?? null })) as SigZapMessage[];
    },
    enabled: !!conversaId,
    staleTime: 0, // Always refetch on conversation change
  });

  // Fetch sender info for all unique senders in messages
  const senderIds = [...new Set(
    (mensagens || [])
      .filter(m => m.from_me && m.sent_by_user_id)
      .map(m => m.sent_by_user_id!)
  )];

  const { data: sendersData } = useQuery({
    queryKey: ['sigzap-senders', ...senderIds],
    queryFn: async () => {
      if (senderIds.length === 0) return {};
      
      // Fetch profiles and captador colors in parallel
      const [profilesRes, colorsRes] = await Promise.all([
        supabase.from('profiles').select('id, nome_completo').in('id', senderIds),
        supabase.from('captacao_permissoes_usuario').select('user_id, cor').in('user_id', senderIds),
      ]);

      const map: Record<string, SenderInfo> = {};
      for (const id of senderIds) {
        const profile = profilesRes.data?.find(p => p.id === id);
        const color = colorsRes.data?.find(c => c.user_id === id);
        const nome = profile?.nome_completo || 'Usuário';
        const parts = nome.split(' ').filter(p => p.length > 0);
        const initials = parts.length >= 2 
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : nome.trim().slice(0, 2).toUpperCase();
        map[id] = { nome, cor: color?.cor || null, initials };
      }
      return map;
    },
    enabled: senderIds.length > 0,
    staleTime: 60000,
  });

  // Detect if we're switching conversations (different from just refetching)
  const isConversationSwitch = conversaId !== prevConversaIdRef.current && prevConversaIdRef.current !== null;
  
  // Handle conversation change - clear local state immediately
  useEffect(() => {
    if (conversaId !== prevConversaIdRef.current) {
      // Clear pending messages from previous conversation
      setPendingMessages([]);
      // Clear reply state
      setReplyingTo(null);
      // Clear staged files inline
      setStagedFiles(prev => {
        prev.forEach(file => {
          if (file.preview) URL.revokeObjectURL(file.preview);
        });
        return [];
      });
      // Clear message input
      setMensagem("");
      // Don't clear auto-match state here — let the auto-match effect re-trigger
      
      prevConversaIdRef.current = conversaId;
    }
  }, [conversaId]);

  // Auto-sync: fetch history page 1 + contact profile on conversation open
  const autoSyncTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversaId || autoSyncTriggeredRef.current === conversaId) return;
    autoSyncTriggeredRef.current = conversaId;

    // Fire-and-forget background sync (no loading UI)
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('sigzap-fetch-history', {
          body: { conversationId: conversaId, page: 1 },
        });
        if (error) {
          console.log('Auto-sync error (non-blocking):', error);
          return;
        }
        const imported = data?.imported || 0;
        const profileUpdated = data?.profile_updated || false;
        
        if (imported > 0) {
          queryClient.invalidateQueries({ queryKey: ['sigzap-messages', conversaId] });
        }
        if (profileUpdated) {
          queryClient.invalidateQueries({ queryKey: ['sigzap-chat-conversa', conversaId] });
          queryClient.invalidateQueries({ queryKey: ['conversas'] });
        }
      } catch (e) {
        console.log('Auto-sync error (non-blocking):', e);
      }
    })();
  }, [conversaId, queryClient]);

  // Show loading skeleton only on initial load or conversation switch with no data
  const showLoadingSkeleton = loadingMensagens || (isConversationSwitch && isFetching && !mensagens?.length);

  // Subscribe to realtime updates
  useEffect(() => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    if (!conversaId) return;

    const channel = supabase
      .channel(`sigzap-messages-${conversaId}-${realtimeChannelInstanceIdRef.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sigzap_messages',
          filter: `conversation_id=eq.${conversaId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['sigzap-messages', conversaId] });
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [conversaId, queryClient]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensagens]);

  // Cleanup staged file previews on unmount
  useEffect(() => {
    return () => {
      stagedFiles.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show drop overlay for actual file drags, not internal conversation drags
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if leaving the container
    const rect = chatContainerRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsDragging(false);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    addFilesToStaging(files);
  }, []);

  // Handle paste event for Ctrl+V file upload
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      addFilesToStaging(files);
    }
  }, []);

  // Add files to staging area
  const addFilesToStaging = (files: File[]) => {
    const newStagedFiles: StagedFile[] = [];
    
    for (const file of files) {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} é muito grande. Máximo: 16MB`);
        continue;
      }

      const type = getFileMediaType(file);
      const preview = createFilePreview(file, type);
      
      newStagedFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview,
        type,
      });
    }

    if (newStagedFiles.length > 0) {
      setStagedFiles(prev => [...prev, ...newStagedFiles]);
    }
  };

  // Remove file from staging
  const removeFromStaging = (id: string) => {
    setStagedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  // Clear all staged files
  const clearStaging = () => {
    stagedFiles.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });
    setStagedFiles([]);
  };

  // Sanitize filename for storage
  const sanitizeFileName = (filename: string): string => {
    return filename
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');
  };

  // Upload media to storage
  const uploadMedia = async (file: File, type: 'audio' | 'video' | 'image' | 'document'): Promise<string> => {
    const contact = conversa?.contact as any;
    const instance = conversa?.instance as any;
    
    const timestamp = Date.now();
    const sanitizedName = sanitizeFileName(file.name);
    const extension = sanitizedName.split('.').pop() || 'bin';
    const fileName = `${timestamp}_${sanitizedName}`;
    const filePath = `${instance?.instance_uuid || 'unknown'}/${contact?.contact_jid || 'unknown'}/${fileName}`;
    
    const { data, error } = await supabase.storage
      .from('sigzap-media')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });
    
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from('sigzap-media')
      .getPublicUrl(data.path);
    
    return publicUrl;
  };

  // Upload audio blob
  const uploadAudioBlob = async (blob: Blob): Promise<string> => {
    const contact = conversa?.contact as any;
    const instance = conversa?.instance as any;
    
    const timestamp = Date.now();
    const extension = blob.type.includes('webm') ? 'webm' : 'mp4';
    const fileName = `audio_${timestamp}.${extension}`;
    const filePath = `${instance?.instance_uuid || 'unknown'}/${contact?.contact_jid || 'unknown'}/${fileName}`;
    
    const { data, error } = await supabase.storage
      .from('sigzap-media')
      .upload(filePath, blob, {
        contentType: blob.type,
        upsert: false,
      });
    
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from('sigzap-media')
      .getPublicUrl(data.path);
    
    return publicUrl;
  };

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async ({ 
      texto, 
      mediaUrl, 
      mediaType, 
      mediaCaption,
      mediaFilename,
      mediaMimeType,
      quotedMessageId
    }: { 
      texto?: string; 
      mediaUrl?: string; 
      mediaType?: string;
      mediaCaption?: string;
      mediaFilename?: string;
      mediaMimeType?: string;
      quotedMessageId?: string;
    }) => {
      if (!conversaId || !conversa) throw new Error('Conversa não encontrada');
      
      const contact = conversa.contact as any;
      const instance = conversa.instance as any;
      
      // Para enviar texto, não dependemos de instance_uuid (isso pode estar vazio em instâncias novas).
      // Precisamos apenas do nome da instância e de um identificador do contato.
      if (!instance?.name || (!contact?.contact_jid && !contact?.contact_phone)) {
        throw new Error('Dados de contato ou instância inválidos');
      }

      // Call edge function to send message
      const { data, error } = await supabase.functions.invoke('send-sigzap-message', {
        body: {
          action: 'send',
          conversationId: conversaId,
          instanceName: instance.name,
          contactJid: contact.contact_jid || `${contact.contact_phone}@s.whatsapp.net`,
          message: texto,
          mediaUrl,
          mediaType,
          mediaCaption,
          mediaFilename,
          mediaMimeType,
          quotedMessageId,
        },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-messages', conversaId] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['lead-status-proposta'] });
      queryClient.invalidateQueries({ queryKey: ['lead-canais'] });
      queryClient.invalidateQueries({ queryKey: ['acompanhamento-leads'] });
      queryClient.invalidateQueries({ queryKey: ['campanha-lista-leads'] });
      // Note: setReplyingTo(null) and setMensagem("") are now handled in handleSendText for optimistic UX
    },
    onError: (error: any) => {
      console.error('Error sending message:', error);

      // Parse error for better user feedback
      try {
        const raw = String(error?.message ?? '');
        
        // Check for Connection Closed error (disconnected instance)
        if (raw.includes('Connection Closed') || raw.includes('connection closed')) {
          toast.error("Instância desconectada", {
            description: "Reconecte a instância do WhatsApp para enviar mensagens.",
          });
          return;
        }

        const errorDetails = raw
          ? JSON.parse(raw.replace('Edge function returned 400: Error, ', ''))
          : null;
        const apiResponse = errorDetails?.details?.response;

        if (apiResponse?.message?.[0]?.exists === false) {
          toast.error("Este número não está no WhatsApp", {
            description: "Verifique se o número está correto e possui WhatsApp ativo.",
          });
          return;
        }
        
        // Check for connection closed in parsed response
        if (apiResponse?.message?.some?.((m: any) => 
          typeof m === 'string' && m.toLowerCase().includes('connection closed')
        )) {
          toast.error("Instância desconectada", {
            description: "Reconecte a instância do WhatsApp para enviar mensagens.",
          });
          return;
        }
      } catch {
        // ignore parse errors
      }

      const fallbackMessage = error instanceof Error ? error.message : undefined;
      toast.error("Erro ao enviar mensagem", {
        description: fallbackMessage && fallbackMessage !== 'Erro ao enviar mensagem' ? fallbackMessage : undefined,
      });
    },
  });

  // React mutation
  const reactMutation = useMutation({
    mutationFn: async ({ waMessageId, fromMe, emoji }: { waMessageId: string; fromMe: boolean; emoji: string }) => {
      if (!conversa) throw new Error('Conversa não encontrada');
      
      const contact = conversa.contact as any;
      const instance = conversa.instance as any;

      const { data, error } = await supabase.functions.invoke('send-sigzap-message', {
        body: {
          action: 'react',
          instanceName: instance.name,
          contactJid: contact.contact_jid || `${contact.contact_phone}@s.whatsapp.net`,
          targetMessageId: waMessageId,
          targetFromMe: fromMe,
          reaction: emoji,
        },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Reação enviada!");
    },
    onError: () => {
      toast.error("Erro ao reagir");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ waMessageId, fromMe }: { waMessageId: string; fromMe: boolean }) => {
      if (!conversa) throw new Error('Conversa não encontrada');
      
      const contact = conversa.contact as any;
      const instance = conversa.instance as any;

      const { data, error } = await supabase.functions.invoke('send-sigzap-message', {
        body: {
          action: 'delete',
          instanceName: instance.name,
          contactJid: contact.contact_jid || `${contact.contact_phone}@s.whatsapp.net`,
          targetMessageId: waMessageId,
          targetFromMe: fromMe,
        },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-messages', conversaId] });
      toast.success("Mensagem apagada!");
    },
    onError: () => {
      toast.error("Erro ao apagar mensagem");
    },
  });

  // Handle sending text only - optimistic UI: clear input immediately and show pending message
  const handleSendText = () => {
    const textoToSend = mensagem.trim();
    if (!textoToSend) return;
    
    // If editing, send edit instead of new message
    if (editingMessage) {
      editMutation.mutate({ waMessageId: editingMessage.waMessageId, newText: textoToSend });
      setMensagem("");
      return;
    }
    
    // Generate a temporary ID for tracking
    const tempId = `pending-${Date.now()}`;
    
    // Clear input immediately for better UX
    const currentReplyingTo = replyingTo;
    setMensagem("");
    setReplyingTo(null);
    
    // Add to pending messages for optimistic display
    setPendingMessages(prev => [...prev, { id: tempId, text: textoToSend, timestamp: new Date() }]);
    
    // Send in background - mutation handles success/error
    sendMutation.mutate({ 
      texto: textoToSend,
      quotedMessageId: currentReplyingTo?.waMessageId || undefined
    }, {
      onSettled: () => {
        // Remove from pending after complete (success or error)
        setPendingMessages(prev => prev.filter(m => m.id !== tempId));
      }
    });
  };

  // Handle reply
  const handleReply = (messageId: string, messageText: string | null) => {
    const message = mensagens?.find(m => m.id === messageId);
    if (message) {
      setReplyingTo({
        messageId,
        waMessageId: message.wa_message_id,
        messageText
      });
    }
  };

  // Handle react
  const handleReact = (waMessageId: string, fromMe: boolean, emoji: string) => {
    reactMutation.mutate({ waMessageId, fromMe, emoji });
  };

  // Handle delete
  const handleDelete = (waMessageId: string, fromMe: boolean) => {
    if (window.confirm('Apagar esta mensagem para todos?')) {
      deleteMutation.mutate({ waMessageId, fromMe });
    }
  };

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async ({ waMessageId, newText }: { waMessageId: string; newText: string }) => {
      if (!conversa) throw new Error('Conversa não encontrada');
      
      const contact = conversa.contact as any;
      const instance = conversa.instance as any;

      const { data, error } = await supabase.functions.invoke('send-sigzap-message', {
        body: {
          action: 'edit',
          instanceName: instance.name,
          contactJid: contact.contact_jid || `${contact.contact_phone}@s.whatsapp.net`,
          targetMessageId: waMessageId,
          editedText: newText,
        },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-messages', conversaId] });
      toast.success("Mensagem editada!");
      setEditingMessage(null);
    },
    onError: () => {
      toast.error("Erro ao editar mensagem");
    },
  });

  // Handle edit
  const handleEdit = (messageId: string, waMessageId: string, currentText: string) => {
    setEditingMessage({ messageId, waMessageId, currentText });
    setReplyingTo(null);
    setMensagem(currentText);
  };

  // Handle sending staged files
  const handleSendStagedFiles = async () => {
    if (stagedFiles.length === 0 && !mensagem.trim()) return;

    // If only text, send text
    if (stagedFiles.length === 0) {
      await handleSendText();
      return;
    }

    setIsUploadingMedia(true);
    const caption = mensagem.trim();
    
    try {
      // Send files one by one
      for (let i = 0; i < stagedFiles.length; i++) {
        const stagedFile = stagedFiles[i];
        
        // Upload file
        const mediaUrl = await uploadMedia(stagedFile.file, stagedFile.type);
        
        // Only first file gets the caption
        const fileCaption = i === 0 ? caption : '';
        
        await sendMutation.mutateAsync({
          mediaUrl,
          mediaType: stagedFile.type,
          mediaCaption: fileCaption,
          mediaFilename: stagedFile.file.name,
          mediaMimeType: stagedFile.file.type,
        });
      }

      // Clear staging and message
      clearStaging();
      setMensagem("");
      toast.success(`${stagedFiles.length} arquivo${stagedFiles.length > 1 ? 's' : ''} enviado${stagedFiles.length > 1 ? 's' : ''}!`);
    } catch (error) {
      console.error('Error sending files:', error);
      toast.error("Erro ao enviar arquivos");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (stagedFiles.length > 0) {
        handleSendStagedFiles();
      } else {
        handleSendText();
      }
    }
  };

  // Handle audio send - with proper state management to prevent overlapping recordings
  const handleAudioSend = async (audioBlob: Blob) => {
    // Prevent sending if already uploading
    if (isUploadingAudio) {
      console.log('Already uploading audio, ignoring...');
      return;
    }
    
    try {
      setIsUploadingAudio(true);
      console.log('Uploading audio blob, size:', audioBlob.size, 'type:', audioBlob.type);
      
      const mediaUrl = await uploadAudioBlob(audioBlob);
      console.log('Audio uploaded, URL:', mediaUrl);
      
      await sendMutation.mutateAsync({ mediaUrl, mediaType: 'audio' });
      
      // Only close recording mode after successful send
      setIsRecording(false);
      toast.success("Áudio enviado!");
    } catch (error) {
      console.error('Error sending audio:', error);
      toast.error("Erro ao enviar áudio");
      // Don't close recording mode on error - let user try again or cancel
    } finally {
      setIsUploadingAudio(false);
    }
  };

  // Handle audio cancel
  const handleAudioCancel = () => {
    if (isUploadingAudio) {
      console.log('Cannot cancel while uploading');
      return;
    }
    setIsRecording(false);
  };

  // Handle file selection from input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addFilesToStaging(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Check if user can send messages - everyone can send, colors identify who is attending
  const assignedUser = conversa?.assigned_user as any;
  const canSendMessages = !!conversa;

  // Get message type icon
  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-3 w-3" />;
      case 'video': return <Video className="h-3 w-3" />;
      case 'audio': return <Mic className="h-3 w-3" />;
      case 'document': return <FileIcon className="h-3 w-3" />;
      default: return null;
    }
  };

  // Get status icon
  const getStatusIcon = (status: string | null, fromMe: boolean) => {
    if (!fromMe) return null;
    switch (status) {
      case 'sent': return <Check className="h-3 w-3" />;
      case 'delivered': return <CheckCheck className="h-3 w-3" />;
      case 'read': return <CheckCheck className="h-3 w-3 text-blue-400" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };

  // Handle Lead button click - check if lead exists or create new
  const handleLeadClick = async () => {
    if (!conversa) return;

    const linkedLeadId = conversa.lead_id || (conversa.lead as any)?.id;
    if (linkedLeadId) {
      setLeadLinkDialogOpen(false);
      setAutoMatchDialogOpen(false);
      setAutoMatchLead(null);
      setSelectedLeadId(linkedLeadId);
      setIsNewLead(false);
      setProntuarioOpen(true);
      return;
    }
    
    const contact = conversa.contact as any;
    const contactNameLocal = contact?.contact_name || contact?.contact_phone;
    
    // Use the resolved phone (from JID or LID resolution) or fallback to contact_phone
    let phoneToUse = resolvedDisplayPhone || contact?.contact_phone;
    
    if (!phoneToUse) {
      toast.error("Telefone do contato não encontrado");
      return;
    }
    
    setIsCheckingLead(true);
    
    try {
      // Normalize the phone to E164 format
      const phoneE164 = normalizeToE164(phoneToUse);
      
      if (!phoneE164) {
        toast.error(`Número de telefone inválido: ${phoneToUse}`);
        setIsCheckingLead(false);
        return;
      }
      
      // Check if lead exists with this exact phone
      const { data: existingLead, error } = await supabase
        .from('leads')
        .select('id')
        .eq('phone_e164', phoneE164)
        .maybeSingle();
      
      if (error) throw error;
      
      if (existingLead) {
        if (conversaId) {
          await supabase
            .from('sigzap_conversations')
            .update({ lead_id: existingLead.id })
            .eq('id', conversaId);
        }
        setLeadLinkDialogOpen(false);
        setAutoMatchDialogOpen(false);
        setAutoMatchLead(null);
        queryClient.invalidateQueries({ queryKey: ['sigzap-chat-conversa', conversaId] });
        queryClient.invalidateQueries({ queryKey: ['sigzap-linked-lead'] });
        toast.success("Lead identificado e vinculado à conversa");
      } else {
        // Lead doesn't exist with exact match - open dialog to link or create
        setPendingContactPhone(phoneE164);
        setPendingContactName(contactNameLocal);
        setLeadLinkDialogOpen(true);
      }
    } catch (err: any) {
      console.error('Erro ao verificar lead:', err);
      toast.error(err.message || "Erro ao processar lead");
    } finally {
      setIsCheckingLead(false);
    }
  };

  const handleAutoMatchConfirm = async (leadId: string) => {
    try {
      // Link lead_id on conversation
      if (conversaId) {
        await supabase
          .from('sigzap_conversations')
          .update({ lead_id: leadId })
          .eq('id', conversaId);
      }
      toast.success("Lead vinculado automaticamente!");
      queryClient.invalidateQueries({ queryKey: ['sigzap-chat-conversa', conversaId] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-linked-lead'] });
      setAutoMatchLead(null);
    } catch (err: any) {
      toast.error("Erro ao vincular lead");
    }
  };

  const handleAutoMatchReject = () => {
    // Just close - modal will reappear next time this conversation is selected
    setAutoMatchLead(null);
  };

  const handleLinkToExistingLead = async (leadId: string) => {
    // Update the lead's phone if needed
    if (pendingContactPhone) {
      // Fetch first kanban status for 'leads' module (skip 'Novo')
      const { data: kanbanStatuses } = await supabase
        .from('kanban_status_config')
        .select('status_id')
        .eq('modulo', 'leads')
        .eq('ativo', true)
        .order('ordem');

      const acompanhamentoStatus = kanbanStatuses?.find(s => s.status_id !== 'Novo')?.status_id || 'Acompanhamento';

      await supabase
        .from('leads')
        .update({ 
          phone_e164: pendingContactPhone,
          status: acompanhamentoStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
      
      // Also link on conversation
      if (conversaId) {
        await supabase
          .from('sigzap_conversations')
          .update({ lead_id: leadId })
          .eq('id', conversaId);
      }
      
      toast.success("Contato vinculado ao lead e movido para Acompanhamento");
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-chat-conversa', conversaId] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-lead-exists'] });
    }
    
    setSelectedLeadId(leadId);
    setIsNewLead(false);
    setProntuarioOpen(true);
  };

  const handleCreateNewLead = async () => {
    try {
      // Fetch first kanban status for 'leads' module (skip 'Novo')
      const { data: kanbanStatuses } = await supabase
        .from('kanban_status_config')
        .select('status_id')
        .eq('modulo', 'leads')
        .eq('ativo', true)
        .order('ordem');

      const acompanhamentoStatus = kanbanStatuses?.find(s => s.status_id !== 'Novo')?.status_id || 'Acompanhamento';

      const { data: newLead, error: insertError } = await supabase
        .from('leads')
        .insert({
          nome: pendingContactName,
          phone_e164: pendingContactPhone,
          origem: 'SigZap',
          status: acompanhamentoStatus,
        })
        .select('id')
        .single();
      
      if (insertError) throw insertError;
      
      // Link conversation to new lead
      if (conversaId) {
        await supabase
          .from('sigzap_conversations')
          .update({ lead_id: newLead.id })
          .eq('id', conversaId);
      }

      setSelectedLeadId(newLead.id);
      setIsNewLead(false);
      setProntuarioOpen(true);
      toast.success("Novo lead criado e movido para Acompanhamento");
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-lead-exists'] });
    } catch (err: any) {
      console.error('Erro ao criar lead:', err);
      toast.error(err.message || "Erro ao criar lead");
    }
  };

  // Handle attaching a document from chat to the linked lead
  const handleAttachToLead = async (messageId: string, mediaUrl: string, filename: string) => {
    if (!linkedLead?.id || !user) return;
    
    try {
      toast.loading("Anexando ao lead...", { id: 'attach-lead' });
      
      // Download file from the media URL
      const response = await fetch(mediaUrl);
      if (!response.ok) throw new Error("Não foi possível baixar o arquivo");
      const blob = await response.blob();
      
      // Get user profile name
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user.id)
        .single();
      
      // Upload to lead-anexos storage bucket
      const fileExt = filename.split('.').pop() || 'pdf';
      const storagePath = `${linkedLead.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('lead-anexos')
        .upload(storagePath, blob);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('lead-anexos')
        .getPublicUrl(storagePath);
      
      // Insert record in lead_anexos
      const { error: insertError } = await supabase
        .from('lead_anexos')
        .insert({
          lead_id: linkedLead.id,
          arquivo_nome: filename,
          arquivo_url: publicUrl,
          arquivo_tipo: blob.type || 'application/pdf',
          arquivo_tamanho: blob.size,
          usuario_id: user.id,
          usuario_nome: profile?.nome_completo || 'Usuário',
        });
      
      if (insertError) throw insertError;
      
      toast.success(`Documento anexado ao lead "${linkedLead.nome}"`, { id: 'attach-lead' });
      queryClient.invalidateQueries({ queryKey: ['lead-anexos', linkedLead.id] });
    } catch (err: any) {
      console.error('Erro ao anexar ao lead:', err);
      toast.error(err.message || "Erro ao anexar documento", { id: 'attach-lead' });
    }
  };

  // Reset history pagination when conversation changes
  // Start at page 2 since auto-sync already fetches page 1
  useEffect(() => {
    setHistoryPage(2);
    setHistoryHasMore(true);
  }, [conversaId]);

  // Fetch message history from Evolution API (50 per click)
  const handleFetchHistory = async () => {
    if (!conversaId || fetchingHistory) return;
    
    setFetchingHistory(true);
    let currentPage = historyPage;
    let totalImported = 0;

    try {
      // Loop: if a page returns 0 new but has_more, auto-advance to next page
      while (true) {
        const { data, error } = await supabase.functions.invoke('sigzap-fetch-history', {
          body: { conversationId: conversaId, page: currentPage },
        });

        if (error) throw error;

        const imported = data?.imported || 0;
        const hasMore = data?.has_more ?? false;
        totalImported += imported;

        if (imported > 0) {
          // Found new messages, advance page and stop
          setHistoryPage(currentPage + 1);
          setHistoryHasMore(hasMore);
          await queryClient.invalidateQueries({ queryKey: ['sigzap-messages', conversaId] });
          toast.success(`${totalImported} mensagens importadas`);
          break;
        } else if (hasMore) {
          // All already existed on this page, auto-advance
          currentPage++;
          continue;
        } else {
          // No more pages
          setHistoryPage(currentPage + 1);
          setHistoryHasMore(false);
          if (totalImported > 0) {
            await queryClient.invalidateQueries({ queryKey: ['sigzap-messages', conversaId] });
            toast.success(`${totalImported} mensagens importadas`);
          } else {
            toast.info("Nenhuma mensagem nova encontrada");
          }
          break;
        }
      }
    } catch (err: any) {
      console.error('Erro ao buscar histórico:', err);
      toast.error(err?.message || "Erro ao buscar histórico");
    } finally {
      setFetchingHistory(false);
    }
  };

  // Render media content inline
  const renderMediaContent = (msg: SigZapMessage, isFromMe: boolean) => {
    const { message_type, media_url, media_filename, media_mime_type } = msg;

    // ----- Special non-media types: contact, location, poll -----
    // Reconstruct from raw_payload as fallback for messages saved before the new fields were populated.
    const evoMsg = msg.raw_payload?.data?.message || msg.raw_payload?.message || {};

    if (message_type === 'contact' || evoMsg.contactMessage) {
      let cd = msg.contact_data as any;
      if (!cd && evoMsg.contactMessage) {
        const vcard: string = evoMsg.contactMessage.vcard || '';
        const waidMatch = vcard.match(/waid=(\d+)/);
        const phoneMatch = vcard.match(/TEL[^:]*:([+\d\s\-()]+)/);
        cd = {
          displayName: evoMsg.contactMessage.displayName || null,
          phone: waidMatch ? waidMatch[1] : (phoneMatch ? phoneMatch[1].trim() : null),
        };
      }
      const displayName = cd?.displayName || 'Contato';
      const phone = cd?.phone || null;
      return (
        <div className={cn(
          "mb-2 rounded-md border p-2 flex items-center gap-3 min-w-[220px]",
          isFromMe ? "bg-white/10 border-white/20" : "bg-background/60 border-border"
        )}>
          <div className={cn(
            "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
            isFromMe ? "bg-white/20" : "bg-muted"
          )}>
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{displayName}</div>
            {phone && (
              <div className={cn("text-xs truncate", isFromMe ? "text-white/80" : "text-muted-foreground")}>
                {phone}
              </div>
            )}
          </div>
          {phone && (
            <a
              href={`tel:${phone}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
                isFromMe ? "bg-white/20 hover:bg-white/30" : "bg-primary/10 hover:bg-primary/20"
              )}
              title="Ligar"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
        </div>
      );
    }

    if (message_type === 'location' || evoMsg.locationMessage) {
      let ld = msg.location_data as any;
      if (!ld && evoMsg.locationMessage) {
        ld = {
          latitude: evoMsg.locationMessage.degreesLatitude ?? null,
          longitude: evoMsg.locationMessage.degreesLongitude ?? null,
          name: evoMsg.locationMessage.name ?? null,
          address: evoMsg.locationMessage.address ?? null,
        };
      }
      const lat = ld?.latitude;
      const lng = ld?.longitude;
      const mapsUrl = (lat != null && lng != null) ? `https://maps.google.com/?q=${lat},${lng}` : null;
      return (
        <div className={cn(
          "mb-2 rounded-md border p-2 min-w-[220px]",
          isFromMe ? "bg-white/10 border-white/20" : "bg-background/60 border-border"
        )}>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-4 w-4" />
            <span className="font-medium text-sm">Localização</span>
          </div>
          {ld?.name && <div className="text-sm truncate">{ld.name}</div>}
          {ld?.address && (
            <div className={cn("text-xs truncate", isFromMe ? "text-white/80" : "text-muted-foreground")}>
              {ld.address}
            </div>
          )}
          {lat != null && lng != null && (
            <div className={cn("text-xs", isFromMe ? "text-white/70" : "text-muted-foreground")}>
              {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
            </div>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn("text-xs underline mt-1 inline-block", isFromMe ? "text-white" : "text-primary")}
            >
              Abrir no Google Maps
            </a>
          )}
        </div>
      );
    }

    const evoPoll = evoMsg.pollCreationMessageV3 || evoMsg.pollCreationMessageV2 || evoMsg.pollCreationMessage;
    if (message_type === 'poll' || evoPoll) {
      let pd = msg.poll_data as any;
      if (!pd && evoPoll) {
        pd = {
          name: evoPoll.name || '',
          options: (evoPoll.options || []).map((o: any) => o?.optionName).filter(Boolean),
          selectableOptionsCount: evoPoll.selectableOptionsCount ?? 1,
        };
      }
      const isMulti = (pd?.selectableOptionsCount ?? 1) !== 1;
      return (
        <div className={cn(
          "mb-2 rounded-md border p-2 min-w-[240px]",
          isFromMe ? "bg-white/10 border-white/20" : "bg-background/60 border-border"
        )}>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4" />
            <span className="font-medium text-sm">Enquete</span>
          </div>
          {pd?.name && <div className="font-medium mb-2 break-words">{pd.name}</div>}
          <div className={cn("text-xs mb-2", isFromMe ? "text-white/70" : "text-muted-foreground")}>
            {isMulti ? "Selecione uma ou mais opções" : "Selecione uma opção"}
          </div>
          <div className="space-y-1.5">
            {(pd?.options || []).map((opt: string, i: number) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 border",
                  isFromMe ? "border-white/20" : "border-border"
                )}
              >
                <span className={cn(
                  "h-3.5 w-3.5 shrink-0 border",
                  isMulti ? "rounded-sm" : "rounded-full",
                  isFromMe ? "border-white/60" : "border-muted-foreground/60"
                )} />
                <span className="text-sm break-words">{opt}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    // ----- end special types -----

    if (!media_url) {
      // No media URL, show type indicator
      const typeIcon = getMessageTypeIcon(message_type);
      if (typeIcon && message_type !== 'text') {
        return (
          <div className={cn(
            "flex items-center gap-1 mb-1 text-xs",
            isFromMe ? "text-white/70" : "text-muted-foreground"
          )}>
            {typeIcon}
            <span className="capitalize">{message_type}</span>
          </div>
        );
      }
      return null;
    }

    switch (message_type) {
      case 'image':
        return (
          <div className="mb-2">
            <img 
              src={media_url}
              alt="Imagem" 
              className="max-w-[300px] rounded-lg max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setPreviewImage(media_url)}
              onError={(e) => {
                console.error('Erro ao carregar imagem:', media_url);
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        );

      case 'sticker':
        return (
          <div className="mb-2">
            <img 
              src={media_url}
              alt="Sticker" 
              className="max-w-[180px] max-h-[180px] object-contain"
              onError={(e) => {
                console.error('Erro ao carregar sticker:', media_url);
                (e.target as HTMLImageElement).alt = '🏷️ Sticker';
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        );

      case 'video':
        return (
          <div className="mb-2">
            <SigZapVideoPlayer src={media_url} isFromMe={isFromMe} />
          </div>
        );

      case 'audio':
        return (
          <div className="mb-2">
            <SigZapAudioPlayer src={media_url} isFromMe={isFromMe} />
          </div>
        );

      case 'document':
        return (
          <div className="mb-2">
            <SigZapDocumentCard 
              url={media_url} 
              filename={media_filename || undefined}
              mimeType={media_mime_type || undefined}
              isFromMe={isFromMe} 
            />
          </div>
        );

      default:
        // Fallback to icon indicator
        const typeIcon = getMessageTypeIcon(message_type);
        if (typeIcon) {
          return (
            <div className={cn(
              "flex items-center gap-1 mb-1 text-xs",
              isFromMe ? "text-white/70" : "text-muted-foreground"
            )}>
              {typeIcon}
              <span className="capitalize">{message_type}</span>
            </div>
          );
        }
        return null;
    }
  };

  // Empty state
  if (!conversaId) {
    return (
      <div className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden">
        <div className="p-3 border-b bg-muted/30 flex items-center gap-2 h-12">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Chat</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium">Selecione uma conversa</p>
            <p className="text-xs mt-1">para visualizar e responder mensagens</p>
          </div>
        </div>
      </div>
    );
  }

  const contact = conversa?.contact as any;
  const instance = conversa?.instance as any;

  return (
    <div 
      ref={chatContainerRef}
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      <SigZapDropOverlay isVisible={isDragging} />

      {/* Header */}
      <div className="p-3 border-b bg-muted/30 h-12 flex items-center">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3 min-w-0">
            {contact?.profile_picture_url ? (
              <img
                src={contact.profile_picture_url}
                alt={contact.contact_name || ''}
                className="h-10 w-10 rounded-full object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setPhotoModalUrl(contact.profile_picture_url)}
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">
                {loadingConversa ? (
                  <Skeleton className="h-4 w-32" />
                ) : (
                  leadFromJoin?.nome ||
                  linkedLead?.nome ||
                  contact?.contact_name ||
                  contact?.contact_phone
                )}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Phone className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">
                  {resolvedDisplayPhone 
                    ? resolvedDisplayPhone 
                    : (isLidContact 
                      ? (leadFromJoin?.phone_e164 || linkedLead?.phone_e164 || 'Contato LID') 
                      : contact?.contact_phone)}
                </span>
                {instance?.name && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {instance.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {assignedUser && (
              <Badge variant="secondary" className="text-xs gap-1">
                <UserCheck className="h-3 w-3" />
                {assignedUser.nome_completo?.split(' ')[0]}
              </Badge>
            )}
            
            {!hideLeadButton && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 gap-1"
                onClick={handleLeadClick}
                disabled={isCheckingLead || !conversa}
              >
                {isCheckingLead ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                <span className="hidden lg:inline">Lead</span>
              </Button>
            )}
            
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0 min-w-0 overflow-hidden p-4">
        <div className="space-y-3">
          {/* Load more history button - top of messages */}
          {conversa && historyHasMore && (
            <div className="flex justify-center py-2">
              <Button
                variant="default"
                size="sm"
                className="rounded-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                onClick={handleFetchHistory}
                disabled={fetchingHistory}
              >
                {fetchingHistory ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <History className="h-4 w-4" />
                )}
                Carregar mais histórico
              </Button>
            </div>
          )}
          {showLoadingSkeleton ? (
            [...Array(5)].map((_, i) => (
              <Skeleton key={i} className={cn("h-12 w-2/3", i % 2 === 0 ? "" : "ml-auto")} />
            ))
          ) : mensagens?.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhuma mensagem ainda.
            </p>
          ) : (
            mensagens?.map((msg, idx) => {
              // Day separator
              const msgDate = new Date(msg.sent_at);
              const prevMsg = idx > 0 ? mensagens[idx - 1] : null;
              const prevDate = prevMsg ? new Date(prevMsg.sent_at) : null;
              const showDaySeparator = !prevDate || 
                msgDate.toDateString() !== prevDate.toDateString();

              const today = new Date();
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);

              let dayLabel: string;
              if (msgDate.toDateString() === today.toDateString()) {
                dayLabel = "Hoje";
              } else if (msgDate.toDateString() === yesterday.toDateString()) {
                dayLabel = "Ontem";
              } else {
                dayLabel = format(msgDate, "dd/MM/yyyy", { locale: ptBR });
              }

              const daySeparator = showDaySeparator ? (
                <div className="flex items-center justify-center my-3" key={`sep-${msg.id}`}>
                  <div className="bg-muted/80 text-muted-foreground text-[11px] font-medium px-4 py-1 rounded-md shadow-sm">
                    {dayLabel}
                  </div>
                </div>
              ) : null;
              // System messages (transfers, etc.)
              if (msg.message_type === 'system') {
                return (
                  <React.Fragment key={msg.id}>
                    {daySeparator}
                    <div className="w-full px-2 flex justify-center">
                      <div className="bg-muted/60 text-muted-foreground text-xs px-4 py-1.5 rounded-full max-w-[85%] text-center">
                        {msg.message_text}
                        <span className="ml-2 text-[10px] opacity-60">
                          {format(new Date(msg.sent_at), "HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              }

              const isFromMe = msg.from_me;
              const statusIcon = getStatusIcon(msg.message_status, isFromMe);
              const isDeleted = msg.message_status === 'deleted';
              const sender = isFromMe && msg.sent_by_user_id ? sendersData?.[msg.sent_by_user_id] : null;
              const msgColor = sender?.cor || captadorColor || 'hsl(var(--primary))';
              
              return (
                <React.Fragment key={msg.id}>
                  {daySeparator}
                  <div className="w-full px-2">
                  <SigZapMessageContextMenu
                    messageId={msg.id}
                    waMessageId={msg.wa_message_id}
                    fromMe={isFromMe}
                    messageText={msg.message_text}
                    messageType={msg.message_type}
                    mediaUrl={msg.media_url}
                    mediaFilename={msg.media_filename}
                    onReply={handleReply}
                    onReact={handleReact}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onAttachToLead={handleAttachToLead}
                    canDelete={canSendMessages && !isDeleted}
                    hasLinkedLead={!!linkedLead?.id}
                  >
                    <div className={cn("flex min-w-0 gap-2", isFromMe ? "justify-end" : "justify-start")}>
                      {/* Sender avatar for from_me messages */}
                      {isFromMe && sender && (
                        <div 
                          className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-1"
                          style={{ backgroundColor: msgColor }}
                          title={sender.nome}
                        >
                          {sender.initials}
                        </div>
                      )}
                      <div
                        className={cn(
                          "relative max-w-[80%] min-w-0 cursor-pointer rounded-lg px-3 py-2 text-sm",
                          isFromMe
                            ? "text-white rounded-br-none"
                            : "bg-muted rounded-bl-none",
                          isDeleted && "opacity-60 italic",
                          msg.reaction && "mb-3"
                        )}
                        style={isFromMe ? { backgroundColor: msgColor } : undefined}
                      >
                        {/* Sender name + instance for from_me messages */}
                        {isFromMe && sender && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[11px] font-semibold text-white/90">
                              {sender.nome.split(' ')[0]}
                            </span>
                            {msg.sent_via_instance_name && (
                              <span className="text-[9px] text-white/60 bg-white/15 rounded px-1 py-0.5">
                                {msg.sent_via_instance_name}
                              </span>
                            )}
                          </div>
                        )}

                        {isDeleted ? (
                          <p className="text-sm">🚫 Mensagem apagada</p>
                        ) : (
                          <>
                            {/* Render media content */}
                            {renderMediaContent(msg, isFromMe)}
                            
                            {/* Message text or caption */}
                            {(msg.message_text &&
                            // Hide placeholder texts (rendered as cards or inline)
                            msg.message_text !== '[Sticker]' &&
                            msg.message_text !== '[Imagem]' &&
                              msg.message_text !== '[Vídeo]' &&
                              msg.message_text !== '[Áudio]' &&
                              msg.message_text !== '[image]' &&
                              msg.message_text !== '[video]' &&
                              msg.message_text !== '[audio]' &&
                              msg.message_text !== '[document]' &&
                              msg.message_text !== '[Mensagem apagada]' &&
                              msg.message_text !== '[Mensagem sem conteúdo]' &&
                              msg.message_text !== '[Localização]' &&
                              !(msg.message_text || '').startsWith('[Localização:') &&
                              !(msg.message_text || '').startsWith('[Contato:') &&
                              !(msg.message_text || '').startsWith('[Enquete:') &&
                              msg.message_type !== 'contact' &&
                              msg.message_type !== 'location' &&
                              msg.message_type !== 'poll'
                            ) || msg.media_caption ? (
                              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                {formatWhatsappNode(renderMessageWithPhoneLinks(msg.media_caption || msg.message_text || "", isFromMe, (conversa?.instance as any)?.id))}
                              </p>
                            ) : !msg.media_url && msg.message_type === 'text' ? (
                              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                {formatWhatsappNode(renderMessageWithPhoneLinks(msg.message_text || "", isFromMe, (conversa?.instance as any)?.id))}
                              </p>
                            ) : null}
                          </>
                        )}
                        
                        {/* Reaction */}
                        {msg.reaction && (
                          <div className="absolute -bottom-3 right-2 bg-background rounded-full px-1 py-0.5 shadow-sm border text-xs">
                            {msg.reaction}
                          </div>
                        )}
                        
                        {/* Time and status */}
                        <div className={cn(
                          "flex items-center justify-end gap-1 mt-1",
                          isFromMe ? "text-white/70" : "text-muted-foreground"
                        )}>
                          <span className="text-[10px]">
                            {format(new Date(msg.sent_at), "HH:mm", { locale: ptBR })}
                          </span>
                          {statusIcon}
                        </div>
                      </div>
                    </div>
                  </SigZapMessageContextMenu>
                </div>
                </React.Fragment>
              );
            })
          )}
          
          {/* Pending messages (optimistic UI) */}
          {pendingMessages.map((pending) => (
            <div key={pending.id} className="flex justify-end animate-pulse">
              <div className="max-w-[80%] px-3 py-2 rounded-lg bg-primary/70 text-primary-foreground relative">
                <p className="text-sm whitespace-pre-wrap break-words">{pending.text}</p>
                <div className="flex items-center justify-end gap-1 mt-1 text-primary-foreground/70">
                  <span className="text-[10px]">
                    {format(pending.timestamp, "HH:mm", { locale: ptBR })}
                  </span>
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
              </div>
            </div>
          ))}
          
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Reply preview */}
      <SigZapReplyPreview 
        replyingTo={replyingTo} 
        onCancel={() => setReplyingTo(null)} 
      />

      {/* Edit preview */}
      <SigZapEditPreview 
        editingMessage={editingMessage} 
        onCancel={() => { setEditingMessage(null); setMensagem(""); }} 
      />

      {/* Staging area for files */}
      <SigZapStagingArea 
        files={stagedFiles} 
        onRemove={removeFromStaging} 
        onClear={clearStaging} 
      />

      {/* Footer: Input */}
      <div className="p-3 border-t bg-muted/10">
        {isBlacklisted ? (
          <div className="flex items-center gap-2 justify-center py-2 px-4 bg-destructive/10 rounded-lg border border-destructive/30">
            <Ban className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Este contato está na blacklist — envio bloqueado</span>
          </div>
        ) : conversa ? (
          <div className="flex gap-2 items-end">
            {/* Hidden file input - now accepts multiple */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar"
              className="hidden"
              onChange={handleFileSelect}
              multiple
            />

            {isRecording ? (
              <SigZapAudioRecorder
                onSend={handleAudioSend}
                onCancel={handleAudioCancel}
                isUploading={isUploadingAudio}
              />
            ) : (
              <>
                {/* Attachment button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-[44px] w-[44px] text-muted-foreground hover:text-primary flex-shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingMedia || sendMutation.isPending}
                >
                  {isUploadingMedia ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Paperclip className="h-5 w-5" />
                  )}
                </Button>

                {/* Message input - NOT disabled when sending text (optimistic UI) */}
                <Textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={stagedFiles.length > 0 ? "Adicione uma legenda..." : "Digite sua mensagem..."}
                  className="min-h-[44px] max-h-32 resize-none flex-1"
                  rows={1}
                  disabled={isUploadingMedia}
                />

                {/* Send button when there are staged files or text */}
                {(mensagem.trim() || stagedFiles.length > 0) ? (
                  <Button
                    onClick={stagedFiles.length > 0 ? handleSendStagedFiles : handleSendText}
                    disabled={isUploadingMedia}
                    className="h-[44px] px-4 flex-shrink-0 relative"
                  >
                    {isUploadingMedia ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        {pendingMessages.length > 0 && (
                          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                            {pendingMessages.length}
                          </span>
                        )}
                      </>
                    )}
                  </Button>
                ) : (
                  <SigZapMicButton
                    onClick={() => !isUploadingAudio && setIsRecording(true)}
                    disabled={isUploadingMedia || isUploadingAudio}
                  />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-2 text-sm text-muted-foreground">
            Selecione uma conversa
          </div>
        )}
      </div>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 bg-black/90 border-none">
          {previewImage && (
            <img 
              src={previewImage} 
              alt="Imagem expandida" 
              className="max-w-full max-h-[85vh] object-contain mx-auto"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Auto Match Confirmation Dialog */}
      <SigZapLeadAutoMatchDialog
        open={autoMatchDialogOpen}
        onOpenChange={setAutoMatchDialogOpen}
        contactPhone={pendingContactPhone}
        contactName={pendingContactName}
        matchedLead={autoMatchLead}
        onConfirm={handleAutoMatchConfirm}
        onReject={handleAutoMatchReject}
      />

      {/* Lead Link Dialog */}
      <SigZapLeadLinkDialog
        open={leadLinkDialogOpen}
        onOpenChange={setLeadLinkDialogOpen}
        contactPhone={pendingContactPhone}
        contactName={pendingContactName}
        onLinkLead={handleLinkToExistingLead}
        onCreateNew={handleCreateNewLead}
      />

      {/* Lead Prontuario Dialog */}
      <LeadProntuarioDialog
        open={prontuarioOpen}
        onOpenChange={setProntuarioOpen}
        leadId={selectedLeadId}
        isNewLead={isNewLead}
      />

      {/* Photo Modal */}
      <Dialog open={!!photoModalUrl} onOpenChange={() => setPhotoModalUrl(null)}>
        <DialogContent className="max-w-md p-0 bg-transparent border-none shadow-none flex items-center justify-center">
          {photoModalUrl && (
            <img
              src={photoModalUrl}
              alt="Foto do contato"
              className="max-w-full max-h-[80vh] rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
