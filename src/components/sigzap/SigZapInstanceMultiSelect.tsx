import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface SigZapInstanceMultiSelectProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

// Deterministic color palette for instances
const INSTANCE_COLORS = [
  'hsl(210, 100%, 45%)',  // blue
  'hsl(160, 84%, 39%)',   // teal/green
  'hsl(0, 72%, 51%)',     // red
  'hsl(280, 68%, 45%)',   // purple
  'hsl(45, 93%, 47%)',    // gold
  'hsl(330, 80%, 50%)',   // magenta
  'hsl(25, 95%, 53%)',    // orange
  'hsl(190, 80%, 42%)',   // cyan
  'hsl(120, 60%, 40%)',   // green
  'hsl(260, 60%, 55%)',   // violet
];

function getInstanceColor(index: number): string {
  return INSTANCE_COLORS[index % INSTANCE_COLORS.length];
}

export function SigZapInstanceMultiSelect({
  selectedIds,
  onSelectionChange,
}: SigZapInstanceMultiSelectProps) {
  const { user } = useAuth();

  // Fetch instances from sigzap_instances
  // Fetch active (connected + disconnected) instances — small set
  const { data: activeInstances, isLoading: loadingActive } = useQuery({
    queryKey: ['sigzap-instances-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sigzap_instances')
        .select('*')
        .neq('status', 'deleted')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Fetch deleted instances separately — large set, paginated
  const { data: deletedData, isLoading: loadingDeleted } = useQuery({
    queryKey: ['sigzap-instances-deleted'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sigzap_instances')
        .select('*')
        .eq('status', 'deleted')
        .order('name', { ascending: true })
        .range(0, 499);
      if (error) throw error;
      // Also get total count
      const { count } = await supabase
        .from('sigzap_instances')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'deleted');
      return { items: data || [], totalCount: count || 0 };
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const isLoading = loadingActive || loadingDeleted;
  const instances = [...(activeInstances || []), ...(deletedData?.items || [])];

  // Fetch current user's captador color
  const { data: captadorPerm } = useQuery({
    queryKey: ['minha-cor-captador', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('captacao_permissoes_usuario')
        .select('cor')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const minhaCor = captadorPerm?.cor || null;

  const connectedInstances = activeInstances?.filter(i => i.status === 'connected') || [];
  const disconnectedInstances = activeInstances?.filter(i => i.status !== 'connected') || [];
  const deletedInstances = deletedData?.items || [];
  const deletedTotalCount = deletedData?.totalCount || 0;
  const [showAllDeleted, setShowAllDeleted] = useState(false);

  const handleToggleInstance = (instanceId: string) => {
    if (selectedIds.includes(instanceId)) {
      onSelectionChange(selectedIds.filter(id => id !== instanceId));
    } else {
      onSelectionChange([...selectedIds, instanceId]);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-2">Carregando...</div>;
  }

  const renderInstance = (instance: any, index: number) => {
    const isSelected = selectedIds.includes(instance.id);
    const isConnected = instance.status === 'connected';
    const isDeleted = instance.status === 'deleted';
    const instanceColor = getInstanceColor(index);
    const activeColor = minhaCor || instanceColor;

    return (
      <div
        key={instance.id}
        className={cn(
          "flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all border-2 font-medium text-sm",
          isDeleted && "opacity-40",
          !isConnected && !isDeleted && "opacity-60"
        )}
        style={
          isSelected
            ? {
                backgroundColor: activeColor,
                borderColor: activeColor,
                color: '#fff',
              }
            : {
                borderColor: isDeleted ? 'hsl(var(--muted-foreground) / 0.3)' : instanceColor,
                color: 'inherit',
                backgroundColor: 'transparent',
              }
        }
        onClick={() => handleToggleInstance(instance.id)}
      >
        {isDeleted ? (
          <Trash2 className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-white/80" : "text-muted-foreground")} />
        ) : isConnected ? (
          <Wifi className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-white/80" : "text-green-500")} />
        ) : (
          <WifiOff className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-white/80" : "text-destructive")} />
        )}
        <span className="truncate flex-1">{instance.name}</span>
        {isDeleted && !isSelected && (
          <span className="text-[10px] text-muted-foreground font-medium">DEL</span>
        )}
        {!isConnected && !isDeleted && !isSelected && (
          <span className="text-[10px] text-destructive font-medium">OFF</span>
        )}
      </div>
    );
  };

  const DELETED_PREVIEW_COUNT = 10;

  // Build ordered list with stable color indices
  const orderedInstances = [
    ...connectedInstances.map((inst, i) => ({ ...inst, _colorIdx: i, _group: 'connected' as const })),
    ...disconnectedInstances.map((inst, i) => ({ ...inst, _colorIdx: connectedInstances.length + i, _group: 'disconnected' as const })),
    ...deletedInstances.map((inst, i) => ({ ...inst, _colorIdx: connectedInstances.length + disconnectedInstances.length + i, _group: 'deleted' as const })),
  ];

  const visibleDeleted = showAllDeleted ? deletedInstances : deletedInstances.slice(0, DELETED_PREVIEW_COUNT);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Filtrar Instâncias
      </h4>

      <ScrollArea className="h-[calc(60vh-4rem)]">
        <div className="space-y-3 pr-2">
          {/* Connected instances */}
          {connectedInstances.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground font-medium">Conectadas</p>
              {connectedInstances.map((inst, i) => renderInstance(inst, i))}
            </div>
          )}

          {/* Disconnected instances */}
          {disconnectedInstances.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground font-medium">Desconectadas</p>
              {disconnectedInstances.map((inst, i) => renderInstance(inst, connectedInstances.length + i))}
            </div>
          )}

          {/* Deleted instances - hidden by default */}
          {deletedInstances.length > 0 && (
            <div className="space-y-1.5">
              {!showAllDeleted ? (
                <button
                  onClick={() => setShowAllDeleted(true)}
                  className="w-full text-xs text-muted-foreground hover:text-primary hover:underline py-1"
                >
                  Mostrar deletadas ({deletedInstances.length})
                </button>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground font-medium">Deletadas ({deletedInstances.length})</p>
                  {deletedInstances.map((inst, i) => renderInstance(inst, connectedInstances.length + disconnectedInstances.length + i))}
                </>
              )}
            </div>
          )}

          {(!instances || instances.length === 0) && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma instância encontrada
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
