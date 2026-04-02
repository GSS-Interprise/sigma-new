import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, FileDown } from "lucide-react";
import { toast } from "sonner";
import { exportContratosToPDF, exportClientesToPDF } from "@/lib/pdfExport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ContratoDialogWithClient } from "@/components/contratos/ContratoDialogWithClient";
import { ContratoList } from "@/components/contratos/ContratoList";
import { FiltroContratos } from "@/components/contratos/FiltroContratos";
import { ContratosMetrics } from "@/components/contratos/ContratosMetrics";
import { ClienteList } from "@/components/clientes/ClienteList";
import { ClienteDialog } from "@/components/clientes/ClienteDialog";
import { FiltroClientes } from "@/components/clientes/FiltroClientes";
import { ClientesMetrics } from "@/components/clientes/ClientesMetrics";
import { UnidadesTab } from "@/components/clientes/UnidadesTab";
import { ContratosRascunhoTab } from "@/components/contratos/ContratosRascunhoTab";
import { ContratosDrEscalaTab } from "@/components/contratos/ContratosDrEscalaTab";
import { ContratosDrOportunidadeTab } from "@/components/contratos/ContratosDrOportunidadeTab";
import { usePermissions } from "@/hooks/usePermissions";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { addDays, isAfter, isBefore } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";

