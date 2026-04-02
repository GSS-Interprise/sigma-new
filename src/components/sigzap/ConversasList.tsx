import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ConversasListProps {
  onSelectConversa: (conversaId: string) => void;
  selectedConversaId?: string;
}

export function ConversasList({ onSelectConversa, selectedConversaId }: ConversasListProps) {
  const { data: conversas, isLoading } = useQuery({
    queryKey: ['conversas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversas')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!conversas || conversas.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhuma conversa ainda</p>
          <p className="text-sm text-muted-foreground mt-2">
            Use o testador de endpoint abaixo para criar conversas
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {conversas.map((conversa) => (
        <Card
          key={conversa.id}
          className={`cursor-pointer transition-colors hover:bg-accent ${
            selectedConversaId === conversa.id ? 'bg-accent' : ''
          }`}
          onClick={() => onSelectConversa(conversa.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-semibold truncate">{conversa.nome_contato}</h3>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(conversa.updated_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {conversa.numero_contato}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
