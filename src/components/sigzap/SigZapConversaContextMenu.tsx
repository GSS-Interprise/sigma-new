import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, Pin, Ban, EyeOff, Loader2, ArrowRightLeft, MapPin, UserX, Tag, Check } from "lucide-react";
import { toast } from "sonner";
import { RegiaoInteresseDialog } from "@/components/disparos/RegiaoInteresseDialog";
import { normalizeToE164 } from "@/lib/phoneUtils";
import { registrarHistoricoLead } from "@/lib/leadHistoryLogger";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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

const TAG_COLORS_MAP: Record<string, string> = {
  blue: "bg-blue-600",
  teal: "bg-teal-600",
  green: "bg-green-600",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
  purple: "bg-purple-600",
  gray: "bg-gray-500",
  stone: "bg-stone-400",
  black: "bg-black",
};

interface SigZapConversaContextMenuProps {
  conversaId: string;
  contactPhone?: string | null;
  contactName?: string | null;
  instanceName?: string | null;
  onTransfer?: (conversaId: string) => void;
}

export function SigZapConversaContextMenu({
  conversaId,
  contactPhone,
  contactName,
  instanceName,
  onTransfer,
}: SigZapConversaContextMenuProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmInactivate, setConfirmInactivate] = useState(false);
  const [confirmBlacklist, setConfirmBlacklist] = useState(false);
  const [confirmNotDoctor, setConfirmNotDoctor] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [showRegiaoDialog, setShowRegiaoDialog] = useState(false);
  const [regiaoLeadId, setRegiaoLeadId] = useState<string | undefined>();
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  const phoneE164 = contactPhone ? normalizeToE164(contactPhone) : null;

  // Check if lead exists for this phone
  const { data: leadExists } = useQuery({
    queryKey: ['sigzap-lead-exists', phoneE164],
    queryFn: async () => {
      if (!phoneE164) return null;
      const { data, error } = await supabase
        .from('leads')
        .select('id, tags')
        .eq('phone_e164', phoneE164)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!phoneE164,
  });

  // Tags disponíveis (mesma fonte do Kanban de Acompanhamento)
  const { data: availableTags = [] } = useQuery({
    queryKey: ['leads-etiquetas-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads_etiquetas_config')
        .select('nome, cor_id')
        .order('nome');
      if (error) throw error;
      return data as { nome: string; cor_id: string }[];
    },
  });

  const currentTag = (leadExists as any)?.tags?.[0] as string | undefined;

  // Mutation: define tag única do lead (substitui qualquer tag existente)
  const setTagMutation = useMutation({
    mutationFn: async (tagName: string | null) => {
      if (!leadExists?.id) throw new Error('Lead não encontrado');
      const newTags = tagName ? [tagName] : [];
      const { error } = await supabase
        .from('leads')
        .update({ tags: newTags, updated_at: new Date().toISOString() })
        .eq('id', leadExists.id);
      if (error) throw error;
      return { tagName };
    },
    onSuccess: ({ tagName }) => {
      toast.success(tagName ? `Tag "${tagName}" aplicada` : 'Tag removida');
      queryClient.invalidateQueries({ queryKey: ['sigzap-lead-exists'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadExists?.id] });
      queryClient.invalidateQueries({ queryKey: ['kanban-leads'] });
      setTagPopoverOpen(false);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao aplicar tag'),
  });

  // "Não é o médico" mutation
  const notDoctorMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      // 1. Mark conversation
      const { error: convError } = await supabase
        .from('sigzap_conversations')
        .update({
          not_the_doctor: true,
          not_the_doctor_at: new Date().toISOString(),
          not_the_doctor_by: user.id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', conversaId);

      if (convError) throw convError;

      // 2. If lead exists, disable the phone and log history
      if (leadExists?.id && phoneE164) {
        // Remove phone from lead (set to null to "disable")
        const { data: leadData } = await supabase
          .from('leads')
          .select('phone_e164, telefones_adicionais')
          .eq('id', leadExists.id)
          .single();

        if (leadData) {
          const updates: any = {};
          
          if (leadData.phone_e164 === phoneE164) {
            updates.phone_e164 = null;
          }
          
          if (leadData.telefones_adicionais?.includes(phoneE164)) {
            updates.telefones_adicionais = leadData.telefones_adicionais.filter(
              (t: string) => t !== phoneE164
            );
          }

          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();
            await supabase
              .from('leads')
              .update(updates)
              .eq('id', leadExists.id);
          }
        }

        // Log in lead history
        await registrarHistoricoLead({
          leadId: leadExists.id,
          tipoEvento: 'outro',
          descricaoResumida: `Número ${contactPhone} marcado como "Não é o médico" via SigZap`,
          metadados: {
            telefone_desabilitado: phoneE164,
            conversa_id: conversaId,
            instancia: instanceName,
          },
        });
      }

      // 3. Insert system message in conversation
      await supabase.from('sigzap_messages').insert({
        conversation_id: conversaId,
        from_me: true,
        message_text: `⚠️ Marcado como "Não é o médico" — telefone desabilitado do prontuário`,
        message_type: 'system',
        message_status: 'delivered',
        sent_at: new Date().toISOString(),
        sent_by_user_id: user.id,
      });
    },
    onSuccess: () => {
      toast.success('Conversa marcada como "Não é o médico"');
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-lead-exists'] });
    },
    onError: (error) => {
      console.error('Not doctor error:', error);
      toast.error('Erro ao marcar conversa');
    },
  });

  // Send to blacklist mutation
  const blacklistMutation = useMutation({
    mutationFn: async () => {
      if (!phoneE164) throw new Error('Telefone inválido');
      if (!user?.id) throw new Error('Usuário não autenticado');

      // Get user profile for nome
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user.id)
        .single();

      const { error } = await supabase.from('blacklist').insert({
        phone_e164: phoneE164,
        nome: contactName || null,
        origem: `SigZap - ${instanceName || 'Manual'}`,
        reason: blacklistReason.trim() || 'Enviado via SigZap',
        created_by: user.id,
      });

      if (error) {
        if (error.code === '23505') {
          throw new Error('Este número já está na blacklist');
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Contato adicionado à blacklist');
      setBlacklistReason("");
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar à blacklist');
    },
  });

  // Inactivate conversation mutation
  const inactivateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('sigzap_conversations')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', conversaId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-minhas-conversas'] });
      toast.success('Conversa inativada');
    },
    onError: (error) => {
      console.error('Inactivate error:', error);
      toast.error('Erro ao inativar conversa');
    },
  });

  // Pin conversation mutation (toggle)
  const pinMutation = useMutation({
    mutationFn: async () => {
      // For now, pin is a simple toast feedback - can be extended with a pinned column
      toast.info('Funcionalidade de fixar conversa em breve!');
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => pinMutation.mutate()}>
            <Pin className="h-4 w-4 mr-2" />
            Fixar conversa
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onTransfer?.(conversaId)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Transferir conversa
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!leadExists?.id}
            onClick={() => {
              if (!phoneE164) return;
              setRegiaoLeadId(leadExists?.id);
              setShowRegiaoDialog(true);
            }}
            className={!leadExists?.id ? "opacity-50" : ""}
          >
            <MapPin className="h-4 w-4 mr-2" />
            Banco de Interesse
            {!leadExists?.id && (
              <span className="ml-auto text-[10px] text-muted-foreground">sem lead</span>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!leadExists?.id}
            onClick={() => setConfirmBlacklist(true)}
            className={!leadExists?.id ? "opacity-50" : ""}
          >
            <Ban className="h-4 w-4 mr-2" />
            Enviar p/ Blacklist
            {!leadExists?.id && (
              <span className="ml-auto text-[10px] text-muted-foreground">sem lead</span>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setConfirmNotDoctor(true)}
            className="text-rose-600 focus:text-rose-600"
          >
            <UserX className="h-4 w-4 mr-2" />
            Não é o médico
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setConfirmInactivate(true)}
            className="text-amber-600 focus:text-amber-600"
          >
            <EyeOff className="h-4 w-4 mr-2" />
            Inativar conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirm Blacklist Dialog */}
      <AlertDialog open={confirmBlacklist} onOpenChange={setConfirmBlacklist}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar para Blacklist?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  O número <strong>{contactPhone}</strong> ({contactName || 'Sem nome'}) será adicionado à blacklist.
                  Este contato não receberá mais disparos.
                </p>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-none"
                  placeholder="Motivo (opcional)"
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blacklistMutation.mutate()}
              disabled={blacklistMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {blacklistMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Ban className="h-4 w-4 mr-2" />
              )}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Região de Interesse Dialog */}
      <RegiaoInteresseDialog
        open={showRegiaoDialog}
        onOpenChange={setShowRegiaoDialog}
        leadId={regiaoLeadId}
      />

      {/* Confirm Inactivate Dialog */}
      {/* Confirm "Não é o médico" Dialog */}
      <AlertDialog open={confirmNotDoctor} onOpenChange={setConfirmNotDoctor}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como "Não é o médico"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  O número <strong>{contactPhone}</strong> ({contactName || 'Sem nome'}) será desabilitado do prontuário do médico.
                </p>
                <p className="text-sm text-muted-foreground">
                  Um registro será adicionado ao histórico do lead e a conversa receberá um selo visual.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => notDoctorMutation.mutate()}
              disabled={notDoctorMutation.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {notDoctorMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserX className="h-4 w-4 mr-2" />
              )}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmInactivate} onOpenChange={setConfirmInactivate}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa será marcada como inativa e não aparecerá mais nas colunas.
              As mensagens serão preservadas e a conversa poderá ser reativada se o contato enviar nova mensagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => inactivateMutation.mutate()}
              disabled={inactivateMutation.isPending}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {inactivateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <EyeOff className="h-4 w-4 mr-2" />
              )}
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
