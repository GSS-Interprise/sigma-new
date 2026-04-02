import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FormControl } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface UnidadeSelectProps {
  clienteId: string | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /**
   * Quando true, filtra unidades para mostrar apenas aquelas com contratos
   * que NÃO estejam 'Inativo' ou 'Suspenso'. Útil para novos vínculos.
   * Quando false ou quando value já está preenchido (edição), mostra todas.
   * Default: false
   */
  onlyAvailable?: boolean;
}

interface UnidadeWithStatus {
  id: string;
  nome: string;
  codigo: string | null;
  cliente_id: string;
  status_contrato?: string | null;
  has_active_contract?: boolean;
}

export function UnidadeSelect({ clienteId, value, onChange, disabled, onlyAvailable = false }: UnidadeSelectProps) {
  const { data: unidades, isLoading } = useQuery({
    queryKey: ['unidades-with-status', clienteId, onlyAvailable],
    queryFn: async () => {
      if (!clienteId) return [];
      
      // Buscar todas as unidades do cliente
      const { data: unidadesData, error: unidadesError } = await supabase
        .from('unidades')
        .select('id, nome, codigo, cliente_id')
        .eq('cliente_id', clienteId)
        .order('nome');
      
      if (unidadesError) throw unidadesError;
      if (!unidadesData) return [];

      // Buscar contratos das unidades para verificar status
      const { data: contratosData } = await supabase
        .from('contratos')
        .select('unidade_id, status_contrato')
        .eq('cliente_id', clienteId);

      // Mapear status por unidade
      const unidadesComStatus: UnidadeWithStatus[] = unidadesData.map(unidade => {
        const contratosUnidade = contratosData?.filter(c => c.unidade_id === unidade.id) || [];
        
        // Verificar se tem algum contrato que NÃO seja Inativo/Suspenso
        const hasActiveContract = contratosUnidade.some(
          c => c.status_contrato && !['Inativo', 'Suspenso'].includes(c.status_contrato)
        );
        
        // Pegar o status do contrato principal (primeiro não-inativo, ou o primeiro)
        const contratoAtivo = contratosUnidade.find(
          c => c.status_contrato && !['Inativo', 'Suspenso'].includes(c.status_contrato)
        );
        const status = contratoAtivo?.status_contrato || contratosUnidade[0]?.status_contrato || null;
        
        return {
          ...unidade,
          status_contrato: status,
          has_active_contract: hasActiveContract,
        };
      });

      // Se onlyAvailable = true, filtrar apenas unidades disponíveis
      // Mas sempre incluir a unidade atual (value) para edição
      if (onlyAvailable) {
        return unidadesComStatus.filter(u => u.has_active_contract || u.id === value);
      }

      return unidadesComStatus;
    },
    enabled: !!clienteId,
  });

  if (!clienteId) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Selecione um cliente primeiro" />
        </SelectTrigger>
      </Select>
    );
  }

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Carregando unidades..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (!unidades || unidades.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder={onlyAvailable ? "Nenhuma unidade disponível" : "Nenhuma unidade cadastrada"} />
        </SelectTrigger>
      </Select>
    );
  }

  const getStatusBadge = (unidade: UnidadeWithStatus) => {
    if (!unidade.status_contrato) return null;
    
    const status = unidade.status_contrato;
    
    if (status === 'Ativo') {
      return <Badge variant="outline" className="ml-2 text-xs bg-green-50 text-green-700 border-green-200">Ativo</Badge>;
    }
    if (['Em Renovação', 'Em Processo de Renovação', 'Pre-Contrato'].includes(status)) {
      return <Badge variant="outline" className="ml-2 text-xs bg-amber-50 text-amber-700 border-amber-200">{status}</Badge>;
    }
    if (['Inativo', 'Suspenso'].includes(status)) {
      return <Badge variant="outline" className="ml-2 text-xs bg-red-50 text-red-700 border-red-200">{status}</Badge>;
    }
    return null;
  };

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder="Selecione a unidade" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {unidades.map((unidade) => (
          <SelectItem key={unidade.id} value={unidade.id}>
            <div className="flex items-center">
              <span>{unidade.codigo ? `${unidade.codigo} - ${unidade.nome}` : unidade.nome}</span>
              {getStatusBadge(unidade)}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}