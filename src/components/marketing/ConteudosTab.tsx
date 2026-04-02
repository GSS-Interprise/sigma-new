import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_LABELS = {
  rascunho: { label: 'Rascunho', variant: 'secondary' as const },
  pronto: { label: 'Pronto', variant: 'default' as const },
  publicado: { label: 'Publicado', variant: 'outline' as const },
};

const TIPO_LABELS = {
  video: 'Vídeo',
  card: 'Card',
  reels: 'Reels',
  artigo: 'Artigo',
  newsletter: 'Newsletter',
};

export function ConteudosTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const queryClient = useQueryClient();

  const { data: conteudos, isLoading } = useQuery({
    queryKey: ['conteudos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conteudos' as any)
        .select('*, responsavel:profiles(nome_completo)');
      if (error) throw error;
      return data as any;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('conteudos' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conteudos'] });
      toast.success('Conteúdo excluído com sucesso');
    },
  });

  const filteredConteudos = conteudos?.filter(c => {
    const matchSearch = c.titulo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchTipo = filterTipo === 'all' || c.tipo === filterTipo;
    return matchSearch && matchStatus && matchTipo;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Conteúdos Editoriais</h2>
          <p className="text-sm text-muted-foreground">Gerencie seu calendário editorial e produções</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Conteúdo
        </Button>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Buscar conteúdo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="pronto">Pronto</SelectItem>
            <SelectItem value="publicado">Publicado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="video">Vídeo</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="reels">Reels</SelectItem>
            <SelectItem value="artigo">Artigo</SelectItem>
            <SelectItem value="newsletter">Newsletter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredConteudos?.map((conteudo) => (
            <Card key={conteudo.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-2">
                <h3 className="font-semibold line-clamp-2">{conteudo.titulo}</h3>
                <Badge variant={STATUS_LABELS[conteudo.status as keyof typeof STATUS_LABELS].variant}>
                  {STATUS_LABELS[conteudo.status as keyof typeof STATUS_LABELS].label}
                </Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-medium">{TIPO_LABELS[conteudo.tipo as keyof typeof TIPO_LABELS]}</span>
                </div>
                {conteudo.data_publicacao && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarIcon className="h-4 w-4" />
                    <span>{format(new Date(conteudo.data_publicacao), "dd 'de' MMMM", { locale: ptBR })}</span>
                  </div>
                )}
                {conteudo.tags && conteudo.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {conteudo.tags.slice(0, 3).map((tag, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
                {(conteudo.alcance || conteudo.cliques || conteudo.engajamento) && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                    {conteudo.alcance && (
                      <div className="text-center">
                        <div className="font-semibold">{conteudo.alcance}</div>
                        <div className="text-xs text-muted-foreground">Alcance</div>
                      </div>
                    )}
                    {conteudo.cliques && (
                      <div className="text-center">
                        <div className="font-semibold">{conteudo.cliques}</div>
                        <div className="text-xs text-muted-foreground">Cliques</div>
                      </div>
                    )}
                    {conteudo.engajamento && (
                      <div className="text-center">
                        <div className="font-semibold">{Number(conteudo.engajamento).toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">Engajamento</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">Editar</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm('Deseja excluir este conteúdo?')) {
                      deleteMutation.mutate(conteudo.id);
                    }
                  }}
                >
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}