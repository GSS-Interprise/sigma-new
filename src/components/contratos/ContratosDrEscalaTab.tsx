import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ContratoList } from "./ContratoList";
import { FiltroContratos } from "./FiltroContratos";
import { ContratosMetrics } from "./ContratosMetrics";
import { ContratoDialogWithClient } from "./ContratoDialogWithClient";
import { addDays, isAfter, isBefore } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";

const TABLE_CONFIG = {
  contratos: 'contratos_dr_escala',
  contrato_itens: 'contrato_itens_dr_escala',
  contrato_renovacoes: 'contrato_renovacoes_dr_escala',
  contrato_aditivos_tempo: 'contrato_aditivos_tempo_dr_escala',
  contrato_anexos: 'contrato_anexos_dr_escala',
  queryKey: 'contratos-dr-escala',
  storageBucket: 'contratos-documentos',
};

export function ContratosDrEscalaTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContrato, setEditingContrato] = useState<any>(null);
  const [dialogMode, setDialogMode] = useState<'view' | 'edit'>('edit');
  const [searchContratos, setSearchContratos] = useState("");
  const [selectedStatusContratos, setSelectedStatusContratos] = useState<string[]>([]);
  const [cardFilterContratos, setCardFilterContratos] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: contratos, isLoading } = useQuery({
    queryKey: ['contratos-dr-escala'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contratos_dr_escala')
        .select(`
          *,
          cliente:clientes(id, nome_fantasia, razao_social, cnpj, endereco, estado, nome_unidade, especialidade_cliente, email_contato, telefone_contato, email_financeiro, telefone_financeiro),
          unidades(id, nome, codigo),
          medico:medicos(nome_completo),
          contrato_anexos_dr_escala(id, arquivo_nome, arquivo_url),
          contrato_aditivos_tempo_dr_escala(id, data_inicio, data_termino, prazo_meses, observacoes)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Map to match existing contract structure
      return data?.map(c => ({
        ...c,
        contrato_anexos: c.contrato_anexos_dr_escala,
        contrato_aditivos_tempo: c.contrato_aditivos_tempo_dr_escala,
      }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contratos_dr_escala')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contratos-dr-escala'] });
      toast.success('Contrato excluído com sucesso');
    },
    onError: () => {
      toast.error('Erro ao excluir contrato');
    },
  });

  const handleEdit = (contrato: any) => {
    setEditingContrato(contrato);
    setDialogMode('edit');
    setDialogOpen(true);
  };

  const handleView = (contrato: any) => {
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

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este contrato?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleStatusToggle = (status: string) => {
    setSelectedStatusContratos(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleClearFilters = () => {
    setSearchContratos("");
    setSelectedStatusContratos([]);
    setCardFilterContratos(null);
  };

  const handleCardFilter = (filter: string) => {
    setCardFilterContratos(filter || null);
    if (filter) {
      setSelectedStatusContratos([]);
      setSearchContratos("");
    }
  };

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

  const filteredContratos = useMemo(() => {
    if (!contratos) return [];
    const hoje = new Date();
    const em30Dias = addDays(hoje, 30);
    
    return contratos.filter((contrato) => {
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => {
          setEditingContrato(null);
          setDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Contrato Dr. Escala
        </Button>
      </div>

      <ContratosMetrics 
        contratos={contratos || []}
        onFilterClick={handleCardFilter}
        activeFilter={cardFilterContratos}
      />

      <div className="flex justify-between items-center">
        <FiltroContratos
          searchTerm={searchContratos}
          selectedStatus={selectedStatusContratos}
          onSearchChange={(val) => {
            setSearchContratos(val);
            if (val) setCardFilterContratos(null);
          }}
          onStatusToggle={(status) => {
            handleStatusToggle(status);
            setCardFilterContratos(null);
          }}
          onClearFilters={handleClearFilters}
        />
      </div>

      <ContratoList
        contratos={filteredContratos}
        isLoading={isLoading}
        onEdit={handleEdit}
        onView={handleView}
        onDelete={handleDelete}
      />

      <ContratoDialogWithClient
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        contrato={editingContrato}
        mode={dialogMode}
        tableConfig={TABLE_CONFIG}
        dialogTitle="Contrato Dr. Escala"
        allowCustomTipoContratacao={true}
        tipoContratacaoCampoNome="tipo_contratacao_dr_escala"
      />
    </div>
  );
}
