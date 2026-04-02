import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MensagensViewProps {
  conversaId: string;
}

export function MensagensView({ conversaId }: MensagensViewProps) {
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

  const { data: mensagens, isLoading } = useQuery({
    queryKey: ['mensagens', conversaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mensagens')
        .select('*')
        .eq('conversa_pai', conversaId)
        .order('timestamp', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Carregando mensagens...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>{conversa?.nome_contato}</CardTitle>
            <p className="text-sm text-muted-foreground">{conversa?.numero_contato}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[500px] p-4">
          {!mensagens || mensagens.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhuma mensagem ainda</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mensagens.map((mensagem) => (
                <div
                  key={mensagem.id}
                  className={`flex gap-2 ${
                    mensagem.direcao === 'saida' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
                      mensagem.direcao === 'saida'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {mensagem.direcao === 'entrada' ? (
                        <ArrowDownCircle className="h-4 w-4" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4" />
                      )}
                      <span className="text-xs opacity-70">
                        {mensagem.direcao === 'entrada' ? 'Recebida' : 'Enviada'}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{mensagem.texto_mensagem}</p>
                    <p className="text-xs opacity-70 mt-2">
                      {format(new Date(mensagem.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
