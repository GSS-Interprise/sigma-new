import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, RefreshCw } from "lucide-react";
import { ConversaCard } from "./ConversaCard";
import { FiltroStatus } from "./FiltroConversas";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

interface ConversasListProps {
  filtro: FiltroStatus;
  onSelectConversa: (id: string) => void;
  selectedConversaId: string | null;
  userId?: string;
}

export function ConversasListUpdated({ 
  filtro, 
  onSelectConversa, 
  selectedConversaId,
}: ConversasListProps) {
  const { data: conversas, isLoading, refetch } = useQuery({
    queryKey: ['conversas', filtro],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversas')
        .select('*')
        .order('updated_at', { ascending: false, nullsFirst: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Subscribe to realtime updates
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const channel = supabase
      .channel('conversas-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversas'
        },
        () => {
          refetchRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!conversas?.length) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 pb-2 border-b">
        <span className="text-xs text-muted-foreground">
          {conversas.length} conversa{conversas.length !== 1 ? 's' : ''}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-2">
          {conversas.map((conversa) => (
            <ConversaCard
              key={conversa.id}
              conversa={conversa}
              isSelected={selectedConversaId === conversa.id}
              onClick={() => onSelectConversa(conversa.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
