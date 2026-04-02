import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelacionamentoDialog } from "@/components/relacionamento/RelacionamentoDialog";
import { RelacionamentoList } from "@/components/relacionamento/RelacionamentoList";
import { FiltroRelacionamento } from "@/components/relacionamento/FiltroRelacionamento";
import { HomeTab } from "@/components/relacionamento/HomeTab";
import { BlacklistTab } from "@/components/medicos/BlacklistTab";
import { WorklistKanban } from "@/components/worklist/WorklistKanban";
import { MedicosAusentesCard } from "@/components/relacionamento/MedicosAusentesCard";

const RELACIONAMENTO_COLUMNS = [
  { id: 'inicio_identificacao', label: 'Início Identificação' },
  { id: 'captacao_documentacao', label: 'Captação de Documentação' },
  { id: 'pendencia_documentacao', label: 'Pendência de Documentação' },
  { id: 'documentacao_finalizada', label: 'Documentação Finalizada' },
  { id: 'criacao_escalas', label: 'Criação de Escalas' },
];

export default function RelacionamentoMedico() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRelacionamento, setEditingRelacionamento] = useState<any>(null);
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("home");
  const queryClient = useQueryClient();

  const { data: relacionamentos, isLoading } = useQuery({
    queryKey: ['relacionamentos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('relacionamento_medico')
        .select(`
          *,
          cliente_vinculado:clientes(nome_fantasia),
          medico_vinculado:medicos(nome_completo)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('relacionamento_medico')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relacionamentos'] });
      queryClient.invalidateQueries({ queryKey: ['relacionamentos-home'] });
      toast.success('Registro excluído com sucesso');
    },
    onError: () => {
      toast.error('Erro ao excluir registro');
    },
  });

  const handleEdit = (relacionamento: any) => {
    setEditingRelacionamento(relacionamento);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este registro?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleTipoToggle = (tipo: string) => {
    setSelectedTipos((prev) =>
      prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo]
    );
  };

  const handleStatusToggle = (status: string) => {
    setSelectedStatus((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handleClearFilters = () => {
    setSelectedTipos([]);
    setSelectedStatus([]);
  };

  const filteredRelacionamentos = useMemo(() => {
    if (!relacionamentos) return [];
    
    return relacionamentos.filter((rel) => {
      const tipoMatch = selectedTipos.length === 0 || selectedTipos.includes(rel.tipo_principal);
      const statusMatch = selectedStatus.length === 0 || selectedStatus.includes(rel.status);
      return tipoMatch && statusMatch;
    });
  }, [relacionamentos, selectedTipos, selectedStatus]);

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Relacionamento Médico</h1>
        <p className="text-sm text-muted-foreground">Gerencie reclamações e ações</p>
      </div>
      {activeTab !== "blacklist" && activeTab !== "worklist" && (
        <Button onClick={() => {
          setEditingRelacionamento(null);
          setDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Registro
        </Button>
      )}
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4">

        <Tabs defaultValue="home" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="home">Home</TabsTrigger>
            <TabsTrigger value="worklist" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Worklist
            </TabsTrigger>
            <TabsTrigger value="registros">Registros</TabsTrigger>
            <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="mt-6">
            <div className="space-y-6">
              <MedicosAusentesCard />
              <HomeTab />
            </div>
          </TabsContent>

          <TabsContent value="worklist" className="mt-6">
            <WorklistKanban modulo="relacionamento" columns={RELACIONAMENTO_COLUMNS} />
          </TabsContent>

          <TabsContent value="registros" className="mt-6">
            <FiltroRelacionamento
              selectedTipos={selectedTipos}
              selectedStatus={selectedStatus}
              onTipoToggle={handleTipoToggle}
              onStatusToggle={handleStatusToggle}
              onClearFilters={handleClearFilters}
            />

            <RelacionamentoList
              relacionamentos={filteredRelacionamentos}
              isLoading={isLoading}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </TabsContent>

          <TabsContent value="blacklist" className="mt-6">
            <BlacklistTab />
          </TabsContent>
        </Tabs>

        <RelacionamentoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          relacionamento={editingRelacionamento}
        />
      </div>
    </AppLayout>
  );
}
