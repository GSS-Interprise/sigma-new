import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, FileDown } from "lucide-react";
import { toast } from "sonner";
import { exportClientesToPDF } from "@/lib/pdfExport";
import { ClienteDialog } from "@/components/clientes/ClienteDialog";
import { ClienteList } from "@/components/clientes/ClienteList";
import { FiltroClientes } from "@/components/clientes/FiltroClientes";
import { handleError } from "@/lib/errorHandler";

export default function Clientes() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<any>(null);
  const [searchNome, setSearchNome] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedUf, setSelectedUf] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Primeiro verifica se há contratos vinculados
      const { data: contratos } = await supabase
        .from('contratos')
        .select('id')
        .eq('cliente_id', id);
      
      if (contratos && contratos.length > 0) {
        throw new Error('Não é possível excluir cliente com contratos vinculados. Exclua os contratos primeiro.');
      }

      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Cliente excluído com sucesso');
    },
    onError: (error: any) => {
      const errorMessage = handleError(error, 'Exclusão de cliente');
      toast.error(errorMessage);
    },
  });

  const handleEdit = (cliente: any) => {
    setEditingCliente(cliente);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleStatusToggle = (status: string) => {
    setSelectedStatus(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleUfToggle = (uf: string) => {
    setSelectedUf(prev =>
      prev.includes(uf)
        ? prev.filter(u => u !== uf)
        : [...prev, uf]
    );
  };

  const handleClearFilters = () => {
    setSearchNome("");
    setSelectedStatus([]);
    setSelectedUf([]);
  };

  const filteredClientes = useMemo(() => {
    if (!clientes) return [];
    
    return clientes.filter((cliente) => {
      const matchesNome = searchNome === "" || 
        cliente.nome_fantasia?.toLowerCase().includes(searchNome.toLowerCase());
      
      const matchesStatus = selectedStatus.length === 0 || 
        selectedStatus.includes(cliente.status_cliente || 'Ativo');
      
      const matchesUf = selectedUf.length === 0 || 
        selectedUf.includes(cliente.uf);
      
      return matchesNome && matchesStatus && matchesUf;
    });
  }, [clientes, searchNome, selectedStatus, selectedUf]);

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
        <p className="text-sm text-muted-foreground">Gerencie seus clientes</p>
      </div>
      <div className="flex gap-2">
        <Button 
          variant="outline"
          onClick={() => exportClientesToPDF(filteredClientes, filteredClientes.length)}
        >
          <FileDown className="mr-2 h-4 w-4" />
          Exportar PDF
        </Button>
        <Button onClick={() => {
          setEditingCliente(null);
          setDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Cliente
        </Button>
      </div>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4">

        <FiltroClientes
          searchNome={searchNome}
          selectedStatus={selectedStatus}
          selectedUf={selectedUf}
          onSearchChange={setSearchNome}
          onStatusToggle={handleStatusToggle}
          onUfToggle={handleUfToggle}
          onClearFilters={handleClearFilters}
        />

        <ClienteList
          clientes={filteredClientes}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        <ClienteDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          cliente={editingCliente}
        />
      </div>
    </AppLayout>
  );
}
