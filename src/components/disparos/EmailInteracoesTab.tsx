import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Mail, 
  Send, 
  User, 
  Clock, 
  ArrowLeft,
  Search,
  MessageSquare,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ConversaResumo {
  email_destino: string;
  nome_destino: string | null;
  proposta_id: string | null;
  lead_id: string | null;
  ultima_mensagem: string;
  ultima_data: string;
  total_mensagens: number;
  tem_resposta: boolean;
}

interface Interacao {
  id: string;
  proposta_id: string | null;
  lead_id: string | null;
  email_destino: string;
  nome_destino: string | null;
  direcao: "enviado" | "recebido";
  assunto: string | null;
  corpo: string;
  status: string;
  enviado_por_nome: string | null;
  created_at: string;
}

export function EmailInteracoesTab() {
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [novaResposta, setNovaResposta] = useState("");
  const [assuntoResposta, setAssuntoResposta] = useState("");
  const queryClient = useQueryClient();

  // Buscar lista de conversas agrupadas por email
  const { data: conversas = [], isLoading: loadingConversas } = useQuery({
    queryKey: ["email-conversas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_interacoes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Agrupar por email_destino
      const agrupado = new Map<string, ConversaResumo>();
      
      for (const item of data || []) {
        const key = item.email_destino;
        if (!agrupado.has(key)) {
          agrupado.set(key, {
            email_destino: item.email_destino,
            nome_destino: item.nome_destino,
            proposta_id: item.proposta_id,
            lead_id: item.lead_id,
            ultima_mensagem: item.corpo,
            ultima_data: item.created_at,
            total_mensagens: 1,
            tem_resposta: item.direcao === "recebido",
          });
        } else {
          const existing = agrupado.get(key)!;
          existing.total_mensagens++;
          if (new Date(item.created_at) > new Date(existing.ultima_data)) {
            existing.ultima_mensagem = item.corpo;
            existing.ultima_data = item.created_at;
          }
          if (item.direcao === "recebido") {
            existing.tem_resposta = true;
          }
        }
      }

      return Array.from(agrupado.values()).sort(
        (a, b) => new Date(b.ultima_data).getTime() - new Date(a.ultima_data).getTime()
      );
    },
  });

  // Buscar mensagens da conversa selecionada
  const { data: mensagens = [], isLoading: loadingMensagens } = useQuery({
    queryKey: ["email-mensagens", selectedEmail],
    queryFn: async () => {
      if (!selectedEmail) return [];

      const { data, error } = await supabase
        .from("email_interacoes")
        .select("*")
        .eq("email_destino", selectedEmail)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Interacao[];
    },
    enabled: !!selectedEmail,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("email-interacoes-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_interacoes",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["email-conversas"] });
          queryClient.invalidateQueries({ queryKey: ["email-mensagens"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Enviar resposta
  const enviarRespostaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEmail || !novaResposta.trim()) {
        throw new Error("Preencha a mensagem");
      }

      const user = (await supabase.auth.getUser()).data.user;
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", user?.id)
        .single();

      // Buscar dados da conversa
      const conversa = conversas.find(c => c.email_destino === selectedEmail);
      
      // Registrar interação
      const { error: insertError } = await supabase.from("email_interacoes").insert({
        proposta_id: conversa?.proposta_id || null,
        lead_id: conversa?.lead_id || null,
        email_destino: selectedEmail,
        nome_destino: conversa?.nome_destino || null,
        direcao: "enviado",
        assunto: assuntoResposta || "Re: Oportunidade de Trabalho",
        corpo: novaResposta,
        status: "enviado",
        enviado_por: user?.id,
        enviado_por_nome: profile?.nome_completo || "Usuário",
      });

      if (insertError) throw insertError;

      // Enviar email via edge function
      const { error: emailError } = await supabase.functions.invoke("send-bulk-emails", {
        body: {
          assunto: assuntoResposta || "Re: Oportunidade de Trabalho",
          corpo: novaResposta,
          destinatarios: [
            {
              nome: conversa?.nome_destino || "Profissional",
              email: selectedEmail,
              telefone: "",
            },
          ],
          tamanhoLote: 1,
        },
      });

      if (emailError) throw emailError;
    },
    onSuccess: () => {
      toast.success("Resposta enviada!");
      setNovaResposta("");
      setAssuntoResposta("");
      queryClient.invalidateQueries({ queryKey: ["email-mensagens", selectedEmail] });
      queryClient.invalidateQueries({ queryKey: ["email-conversas"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const conversasFiltradas = conversas.filter(
    c =>
      c.email_destino.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.nome_destino?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const conversaSelecionada = conversas.find(c => c.email_destino === selectedEmail);

  return (
    <div className="flex h-[calc(100vh-220px)] border rounded-lg overflow-hidden bg-background">
      {/* Lista de Conversas */}
      <div className={cn(
        "w-80 border-r flex flex-col",
        selectedEmail ? "hidden md:flex" : "flex w-full md:w-80"
      )}>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loadingConversas ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : conversasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? "Nenhuma conversa encontrada" : "Nenhuma interação de email ainda"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {conversasFiltradas.map((conversa) => (
                <div
                  key={conversa.email_destino}
                  className={cn(
                    "p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedEmail === conversa.email_destino && "bg-muted"
                  )}
                  onClick={() => setSelectedEmail(conversa.email_destino)}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {(conversa.nome_destino || conversa.email_destino)[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate">
                          {conversa.nome_destino || conversa.email_destino.split("@")[0]}
                        </span>
                        {conversa.tem_resposta && (
                          <Badge variant="default" className="text-xs">
                            Respondeu
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {conversa.email_destino}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                        {conversa.ultima_mensagem}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(conversa.ultima_data), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {conversa.total_mensagens} msg
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Área de Chat */}
      <div className={cn(
        "flex-1 flex flex-col",
        !selectedEmail ? "hidden md:flex" : "flex"
      )}>
        {!selectedEmail ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Mail className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Selecione uma conversa para visualizar</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header do Chat */}
            <div className="p-3 border-b flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSelectedEmail(null)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {(conversaSelecionada?.nome_destino || selectedEmail)[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">
                  {conversaSelecionada?.nome_destino || selectedEmail.split("@")[0]}
                </p>
                <p className="text-xs text-muted-foreground">{selectedEmail}</p>
              </div>
            </div>

            {/* Mensagens */}
            <ScrollArea className="flex-1 p-4">
              {loadingMensagens ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {mensagens.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.direcao === "enviado" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-lg p-3",
                          msg.direcao === "enviado"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        {msg.assunto && (
                          <p className={cn(
                            "text-xs font-medium mb-1",
                            msg.direcao === "enviado" ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}>
                            {msg.assunto}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.corpo}</p>
                        <div className={cn(
                          "flex items-center gap-2 mt-2 text-xs",
                          msg.direcao === "enviado" ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          <Clock className="h-3 w-3" />
                          {format(new Date(msg.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          {msg.direcao === "enviado" && msg.enviado_por_nome && (
                            <>
                              <span>•</span>
                              <User className="h-3 w-3" />
                              {msg.enviado_por_nome}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Input de Resposta */}
            <div className="p-3 border-t space-y-2">
              <Input
                placeholder="Assunto da resposta (opcional)"
                value={assuntoResposta}
                onChange={(e) => setAssuntoResposta(e.target.value)}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Textarea
                  placeholder="Digite sua resposta..."
                  value={novaResposta}
                  onChange={(e) => setNovaResposta(e.target.value)}
                  rows={2}
                  className="flex-1 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (novaResposta.trim()) {
                        enviarRespostaMutation.mutate();
                      }
                    }
                  }}
                />
                <Button
                  onClick={() => enviarRespostaMutation.mutate()}
                  disabled={!novaResposta.trim() || enviarRespostaMutation.isPending}
                  size="icon"
                  className="h-auto"
                >
                  {enviarRespostaMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