export default function Contratos() {
  const { canView, isAdmin } = usePermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContrato, setEditingContrato] = useState<any>(null);
  const [dialogMode, setDialogMode] = useState<'view' | 'edit'>('edit');
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("contratos");
  const [searchNome, setSearchNome] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedUf, setSelectedUf] = useState<string[]>([]);
  const [searchContratos, setSearchContratos] = useState("");
  const [selectedStatusContratos, setSelectedStatusContratos] = useState<string[]>([]);
  const [cardFilterContratos, setCardFilterContratos] = useState<string | null>(null);
  const [cardFilterClientes, setCardFilterClientes] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Verificar permissão de visualização
  if (!isAdmin && !canView('contratos')) {
    return (
      <AppLayout>
        <Alert variant="destructive" className="m-8">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para acessar este módulo. Entre em contato com o administrador.
          </AlertDescription>
        </Alert>
        <Navigate to="/" replace />
      </AppLayout>
    );
  }

  const { data: contratos, isLoading: loadingContratos } = useQuery({
    queryKey: ['contratos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          cliente:clientes(id, nome_fantasia, razao_social, cnpj, endereco, estado, nome_unidade, especialidade_cliente, email_contato, telefone_contato, email_financeiro, telefone_financeiro),
          unidades(id, nome, codigo),
          medico:medicos(nome_completo),
          contrato_anexos(id, arquivo_nome, arquivo_url),
          contrato_aditivos_tempo(id, data_inicio, data_termino, prazo_meses, observacoes)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: clientes, isLoading: loadingClientes } = useQuery({
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

  const deleteContratoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contratos')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contratos'] });
      toast.success('Contrato excluído com sucesso');
    },
    onError: () => {
      toast.error('Erro ao excluir contrato');
    },
  });

  const deleteClienteMutation = useMutation({
    mutationFn: async (id: string) => {
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
    onError: () => {
      toast.error('Erro ao excluir cliente');
    },
  });

  const handleEditContrato = (contrato: any) => {
    setEditingContrato(contrato);
    setDialogMode('edit');
    setDialogOpen(true);
  };

  const handleViewContrato = (contrato: any) => {
    setEditingContrato(contrato);
    setDialogMode('view');
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingContrato(null);
      setDialogMode('edit');
    }
  };

  const handleDeleteContrato = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este contrato?')) {
      deleteContratoMutation.mutate(id);
    }
  };

  const handleEditCliente = (cliente: any) => {
    setEditingCliente(cliente);
    setClienteDialogOpen(true);
  };

  const handleDeleteCliente = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
      deleteClienteMutation.mutate(id);
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
    setCardFilterClientes(null);
  };

  const handleStatusContratosToggle = (status: string) => {
    setSelectedStatusContratos(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleClearContratosFilters = () => {
    setSearchContratos("");
    setSelectedStatusContratos([]);
    setCardFilterContratos(null);
  };

  const handleCardFilterContratos = (filter: string) => {
    setCardFilterContratos(filter || null);
    if (filter) {
      setSelectedStatusContratos([]);
      setSearchContratos("");
    }
  };

  const handleCardFilterClientes = (filter: string) => {
    setCardFilterClientes(filter || null);
    if (filter) {
      setSelectedStatus([]);
      setSearchNome("");
    }
  };

  // Filtra clientes baseado em cards e filtros manuais
  const filteredClientes = useMemo(() => {
    if (!clientes) return [];
    const hoje = new Date();
    const em30Dias = addDays(hoje, 30);

    // Função auxiliar para obter a data efetiva de término (considerando aditivos)
    const getDataEfetivaTermino = (contrato: any): Date | null => {
      if (contrato.contrato_aditivos_tempo && contrato.contrato_aditivos_tempo.length > 0) {
        const ultimoAditivo = contrato.contrato_aditivos_tempo.reduce((max: any, aditivo: any) => {
          const dataAditivo = parseLocalDate(aditivo.data_termino);
          const dataMax = parseLocalDate(max.data_termino);
          if (!dataAditivo) return max;
          if (!dataMax) return aditivo;
          return dataAditivo > dataMax ? aditivo : max;
        });
        return parseLocalDate(ultimoAditivo.data_termino);
      }
      return parseLocalDate(contrato.data_termino) || parseLocalDate(contrato.data_fim);
    };

    // IDs de clientes com contrato vigente (status_contrato = 'Ativo')
    const clientesComContratoVigente = new Set(
      (contratos || [])
        .filter(c => c.status_contrato === 'Ativo')
        .map(c => c.cliente_id)
        .filter(Boolean)
    );

    // IDs de clientes com contratos a vencer
    const clientesContratoAVencer = new Set(
      (contratos || [])
        .filter(c => {
          if (c.status_contrato !== 'Ativo') return false;
          const dataFim = getDataEfetivaTermino(c);
          if (!dataFim) return false;
          return isAfter(dataFim, hoje) && isBefore(dataFim, em30Dias);
        })
        .map(c => c.cliente_id)
        .filter(Boolean)
    );
    
    return clientes.filter((cliente) => {
      // Filtro por card
      if (cardFilterClientes) {
        switch (cardFilterClientes) {
          case 'ativos':
            if (cliente.status_cliente !== 'Ativo' && cliente.status_cliente !== null) return false;
            break;
          case 'inativos':
            if (cliente.status_cliente !== 'Inativo') return false;
            break;
          case 'com_contrato':
            if (!clientesComContratoVigente.has(cliente.id)) return false;
            break;
          case 'sem_contrato':
            if (clientesComContratoVigente.has(cliente.id)) return false;
            break;
          case 'contrato_a_vencer':
            if (!clientesContratoAVencer.has(cliente.id)) return false;
            break;
        }
      }

      const matchesNome = searchNome === "" || 
        cliente.nome_fantasia?.toLowerCase().includes(searchNome.toLowerCase()) ||
        cliente.razao_social?.toLowerCase().includes(searchNome.toLowerCase());
      
      const matchesStatus = selectedStatus.length === 0 || 
        selectedStatus.some(status => {
          if (status === 'Ativo') return cliente.status_cliente === 'Ativo' || cliente.status_cliente === null;
          return cliente.status_cliente === status;
        });
      
      const matchesUf = selectedUf.length === 0 || 
        (cliente.uf && selectedUf.includes(cliente.uf)) ||
        (cliente.estado && selectedUf.includes(cliente.estado));
      
      return matchesNome && matchesStatus && matchesUf;
    });
  }, [clientes, contratos, searchNome, selectedStatus, selectedUf, cardFilterClientes]);

  // Filtra contratos baseado em cards e filtros manuais
  const filteredContratos = useMemo(() => {
    if (!contratos) return [];
    const hoje = new Date();
    const em30Dias = addDays(hoje, 30);

    // Função auxiliar para obter a data efetiva de término (considerando aditivos)
    const getDataEfetivaTermino = (contrato: any): Date | null => {
      if (contrato.contrato_aditivos_tempo && contrato.contrato_aditivos_tempo.length > 0) {
        const ultimoAditivo = contrato.contrato_aditivos_tempo.reduce((max: any, aditivo: any) => {
          const dataAditivo = parseLocalDate(aditivo.data_termino);
          const dataMax = parseLocalDate(max.data_termino);
          if (!dataAditivo) return max;
          if (!dataMax) return aditivo;
          return dataAditivo > dataMax ? aditivo : max;
        });
        return parseLocalDate(ultimoAditivo.data_termino);
      }
      return parseLocalDate(contrato.data_termino) || parseLocalDate(contrato.data_fim);
    };
    
    return contratos.filter((contrato) => {
      // Filtro por card
      if (cardFilterContratos) {
        switch (cardFilterContratos) {
          case 'ativos':
            if (contrato.status_contrato !== 'Ativo') return false;
            break;
          case 'inativos':
            if (contrato.status_contrato !== 'Inativo' && contrato.status_contrato !== 'Encerrado') return false;
            break;
          case 'a_vencer': {
            if (contrato.status_contrato !== 'Ativo') return false;
            const dataFimVencer = getDataEfetivaTermino(contrato);
            if (!dataFimVencer || !(isAfter(dataFimVencer, hoje) && isBefore(dataFimVencer, em30Dias))) return false;
            break;
          }
          case 'vencidos': {
            if (contrato.status_contrato !== 'Ativo') return false;
            const dataFimVencido = getDataEfetivaTermino(contrato);
            if (!dataFimVencido || !isBefore(dataFimVencido, hoje)) return false;
            break;
          }
          case 'pendentes':
            if (contrato.status_contrato !== 'Pendente' && contrato.assinado !== 'Pendente') return false;
            break;
          case 'sem_anexo':
            if (contrato.status_contrato !== 'Ativo') return false;
            if (contrato.contrato_anexos && contrato.contrato_anexos.length > 0) return false;
            break;
        }
      }

      if (searchContratos === "" && selectedStatusContratos.length === 0) {
        return true;
      }

      if (searchContratos !== "") {
        const searchTerm = searchContratos.trim();
        const searchLower = searchTerm.toLowerCase();
        const isNumericSearch = /^\d+$/.test(searchTerm);
        
        let matchesSearch = false;
        
        if (isNumericSearch) {
          const codigoStr = contrato.codigo_interno?.toString() || '';
          matchesSearch = codigoStr === searchTerm || codigoStr.startsWith(searchTerm);
        } else {
          const matchesCodigoContrato = contrato.codigo_contrato?.toLowerCase().includes(searchLower);
          const matchesCliente = contrato.cliente?.nome_fantasia?.toLowerCase().includes(searchLower) ||
            contrato.cliente?.razao_social?.toLowerCase().includes(searchLower);
          const matchesMedico = contrato.medico?.nome_completo?.toLowerCase().includes(searchLower);
          
          matchesSearch = matchesCodigoContrato || matchesCliente || matchesMedico;
        }
        
        if (!matchesSearch) return false;
      }
      
      const matchesStatus = selectedStatusContratos.length === 0 || 
        selectedStatusContratos.includes(contrato.assinado);
      
      return matchesStatus;
    });
  }, [contratos, searchContratos, selectedStatusContratos, cardFilterContratos]);

  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [unidadesDialogOpen, setUnidadesDialogOpen] = useState(false);

  const handleManageUnidades = (cliente: any) => {
    setSelectedCliente(cliente);
    setUnidadesDialogOpen(true);
  };

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Clientes e Contratos</h1>
        <p className="text-sm text-muted-foreground">Gerencie clientes, unidades e contratos de forma integrada</p>
      </div>
      {activeTab === "contratos" && (
        <Button onClick={() => {
          setEditingContrato(null);
          setDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Contrato
        </Button>
      )}
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4">

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="contratos">Contratos</TabsTrigger>
            <TabsTrigger value="dr-escala">Dr. Escala</TabsTrigger>
            <TabsTrigger value="dr-oportunidade">Dr. Oportunidade</TabsTrigger>
            <TabsTrigger value="rascunhos">Rascunhos (Licitações)</TabsTrigger>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
          </TabsList>

          <TabsContent value="contratos" className="mt-6">
            <ContratosMetrics 
              contratos={contratos || []}
              onFilterClick={handleCardFilterContratos}
              activeFilter={cardFilterContratos}
            />
            <div className="flex justify-between items-center mb-4">
              <FiltroContratos
                searchTerm={searchContratos}
                selectedStatus={selectedStatusContratos}
                onSearchChange={(val) => {
                  setSearchContratos(val);
                  if (val) setCardFilterContratos(null);
                }}
                onStatusToggle={(status) => {
                  handleStatusContratosToggle(status);
                  setCardFilterContratos(null);
                }}
                onClearFilters={handleClearContratosFilters}
              />
              <Button 
                variant="outline"
                onClick={() => exportContratosToPDF(filteredContratos, filteredContratos.length)}
              >
                <FileDown className="mr-2 h-4 w-4" />
                Exportar PDF
              </Button>
            </div>
            <ContratoList
              contratos={filteredContratos}
              isLoading={loadingContratos}
              onEdit={handleEditContrato}
              onView={handleViewContrato}
              onDelete={handleDeleteContrato}
            />
          </TabsContent>

          <TabsContent value="dr-escala" className="mt-6">
            <ContratosDrEscalaTab />
          </TabsContent>

          <TabsContent value="dr-oportunidade" className="mt-6">
            <ContratosDrOportunidadeTab />
          </TabsContent>

          <TabsContent value="rascunhos" className="mt-6">
            <ContratosRascunhoTab 
              onConsolidado={(contratoId) => {
                queryClient.invalidateQueries({ queryKey: ['contratos'] });
                setActiveTab("contratos");
                toast.success("Contrato consolidado! Redirecionando...");
              }}
            />
          </TabsContent>

          <TabsContent value="clientes" className="mt-6">
            <ClientesMetrics
              clientes={clientes || []}
              contratos={contratos || []}
              onFilterClick={handleCardFilterClientes}
              activeFilter={cardFilterClientes}
            />
            <div className="flex justify-end mb-4">
              <Button 
                variant="outline"
                onClick={() => exportClientesToPDF(filteredClientes, filteredClientes.length)}
              >
                <FileDown className="mr-2 h-4 w-4" />
                Exportar PDF
              </Button>
            </div>
            <FiltroClientes
              searchNome={searchNome}
              selectedStatus={selectedStatus}
              selectedUf={selectedUf}
              onSearchChange={(val) => {
                setSearchNome(val);
                if (val) setCardFilterClientes(null);
              }}
              onStatusToggle={(status) => {
                handleStatusToggle(status);
                setCardFilterClientes(null);
              }}
              onUfToggle={handleUfToggle}
              onClearFilters={handleClearFilters}
            />
            <ClienteList
              clientes={filteredClientes}
              isLoading={loadingClientes}
              onEdit={handleEditCliente}
              onDelete={handleDeleteCliente}
              onManageUnidades={handleManageUnidades}
            />
          </TabsContent>
        </Tabs>

        <ContratoDialogWithClient
          open={dialogOpen}
          onOpenChange={handleDialogChange}
          contrato={editingContrato}
          mode={dialogMode}
        />

        <ClienteDialog
          open={clienteDialogOpen}
          onOpenChange={(open) => {
            setClienteDialogOpen(open);
            if (!open) setEditingCliente(null);
          }}
          cliente={editingCliente}
        />

        {selectedCliente && (
          <Dialog open={unidadesDialogOpen} onOpenChange={setUnidadesDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <UnidadesTab 
                clienteId={selectedCliente.id} 
                clienteNome={selectedCliente.nome_fantasia}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AppLayout>
  );
}
