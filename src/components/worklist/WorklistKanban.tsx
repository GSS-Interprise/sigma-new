import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Calendar, User, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface WorklistKanbanProps {
  modulo: string;
  columns: { id: string; label: string }[];
  onTaskDoubleClick?: (task: any) => void;
}

type TaskWithResponsavel = {
  id: string;
  modulo: string;
  titulo: string;
  descricao: string | null;
  status: string;
  responsavel_id: string | null;
  data_limite: string | null;
  prioridade: string | null;
  responsavel?: { id: string; nome_completo: string } | null;
};

export function WorklistKanban({ modulo, columns, onTaskDoubleClick }: WorklistKanbanProps) {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<any>(null);

  const { data: tasks, isLoading } = useQuery<TaskWithResponsavel[]>({
    queryKey: ['worklist', modulo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worklist_tarefas')
        .select('*')
        .eq('modulo', modulo)
        .order('created_at', { ascending: false});
      
      if (error) throw error;
      
      // Fetch responsavel data separately
      if (data && data.length > 0) {
        const responsaveisIds = data
          .map(t => t.responsavel_id)
          .filter((id): id is string => id !== null);
        
        if (responsaveisIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, nome_completo')
            .in('id', responsaveisIds);
          
          const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
          
          return data.map(task => ({
            ...task,
            responsavel: task.responsavel_id ? profilesMap.get(task.responsavel_id) : null
          })) as TaskWithResponsavel[];
        }
      }
      
      return (data || []) as TaskWithResponsavel[];
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('worklist_tarefas')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklist', modulo] });
      toast.success('Tarefa atualizada');
    },
  });

  const getTasksByStatus = (status: string) => {
    return tasks?.filter(task => task.status === status) || [];
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      updateTaskMutation.mutate({ id: taskId, status: newStatus });
    }
  };

  const getPriorityColor = (prioridade: string) => {
    switch (prioridade) {
      case 'alta': return 'destructive';
      case 'media': return 'default';
      case 'baixa': return 'secondary';
      default: return 'default';
    }
  };

  if (isLoading) {
    return <div className="p-4">Carregando...</div>;
  }

  return (
    <div className="flex gap-2 sm:gap-3 overflow-x-auto h-full pb-2 px-1">
      {columns.map((column) => (
        <Card 
          key={column.id} 
          className="w-[260px] sm:w-[280px] md:w-[300px] lg:w-[320px] flex-shrink-0 flex flex-col h-full"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{column.label}</span>
              <Badge variant="outline">
                {getTasksByStatus(column.id).length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-3">
                {getTasksByStatus(column.id).map((task) => (
                  <Card
                    key={task.id}
                    className="cursor-move hover:shadow-md transition-shadow"
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDoubleClick={() => onTaskDoubleClick?.(task)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-sm flex-1">{task.titulo}</h4>
                        <Badge variant={getPriorityColor(task.prioridade)} className="text-xs">
                          {task.prioridade}
                        </Badge>
                      </div>
                      
                      {task.descricao && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {task.descricao}
                        </p>
                      )}
                      
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {task.data_limite && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(task.data_limite), 'dd/MM/yyyy')}</span>
                          </div>
                        )}
                        
                        {task.responsavel && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>{task.responsavel.nome_completo}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {getTasksByStatus(column.id).length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma tarefa
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
