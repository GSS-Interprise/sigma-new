import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Send, Loader2, User, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ChatViewProps {
  conversaId: string;
}

// Matches existing mensagens table schema
interface Mensagem {
  id: string;
  conversa_pai: string;
  direcao: string; // "entrada" ou "saida"
  texto_mensagem: string;
  timestamp: string;
  created_at: string;
}

export function ChatView({ conversaId }: ChatViewProps) {
  const [mensagem, setMensagem] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch conversation details
  const { data: conversa } = useQuery({
    queryKey: ['conversa', conversaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversas')
        .select('*')
        .eq('id', conversaId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch messages using existing schema (conversa_pai)
  const { data: mensagens, isLoading, refetch } = useQuery({
    queryKey: ['mensagens', conversaId],
    queryFn: async () => {
      // Get id_conversa from conversa
      const conversaData = await supabase
        .from('conversas')
        .select('id_conversa')
        .eq('id', conversaId)
        .single();
      
      if (conversaData.error) throw conversaData.error;
      
      const { data, error } = await supabase
        .from('mensagens')
        .select('*')
        .eq('conversa_pai', conversaData.data.id_conversa)
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return data as Mensagem[];
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`mensagens-${conversaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `conversa_id=eq.${conversaId}`
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversaId, refetch]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensagens]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (texto: string) => {
      // Get id_conversa from conversa
      const conversaData = await supabase
        .from('conversas')
        .select('id_conversa')
        .eq('id', conversaId)
        .single();
      
      if (conversaData.error) throw conversaData.error;

      // Insert the message using existing schema
      const { data: newMsg, error: insertError } = await supabase
        .from('mensagens')
        .insert({
          conversa_pai: conversaData.data.id_conversa,
          direcao: 'saida',
          texto_mensagem: texto,
          timestamp: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (insertError) throw insertError;

      // Update conversation timestamp
      await supabase
        .from('conversas')
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversaId);

      // Call edge function to send via WhatsApp
      if (conversa?.numero_contato) {
        const { error: sendError } = await supabase.functions.invoke('send-whatsapp', {
          body: {
            to: conversa.numero_contato,
            message: texto,
          },
        });
        
        if (sendError) {
          console.error('Error sending WhatsApp:', sendError);
          // Don't throw - message is saved locally
        }
      }

      return newMsg;
    },
    onSuccess: () => {
      setMensagem("");
      queryClient.invalidateQueries({ queryKey: ['mensagens', conversaId] });
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      toast.error("Erro ao enviar mensagem. Tente novamente.");
    },
  });

  const handleSend = () => {
    if (!mensagem.trim()) return;
    sendMutation.mutate(mensagem.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-4">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className={cn("h-12 w-2/3", i % 2 === 0 ? "" : "ml-auto")} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Contact info bar */}
      <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium text-sm truncate">{conversa?.nome_contato}</span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">{conversa?.numero_contato}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {mensagens?.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhuma mensagem ainda. Envie a primeira!
            </p>
          )}
          {mensagens?.map((msg) => {
            const isFromMe = msg.direcao === 'saida';
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  isFromMe ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                    isFromMe
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-muted rounded-bl-none"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.texto_mensagem}</p>
                  <span
                    className={cn(
                      "text-[10px] mt-1 block",
                      isFromMe ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}
                  >
                    {format(new Date(msg.timestamp), "HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t bg-muted/10">
        <div className="flex gap-2">
          <Textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!mensagem.trim() || sendMutation.isPending}
            className="h-[44px] px-4"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
