import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, ShieldOff, AlertTriangle, Clock, User } from "lucide-react";

interface BlacklistSectionProps {
  phoneE164: string | null;
  nome?: string;
  origem?: string;
}

type BlacklistEntry = {
  id: string;
  phone_e164: string;
  nome: string | null;
  origem: string | null;
  reason: string | null;
  created_at: string;
  created_by: string | null;
  usuario_nome?: string;
};

export function BlacklistSection({ phoneE164, nome, origem = 'lead' }: BlacklistSectionProps) {
  const [motivo, setMotivo] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Buscar status atual na blacklist
  const { data: blacklistEntry, isLoading } = useQuery<BlacklistEntry | null>({
    queryKey: ['blacklist-entry', phoneE164],
    queryFn: async () => {
      if (!phoneE164) return null;
      
      const { data, error } = await supabase
        .from('blacklist')
        .select('*')
        .eq('phone_e164', phoneE164)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data?.created_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('nome_completo')
          .eq('id', data.created_by)
          .single();
        
        return { ...data, usuario_nome: profile?.nome_completo || 'Sistema' };
      }
      
      return data;
    },
    enabled: !!phoneE164,
  });

  // Buscar histórico completo
  const { data: blacklistHistory = [] } = useQuery<BlacklistEntry[]>({
    queryKey: ['blacklist-history-lead', phoneE164],
    queryFn: async () => {
      if (!phoneE164) return [];
      
      // Por enquanto, blacklist não tem histórico, apenas entrada única
      // Mas mantemos a estrutura para futuro
      const entry = blacklistEntry;
      return entry ? [entry] : [];
    },
    enabled: !!phoneE164 && !!blacklistEntry,
  });

  // Adicionar à blacklist
  const addToBlacklistMutation = useMutation({
    mutationFn: async () => {
      if (!phoneE164) throw new Error('Telefone não informado');
      if (!motivo.trim()) throw new Error('Motivo é obrigatório');

      const { error } = await supabase
        .from('blacklist')
        .insert({
          phone_e164: phoneE164,
          nome: nome || null,
          origem: origem,
          reason: motivo.trim(),
          created_by: user?.id,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blacklist-entry', phoneE164] });
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
      toast.success('Adicionado à blacklist');
      setMotivo("");
      setShowAddDialog(false);
    },
    onError: (error: Error) => {
      toast.error('Erro ao adicionar à blacklist: ' + error.message);
    },
  });

  // Remover da blacklist
  const removeFromBlacklistMutation = useMutation({
    mutationFn: async () => {
      if (!phoneE164) throw new Error('Telefone não informado');
      
      const { error } = await supabase
        .from('blacklist')
        .delete()
        .eq('phone_e164', phoneE164);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blacklist-entry', phoneE164] });
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
      toast.success('Removido da blacklist');
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover da blacklist: ' + error.message);
    },
  });

  if (!phoneE164) {
    return null;
  }

  const isBlacklisted = !!blacklistEntry;

  return (
    <div className={`rounded-lg border-2 p-4 space-y-3 ${isBlacklisted ? 'border-destructive/40 bg-destructive/5' : 'border-green-200 bg-green-50/50'}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-full p-2 ${isBlacklisted ? 'bg-destructive/10 text-destructive' : 'bg-green-100 text-green-700'}`}>
          <Ban className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h4 className={`text-base font-semibold ${isBlacklisted ? 'text-destructive' : 'text-green-800'}`}>
            Status Blacklist
          </h4>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Verificando...</p>
          ) : isBlacklisted ? (
            <div className="space-y-2 mt-1">
              <p className="text-sm text-muted-foreground">
                Este contato está bloqueado e não receberá disparos automáticos.
              </p>
              <div className="rounded-md border border-destructive/20 bg-background p-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-destructive" />
                  <span className="text-sm text-muted-foreground">{blacklistEntry.reason || 'Sem motivo informado'}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {blacklistEntry.usuario_nome || 'Sistema'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(blacklistEntry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">
              Este contato pode receber disparos normalmente.
            </p>
          )}
        </div>
      </div>

      {isBlacklisted ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="outline" 
              size="default"
              className="gap-2 border-green-300 text-green-700 hover:bg-green-100"
              disabled={removeFromBlacklistMutation.isPending}
            >
              <ShieldOff className="h-4 w-4" />
              Remover da Blacklist
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover da Blacklist?</AlertDialogTitle>
              <AlertDialogDescription>
                Ao remover, este contato voltará a receber disparos e comunicações. 
                Esta ação pode ser desfeita adicionando novamente à blacklist.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => removeFromBlacklistMutation.mutate()}>
                Confirmar Remoção
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <AlertDialogTrigger asChild>
            <Button 
              variant="outline" 
              size="default"
              className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <Ban className="h-4 w-4" />
              Adicionar à Blacklist
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Adicionar à Blacklist
              </AlertDialogTitle>
              <AlertDialogDescription>
                Este contato não receberá mais disparos automáticos de WhatsApp ou E-mail.
                Informe o motivo do bloqueio para registro.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-2 py-2">
              <label className="text-sm font-medium">Motivo do bloqueio *</label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo do bloqueio..."
                rows={3}
              />
            </div>
            
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setMotivo("")}>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => addToBlacklistMutation.mutate()}
                disabled={!motivo.trim() || addToBlacklistMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {addToBlacklistMutation.isPending ? 'Adicionando...' : 'Confirmar Bloqueio'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
