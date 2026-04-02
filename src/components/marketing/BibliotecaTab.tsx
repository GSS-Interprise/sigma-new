import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Image as ImageIcon, FileCode, Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIA_ICONS = {
  pdf: FileText,
  apresentacao: FileCode,
  modelo_mensagem: FileText,
  logo: ImageIcon,
  template: FileCode,
  politica_interna: FileText,
};

const CATEGORIA_LABELS = {
  pdf: 'PDF',
  apresentacao: 'Apresentação',
  modelo_mensagem: 'Modelo de Mensagem',
  logo: 'Logo',
  template: 'Template',
  politica_interna: 'Política Interna',
};

export function BibliotecaTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState<string>("all");
  const queryClient = useQueryClient();

  const { data: materiais, isLoading } = useQuery({
    queryKey: ['materiais-biblioteca'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materiais_biblioteca' as any)
        .select('*, uploader:profiles(nome_completo)');
      if (error) throw error;
      return data as any;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('materiais_biblioteca' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materiais-biblioteca'] });
      toast.success('Material excluído com sucesso');
    },
  });

  const filteredMateriais = materiais?.filter(m => {
    const matchSearch = m.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategoria = filterCategoria === 'all' || m.categoria === filterCategoria;
    return matchSearch && matchCategoria;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Biblioteca de Materiais</h2>
          <p className="text-sm text-muted-foreground">Organize e compartilhe materiais institucionais</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Material
        </Button>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Buscar material..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filterCategoria} onValueChange={setFilterCategoria}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="apresentacao">Apresentação</SelectItem>
            <SelectItem value="modelo_mensagem">Modelo de Mensagem</SelectItem>
            <SelectItem value="logo">Logo</SelectItem>
            <SelectItem value="template">Template</SelectItem>
            <SelectItem value="politica_interna">Política Interna</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div>Carregando biblioteca...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredMateriais?.map((material) => {
            const Icon = CATEGORIA_ICONS[material.categoria as keyof typeof CATEGORIA_ICONS];
            return (
              <Card key={material.id} className="p-4 space-y-3 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{material.nome}</h3>
                    <Badge variant="secondary" className="mt-1">
                      {CATEGORIA_LABELS[material.categoria as keyof typeof CATEGORIA_LABELS]}
                    </Badge>
                  </div>
                </div>
                {material.descricao && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{material.descricao}</p>
                )}
                {material.pasta && (
                  <p className="text-xs text-muted-foreground">📁 {material.pasta}</p>
                )}
                {material.tags && material.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {material.tags.slice(0, 3).map((tag, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Download className="h-3 w-3 mr-1" />
                    Baixar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm('Deseja excluir este material?')) {
                        deleteMutation.mutate(material.id);
                      }
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}