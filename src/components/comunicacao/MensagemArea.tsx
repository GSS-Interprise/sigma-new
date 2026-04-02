import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MensagemList } from "./MensagemList";
import { MensagemInput } from "./MensagemInput";
import { CanalHeader } from "./CanalHeader";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

interface MensagemAreaProps {
  canalId: string;
  onOpenDM?: (targetUserId: string) => void;
}

interface ReplyingTo {
  id: string;
  user_nome: string;
  mensagem: string;
}

export function MensagemArea({ canalId, onOpenDM }: MensagemAreaProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = usePermissions();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);

  const { data: canal } = useQuery({
    queryKey: ["canal", canalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicacao_canais")
        .select("*")
        .eq("id", canalId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: mensagens } = useQuery({
    queryKey: ["mensagens", canalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicacao_mensagens")
        .select(`
          *,
          comunicacao_leituras(user_id, data_leitura)
        `)
        .eq("canal_id", canalId)
        .order("data_envio", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Buscar participantes do canal para menções
  const { data: participantes } = useQuery({
    queryKey: ["canal-participantes", canalId],
    queryFn: async () => {
      // Primeiro buscar os user_ids dos participantes
      const { data: participantesData, error: partError } = await supabase
        .from("comunicacao_participantes")
        .select("user_id")
        .eq("canal_id", canalId);

      if (partError) throw partError;
      if (!participantesData || participantesData.length === 0) return [];

      // Depois buscar os profiles correspondentes
      const userIds = participantesData.map(p => p.user_id);
      const { data: profilesData, error: profError } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .in("id", userIds);

      if (profError) throw profError;

      return (profilesData || []).map(p => ({
        user_id: p.id,
        nome_completo: p.nome_completo || "Usuário"
      }));
    },
  });

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log("🔐 Current user ID:", user?.id);
      return user;
    },
    staleTime: Infinity,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Marcar mensagens como lidas ao visualizar
  useEffect(() => {
    if (!mensagens || !user) return;

    const marcarLidas = async () => {
      const mensagensNaoLidas = mensagens.filter(
        m => m.user_id !== user.id && 
        !m.comunicacao_leituras?.some((l: any) => l.user_id === user.id)
      );

      for (const mensagem of mensagensNaoLidas) {
        await supabase
          .from("comunicacao_leituras")
          .insert({
            mensagem_id: mensagem.id,
            user_id: user.id,
          });
      }

      // Atualizar ultima_leitura do participante
      await supabase
        .from("comunicacao_participantes")
        .update({ ultima_leitura: new Date().toISOString() })
        .eq("canal_id", canalId)
        .eq("user_id", user.id);

      // Marcar notificações como lidas
      await supabase
        .from("comunicacao_notificacoes")
        .update({ lida: true })
        .eq("canal_id", canalId)
        .eq("user_id", user.id);

      queryClient.invalidateQueries({ queryKey: ["canal-notificacoes"] });
    };

    marcarLidas();
  }, [mensagens, user, canalId, queryClient]);

  // Setup realtime
  useEffect(() => {
    const channel = supabase
      .channel(`mensagens-${canalId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comunicacao_mensagens",
          filter: `canal_id=eq.${canalId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["mensagens", canalId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "comunicacao_mensagens",
          filter: `canal_id=eq.${canalId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["mensagens", canalId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comunicacao_leituras",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["mensagens", canalId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canalId, queryClient]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const enviarMensagemMutation = useMutation({
    mutationFn: async ({ mensagem, anexos, replyToId }: { mensagem: string; anexos: string[]; replyToId?: string }) => {
      if (!user || !profile) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("comunicacao_mensagens")
        .insert({
          canal_id: canalId,
          user_id: user.id,
          user_nome: profile.nome_completo,
          mensagem,
          anexos: anexos.length > 0 ? anexos : null,
          reply_to_id: replyToId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Criar notificações para outros participantes
      const { data: participantesNotif } = await supabase
        .from("comunicacao_participantes")
        .select("user_id")
        .eq("canal_id", canalId)
        .neq("user_id", user.id);

      if (participantesNotif) {
        const notificacoes = participantesNotif.map(p => ({
          user_id: p.user_id,
          canal_id: canalId,
          mensagem_id: data.id,
        }));

        await supabase
          .from("comunicacao_notificacoes")
          .insert(notificacoes);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mensagens", canalId] });
      setReplyingTo(null);
    },
    onError: (error) => {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const editarMensagemMutation = useMutation({
    mutationFn: async ({ mensagemId, novoTexto }: { mensagemId: string; novoTexto: string }) => {
      const { error } = await supabase
        .from("comunicacao_mensagens")
        .update({ mensagem: novoTexto, updated_at: new Date().toISOString() })
        .eq("id", mensagemId)
        .eq("user_id", user?.id); // Garantir que só o dono pode editar

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mensagens", canalId] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao editar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReply = (mensagem: { id: string; user_nome: string; mensagem: string }) => {
    setReplyingTo({
      id: mensagem.id,
      user_nome: mensagem.user_nome,
      mensagem: mensagem.mensagem,
    });
  };

  const handleEdit = (mensagemId: string, novoTexto: string) => {
    editarMensagemMutation.mutate({ mensagemId, novoTexto });
  };

  const handleCanalDeleted = () => {
    queryClient.invalidateQueries({ queryKey: ["comunicacao-canais"] });
  };

  if (!canal) return null;

  return (
    <div className="flex flex-col h-full">
      <CanalHeader 
        canal={canal} 
        isAdmin={isAdmin} 
        onCanalDeleted={handleCanalDeleted}
      />
      
      <div className="flex-1 overflow-y-auto p-4">
        <MensagemList 
          mensagens={mensagens || []} 
          currentUserId={user?.id}
          onReply={handleReply}
          onEdit={handleEdit}
          onUserNameClick={onOpenDM}
        />
        <div ref={messagesEndRef} />
      </div>

      <MensagemInput 
        onEnviar={(mensagem, anexos, replyToId) => 
          enviarMensagemMutation.mutate({ mensagem, anexos, replyToId })
        }
        isLoading={enviarMensagemMutation.isPending}
        participantes={participantes || []}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        isAdmin={isAdmin}
      />
    </div>
  );
}
