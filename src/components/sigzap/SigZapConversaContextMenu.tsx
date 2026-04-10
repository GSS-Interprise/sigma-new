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
import { MoreVertical, Pin, Ban, EyeOff, Loader2, ArrowRightLeft, MapPin } from "lucide-react";
import { toast } from "sonner";
import { RegiaoInteresseDialog } from "@/components/disparos/RegiaoInteresseDialog";
import { normalizeToE164 } from "@/lib/phoneUtils";
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
  const [blacklistReason, setBlacklistReason] = useState("");
  const [showRegiaoDialog, setShowRegiaoDialog] = useState(false);
  const [regiaoLeadId, setRegiaoLeadId] = useState<string | undefined>();

  const phoneE164 = contactPhone ? normalizeToE164(contactPhone) : null;

  // Check if lead exists for this phone
  const { data: leadExists } = useQuery({
    queryKey: ['sigzap-lead-exists', phoneE164],
    queryFn: async () => {
      if (!phoneE164) return false;
      const { count, error } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('phone_e164', phoneE164);
      if (error) return false;
      return (count || 0) > 0;
    },
    enabled: !!phoneE164,
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
            disabled={!leadExists}
            onClick={() => {
              if (!phoneE164) return;
              supabase
                .from('leads')
                .select('id')
                .eq('phone_e164', phoneE164)
                .maybeSingle()
                .then(({ data }) => {
                  if (data) {
                    setRegiaoLeadId(data.id);
                    setShowRegiaoDialog(true);
                  }
                });
            }}
            className={!leadExists ? "opacity-50" : ""}
          >
            <MapPin className="h-4 w-4 mr-2" />
            Banco de Interesse
            {!leadExists && (
              <span className="ml-auto text-[10px] text-muted-foreground">sem lead</span>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!leadExists}
            onClick={() => setConfirmBlacklist(true)}
            className={!leadExists ? "opacity-50" : ""}
          >
            <Ban className="h-4 w-4 mr-2" />
            Enviar p/ Blacklist
            {!leadExists && (
              <span className="ml-auto text-[10px] text-muted-foreground">sem lead</span>
            )}
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
