import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Briefcase, 
  FileText, 
  Folder, 
  ArrowRight,
  CheckSquare,
  Pin
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WorkspaceHomeCardProps {
  onNavigate?: () => void;
}

export function WorkspaceHomeCard({ onNavigate }: WorkspaceHomeCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleNavigate = () => {
    if (onNavigate) {
      onNavigate();
    } else {
      navigate('/workspace');
    }
  };

  // Buscar estatísticas do workspace
  const { data: stats } = useQuery({
    queryKey: ['workspace-home-stats'],
    queryFn: async () => {
      // Total de pastas
      const { count: pastasCount } = await supabase
        .from('user_pastas')
        .select('*', { count: 'exact', head: true });

      // Total de notas
      const { count: notasCount } = await supabase
        .from('user_notas')
        .select('*', { count: 'exact', head: true })
        .eq('arquivada', false);

      // Notas fixadas
      const { count: fixadasCount } = await supabase
        .from('user_notas')
        .select('*', { count: 'exact', head: true })
        .eq('fixada', true)
        .eq('arquivada', false);

      return {
        pastas: pastasCount || 0,
        notas: notasCount || 0,
        fixadas: fixadasCount || 0,
      };
    },
    enabled: !!user,
  });

  // Buscar últimas notas
  const { data: ultimasNotas = [] } = useQuery({
    queryKey: ['workspace-ultimas-notas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_notas')
        .select(`
          id,
          titulo,
          tags,
          fixada,
          updated_at,
          user_pastas(nome, cor, icone)
        `)
        .eq('arquivada', false)
        .order('updated_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5 text-primary" />
            Minha Área de Serviços
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleNavigate}>
            Acessar
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Estatísticas */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{stats?.pastas || 0}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Folder className="h-3 w-3" />
              Pastas
            </div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{stats?.notas || 0}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <FileText className="h-3 w-3" />
              Notas
            </div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{stats?.fixadas || 0}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Pin className="h-3 w-3" />
              Fixadas
            </div>
          </div>
        </div>

        {/* Últimas notas */}
        {ultimasNotas.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase">
              Atualizações recentes
            </div>
            {ultimasNotas.map((nota: any) => (
              <div 
                key={nota.id} 
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={handleNavigate}
              >
                {nota.fixada && <Pin className="h-3 w-3 text-primary flex-shrink-0" />}
                <span className="text-sm font-medium truncate flex-1">{nota.titulo}</span>
                {nota.tags?.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {nota.tags[0]}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {format(new Date(nota.updated_at), "dd MMM", { locale: ptBR })}
                </span>
              </div>
            ))}
          </div>
        )}

        {ultimasNotas.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma nota ainda</p>
            <Button 
              variant="link" 
              size="sm" 
              onClick={handleNavigate}
              className="mt-1"
            >
              Criar primeira nota
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}