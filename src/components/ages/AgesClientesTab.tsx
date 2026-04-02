import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import AgesClienteDialog from "./AgesClienteDialog";
import AgesClienteList from "./AgesClienteList";
import AgesUnidadesManager from "./AgesUnidadesManager";

interface AgesCliente {
  id: string;
  nome_empresa: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  cidade?: string | null;
  uf?: string | null;
  contato_principal?: string | null;
  status_cliente: string;
  especialidade_cliente?: string | null;
}

const AgesClientesTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<AgesCliente | null>(null);
  const [unidadesManagerOpen, setUnidadesManagerOpen] = useState(false);
  const [clienteForUnidades, setClienteForUnidades] = useState<AgesCliente | null>(null);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["ages-clientes", search],
    queryFn: async () => {
      let query = supabase
        .from("ages_clientes")
        .select("*")
        .order("nome_empresa");

      if (search) {
        query = query.or(`nome_empresa.ilike.%${search}%,nome_fantasia.ilike.%${search}%,cnpj.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AgesCliente[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ages_clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-clientes"] });
      toast.success("Cliente removido");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao remover cliente");
    },
  });

  const handleEdit = (cliente: AgesCliente) => {
    setSelectedCliente(cliente);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setSelectedCliente(null);
    setDialogOpen(true);
  };

  const handleManageUnidades = (cliente: AgesCliente) => {
    setClienteForUnidades(cliente);
    setUnidadesManagerOpen(true);
  };

  // Métricas
  const totalClientes = clientes.length;
  const clientesAtivos = clientes.filter(c => c.status_cliente === 'Ativo').length;
  const clientesInativos = clientes.filter(c => c.status_cliente !== 'Ativo').length;

  return (
    <div className="space-y-4">
      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total de Clientes</div>
          <div className="text-2xl font-bold">{totalClientes}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Ativos</div>
          <div className="text-2xl font-bold text-green-600">{clientesAtivos}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Inativos</div>
          <div className="text-2xl font-bold text-muted-foreground">{clientesInativos}</div>
        </Card>
      </div>

      {/* Filtro e Ações */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, fantasia ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      {/* Lista */}
      <Card>
        <AgesClienteList
          clientes={clientes}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={(id) => deleteMutation.mutate(id)}
          onManageUnidades={handleManageUnidades}
        />
      </Card>

      {/* Dialogs */}
      <AgesClienteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cliente={selectedCliente}
      />

      {clienteForUnidades && (
        <AgesUnidadesManager
          open={unidadesManagerOpen}
          onOpenChange={setUnidadesManagerOpen}
          cliente={clienteForUnidades}
        />
      )}
    </div>
  );
};

export default AgesClientesTab;
