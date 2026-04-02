import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Building2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function ParceirosTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  const { data: parceiros, isLoading } = useQuery({
    queryKey: ['parceiros'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros' as any)
        .select('*');
      if (error) throw error;
      return data as any;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('parceiros' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      toast.success('Parceiro excluído com sucesso');
    },
  });

  const filteredParceiros = parceiros?.filter(p =>
    p.nome_empresa.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Parceiros (CRM Leve)</h2>
          <p className="text-sm text-muted-foreground">Gerencie relacionamento com hospitais e empresas parceiras</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Parceiro
        </Button>
      </div>

      <Input
        placeholder="Buscar parceiro..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <div>Carregando parceiros...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredParceiros?.map((parceiro) => (
            <Card key={parceiro.id} className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold">{parceiro.nome_empresa}</h3>
                    {parceiro.cnpj && (
                      <p className="text-xs text-muted-foreground">CNPJ: {parceiro.cnpj}</p>
                    )}
                  </div>
                </div>
                <Badge variant={parceiro.status === 'ativo' ? 'default' : 'secondary'}>
                  {parceiro.status}
                </Badge>
              </div>

              {parceiro.contatos_principais && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-sm font-medium">Contatos Principais:</p>
                  {Array.isArray(parceiro.contatos_principais) && parceiro.contatos_principais.slice(0, 2).map((contato: any, idx: number) => (
                    <div key={idx} className="text-sm space-y-1 pl-2">
                      <p className="font-medium">{contato.nome}</p>
                      {contato.email && (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <Mail className="h-3 w-3" />
                          <span>{contato.email}</span>
                        </div>
                      )}
                      {contato.telefone && (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <Phone className="h-3 w-3" />
                          <span>{contato.telefone}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {parceiro.oportunidades && Array.isArray(parceiro.oportunidades) && parceiro.oportunidades.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-2">Oportunidades:</p>
                  <div className="space-y-1">
                    {parceiro.oportunidades.slice(0, 2).map((op: any, idx: number) => (
                      <p key={idx} className="text-xs text-muted-foreground pl-2">• {op.titulo}</p>
                    ))}
                  </div>
                </div>
              )}

              {parceiro.observacoes && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground line-clamp-2">{parceiro.observacoes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">Ver Detalhes</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm('Deseja excluir este parceiro?')) {
                      deleteMutation.mutate(parceiro.id);
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