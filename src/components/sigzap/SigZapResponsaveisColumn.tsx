import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserCheck, User, Lock, Unlock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface SigZapResponsaveisColumnProps {
  selectedConversaId: string | null;
  currentResponsavelId: string | null;
}

export function SigZapResponsaveisColumn({
  selectedConversaId,
  currentResponsavelId,
}: SigZapResponsaveisColumnProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch current user profile
  const { data: currentProfile } = useQuery({
    queryKey: ['current-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome_completo, email')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch conversation details
  const { data: conversa, isLoading: loadingConversa } = useQuery({
    queryKey: ['sigzap-conversa-detail', selectedConversaId],
    queryFn: async () => {
      if (!selectedConversaId) return null;
      const { data, error } = await supabase
        .from('sigzap_conversations')
        .select(`
          *,
          contact:sigzap_contacts(*),
          instance:sigzap_instances(name),
          assigned_user:profiles!sigzap_conversations_assigned_user_id_fkey(id, nome_completo, email)
        `)
        .eq('id', selectedConversaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedConversaId,
  });

  // Assign conversation to current user
  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversaId || !user?.id) throw new Error('Dados inválidos');
      
      const { error } = await supabase
        .from('sigzap_conversations')
        .update({ 
          assigned_user_id: user.id,
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedConversaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversa-detail'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversa-selected'] });
      toast.success('Conversa atribuída a você!');
    },
    onError: (error) => {
      console.error('Error assigning conversation:', error);
      toast.error('Erro ao atribuir conversa');
    },
  });

  // Release conversation
  const releaseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversaId) throw new Error('Nenhuma conversa selecionada');
      
      const { error } = await supabase
        .from('sigzap_conversations')
        .update({ 
          assigned_user_id: null,
          status: 'open',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedConversaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversa-detail'] });
      queryClient.invalidateQueries({ queryKey: ['sigzap-conversa-selected'] });
      toast.success('Conversa liberada!');
    },
    onError: (error) => {
      console.error('Error releasing conversation:', error);
      toast.error('Erro ao liberar conversa');
    },
  });

  const isMyConversation = currentResponsavelId === user?.id;
  const isAssigned = !!currentResponsavelId;
  const assignedUser = conversa?.assigned_user as any;

  // Empty state
  if (!selectedConversaId) {
    return (
      <div className="flex flex-col h-full border-r">
        <div className="p-3 border-b bg-muted/30 flex items-center gap-2 h-12">
          <UserCheck className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Responsável</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center p-4">
            <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Selecione uma conversa</p>
            <p className="text-xs mt-1">para ver ou assumir a responsabilidade</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r">
      {/* Header */}
      <div className="p-3 border-b bg-muted/30 flex items-center gap-2 h-12">
        <UserCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Responsável</h3>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {loadingConversa ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {/* Status Card */}
              <div className={cn(
                "rounded-lg border p-4",
                isMyConversation && "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
                isAssigned && !isMyConversation && "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800",
                !isAssigned && "bg-muted/30"
              )}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center",
                    isMyConversation && "bg-green-500/20",
                    isAssigned && !isMyConversation && "bg-yellow-500/20",
                    !isAssigned && "bg-muted"
                  )}>
                    {isAssigned ? (
                      <Lock className={cn(
                        "h-5 w-5",
                        isMyConversation ? "text-green-600" : "text-yellow-600"
                      )} />
                    ) : (
                      <Unlock className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {isAssigned ? (
                      <>
                        <p className="text-sm font-medium truncate">
                          {assignedUser?.nome_completo || 'Usuário'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {assignedUser?.email}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium">Livre</p>
                        <p className="text-xs text-muted-foreground">
                          Nenhum responsável
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <Badge 
                  variant={isMyConversation ? "default" : isAssigned ? "secondary" : "outline"}
                  className="w-full justify-center"
                >
                  {isMyConversation 
                    ? "Você é o responsável" 
                    : isAssigned 
                      ? `Atribuída a ${assignedUser?.nome_completo?.split(' ')[0]}` 
                      : "Conversa disponível"
                  }
                </Badge>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                {isMyConversation && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => releaseMutation.mutate()}
                    disabled={releaseMutation.isPending}
                  >
                    <Unlock className="h-4 w-4 mr-2" />
                    Liberar Conversa
                  </Button>
                )}

                {isAssigned && !isMyConversation && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-200 text-xs">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      Esta conversa está sendo atendida por outro usuário. 
                      Você não pode enviar mensagens.
                    </span>
                  </div>
                )}
              </div>

              {/* Current User Info */}
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2">Você está logado como:</p>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{currentProfile?.nome_completo}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
