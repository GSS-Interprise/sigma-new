import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { User, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";

interface SigZapTransferOverlayProps {
  visible: boolean;
  draggingConversaId: string | null;
  onClose: () => void;
  onTransferComplete: () => void;
}

export function SigZapTransferOverlay({
  visible,
  draggingConversaId,
  onClose,
  onTransferComplete,
}: SigZapTransferOverlayProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);

  // Fetch captadores with colors
  const { data: captadores } = useQuery({
    queryKey: ['sigzap-captadores-transfer'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('captacao_permissoes_usuario')
        .select('user_id, cor')
        .eq('pode_disparos_zap', true);
      if (error) throw error;

      // Fetch profiles for these users
      const userIds = data.map(d => d.user_id);
      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('id, nome_completo, email')
        .in('id', userIds);
      if (profError) throw profError;

      return data.map(perm => {
        const profile = profiles?.find(p => p.id === perm.user_id);
        return {
          user_id: perm.user_id,
          cor: perm.cor || 'hsl(var(--primary))',
          nome: profile?.nome_completo || 'Usuário',
          email: profile?.email || '',
        };
      }).sort((a, b) => a.nome.localeCompare(b.nome));
    },
    enabled: visible,
  });

  // Fetch current user's profile name
  const { data: meuPerfil } = useQuery({
    queryKey: ['meu-perfil-transfer', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!draggingConversaId) throw new Error('Nenhuma conversa selecionada');

      const { error } = await supabase
        .from('sigzap_conversations')
        .update({
          assigned_user_id: targetUserId,
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('id', draggingConversaId);

      if (error) throw error;

      // Insert system message in the conversation
      const captadorDestino = captadores?.find(c => c.user_id === targetUserId);
      const nomeOrigem = meuPerfil?.nome_completo?.split(' ')[0] || 'Alguém';
      const nomeDestino = captadorDestino?.nome?.split(' ')[0] || 'outro captador';
      
      await supabase
        .from('sigzap_messages')
        .insert({
          conversation_id: draggingConversaId,
          from_me: true,
          message_text: `🔄 ${nomeOrigem} transferiu esta conversa para ${nomeDestino}`,
          message_type: 'system',
          message_status: 'delivered',
          sent_at: new Date().toISOString(),
          sent_by_user_id: user?.id || null,
        });

      // Notify target user about the transfer
      if (targetUserId !== user?.id) {
        // Get conversation contact name via join
        const { data: convo } = await supabase
          .from('sigzap_conversations')
          .select('contact:sigzap_contacts!sigzap_conversations_contact_id_fkey(contact_name, contact_phone)')
          .eq('id', draggingConversaId)
          .single();

        const contact = (convo as any)?.contact;
        const contactLabel = contact?.contact_name || contact?.contact_phone || 'contato';

        await supabase
          .from('system_notifications')
          .insert({
            user_id: targetUserId,
            tipo: 'sigzap_transferencia',
            titulo: `Conversa transferida para você`,
            mensagem: `${nomeOrigem} transferiu a conversa com ${contactLabel} para você`,
            link: '/sigzap',
            referencia_id: draggingConversaId,
          });
      }

      return targetUserId;
    },
    onSuccess: (targetUserId) => {
      const captador = captadores?.find(c => c.user_id === targetUserId);
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversa-detail'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-messages'] });
      toast.success(`Conversa transferida para ${captador?.nome?.split(' ')[0] || 'captador'}!`);
      onTransferComplete();
    },
    onError: (error) => {
      console.error('Transfer error:', error);
      toast.error('Erro ao transferir conversa');
    },
  });

  const handleDrop = (e: React.DragEvent, targetUserId: string) => {
    e.preventDefault();
    setHoveredUserId(null);
    transferMutation.mutate(targetUserId);
  };

  const handleDragOver = (e: React.DragEvent, userId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoveredUserId(userId);
  };

  const handleDragLeave = () => {
    setHoveredUserId(null);
  };

  const handleClick = (targetUserId: string) => {
    if (draggingConversaId) {
      transferMutation.mutate(targetUserId);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-72 bg-card border-l shadow-2xl z-50 flex flex-col animate-in slide-in-from-right-full duration-200">
      {/* Header */}
      <div className="p-4 border-b bg-muted/40">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">Transferir para</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Arraste sobre um captador
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Captadores List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {captadores?.map((captador) => {
            const isHovered = hoveredUserId === captador.user_id;
            const initials = captador.nome
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={captador.user_id}
                className={cn(
                  "rounded-xl p-4 cursor-pointer transition-all border-2",
                  isHovered && "scale-[1.03] shadow-lg",
                  transferMutation.isPending && "pointer-events-none opacity-60"
                )}
                style={{
                  backgroundColor: captador.cor,
                  borderColor: isHovered ? '#fff' : captador.cor,
                  color: '#fff',
                }}
                onDrop={(e) => handleDrop(e, captador.user_id)}
                onDragOver={(e) => handleDragOver(e, captador.user_id)}
                onDragLeave={handleDragLeave}
                onClick={() => handleClick(captador.user_id)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{captador.nome}</p>
                    <p className="text-[11px] text-white/70 truncate">{captador.email}</p>
                  </div>
                  {isHovered && (
                    <ArrowRight className="h-5 w-5 text-white animate-pulse flex-shrink-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Hint bar */}
      <div className="p-3 border-t bg-muted/30 text-center">
        <p className="text-[11px] text-muted-foreground">
          ↑ Arraste para cima para ações
        </p>
      </div>
    </div>
  );
}
