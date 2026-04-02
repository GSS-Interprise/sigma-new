import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Smartphone, Wifi, WifiOff, CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

interface FiltroInstanciasProps {
  selectedInstanceId: string | null;
  onSelectInstance: (id: string | null) => void;
}

export function FiltroInstancias({ selectedInstanceId, onSelectInstance }: FiltroInstanciasProps) {
  const queryClient = useQueryClient();
  
  const { data: instances, isLoading } = useQuery({
    queryKey: ['chips-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chips')
        .select('*')
        .order('nome', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription for chips table
  useEffect(() => {
    const channel = supabase
      .channel('chips-realtime-sigzap')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chips'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['chips-instances'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const connectedInstances = instances?.filter(i => i.connection_state === 'open') || [];
  const otherInstances = instances?.filter(i => i.connection_state !== 'open') || [];

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {/* Connected instances only */}
        {connectedInstances.map((instance) => (
          <Card
            key={instance.id}
            className={cn(
              "p-3 cursor-pointer transition-all hover:shadow-md",
              selectedInstanceId === instance.id && "ring-2 ring-primary bg-primary/5"
            )}
            onClick={() => onSelectInstance(instance.id)}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-green-500/10 flex items-center justify-center">
                <Wifi className="h-4 w-4 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{instance.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {instance.numero || instance.instance_name}
                </p>
              </div>
              <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-[10px]">
                Online
              </Badge>
            </div>
          </Card>
        ))}

      </div>
    </ScrollArea>
  );
}
