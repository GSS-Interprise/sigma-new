import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const LEADS_PAGE_SIZE = 50;

interface UseLeadsPaginatedParams {
  page: number;
  searchTerm: string;
  statusFilter: string | null;
  origemFilter: string | null;
  ufFilter: string | null;
  cidadeFilter: string | null;
  especialidadeFilter: string | null;
  sortField: string | null;
  sortDirection: 'asc' | 'desc' | null;
  dataInicio: string | null;
  dataFim: string | null;
  anoFormaturaMin: number | null;
  enrichStatus: string | null;
}

export function useLeadsPaginated({
  page,
  searchTerm,
  statusFilter,
  origemFilter,
  ufFilter,
  cidadeFilter,
  especialidadeFilter,
  sortField,
  sortDirection,
  dataInicio,
  dataFim,
  anoFormaturaMin,
  enrichStatus,
}: UseLeadsPaginatedParams) {
  return useQuery({
    queryKey: [
      'leads-paginated',
      page,
      searchTerm,
      statusFilter,
      origemFilter,
      ufFilter,
      cidadeFilter,
      especialidadeFilter,
      sortField,
      sortDirection,
      dataInicio,
      dataFim,
      anoFormaturaMin,
      enrichStatus,
    ],
    queryFn: async () => {
      const from = page * LEADS_PAGE_SIZE;
      const to = from + LEADS_PAGE_SIZE - 1;

      let query = supabase
        .from('leads')
        .select('*, especialidades_ref:especialidades!leads_especialidade_id_fkey(id, nome)', { count: 'exact' });

      // Aplicar filtro de busca
      if (searchTerm.trim().length >= 2) {
        const searchClean = searchTerm.replace(/\D/g, '');

        // Gera o CPF formatado (XXX.XXX.XXX-XX) a partir dos dígitos limpos
        const formatCPF = (digits: string) => {
          if (digits.length === 11) {
            return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`;
          }
          return null;
        };

        // Busca CPF com: termo original, dígitos limpos E versão formatada reconstruída
        const cpfFormatado = searchClean.length >= 3 ? formatCPF(searchClean) : null;
        const cpfTerms = new Set([searchTerm]);
        if (searchClean.length >= 3) cpfTerms.add(searchClean);
        if (cpfFormatado) cpfTerms.add(cpfFormatado);

        const cpfFilters = Array.from(cpfTerms)
          .map(t => `cpf.ilike.%${t}%`)
          .join(',');

        query = query.or(
          `nome.ilike.%${searchTerm}%,especialidade.ilike.%${searchTerm}%,phone_e164.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,${cpfFilters}`
        );
      }

      // Aplicar filtros de coluna
      if (statusFilter && statusFilter !== 'Blacklist') {
        query = query.eq('status', statusFilter);
      }
      if (origemFilter) {
        query = query.eq('origem', origemFilter);
      }
      if (ufFilter) {
        query = query.ilike('uf', ufFilter);
      }
      if (cidadeFilter) {
        query = query.ilike('cidade', cidadeFilter);
      }
      if (especialidadeFilter) {
        query = query.eq('especialidade_id', especialidadeFilter);
      }
      if (dataInicio) {
        query = query.gte('created_at', `${dataInicio}T00:00:00`);
      }
      if (dataFim) {
        query = query.lte('created_at', `${dataFim}T23:59:59`);
      }
      if (anoFormaturaMin) {
        query = query.gte('data_formatura', `${anoFormaturaMin}-01-01`);
      }
      if (enrichStatus) {
        if (enrichStatus === 'enriquecido') {
          query = query.in('api_enrich_status', ['concluido', 'alimentado']);
        } else if (enrichStatus === 'erro') {
          query = query.eq('api_enrich_status', 'erro');
        } else if (enrichStatus === 'pendente') {
          query = query.eq('api_enrich_status', 'pendente');
        } else if (enrichStatus === 'sem') {
          query = query.is('api_enrich_status', null);
        }
      }

      if (sortField && sortDirection) {
        query = query.order(sortField, { ascending: sortDirection === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Aplicar paginação
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        leads: data || [],
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / LEADS_PAGE_SIZE),
        currentPage: page,
      };
    },
    placeholderData: (previousData) => previousData,
  });
}

// Hook otimizado - usa RPC server-side com GROUP BY (1 única query)
export function useLeadsFilterCounts(enabled: boolean = true) {
  return useQuery({
    queryKey: ['leads-filter-counts-v4'],
    queryFn: async () => {
      console.log("🔄 Buscando filtros de leads (RPC server-side)...");

      const [countResult, especialidadesResult, filterCountsResult] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('especialidades').select('id, nome').eq('ativo', true).order('nome'),
        supabase.rpc('get_leads_filter_counts'),
      ]);

      const especialidades = especialidadesResult.data || [];
      const especialidadeOptions = especialidades.map(e => e.nome);
      const filterCounts = filterCountsResult.data as any || {};

      const processFieldCounts = (field: string) => {
        const raw = filterCounts[field] || {};
        const options: string[] = Object.keys(raw).sort();
        const counts: Record<string, number> = {};
        options.forEach(key => {
          counts[key.toUpperCase()] = Number(raw[key]);
        });
        return { options, counts };
      };

      const statusData = processFieldCounts('status');
      const origemData = processFieldCounts('origem');
      const ufData = processFieldCounts('uf');
      const cidadeData = processFieldCounts('cidade');

      const idToNome = new Map(especialidades.map(e => [e.id, e.nome]));
      const especialidadeCounts: Record<string, number> = {};
      const espRaw = filterCounts.especialidade || {};
      Object.entries(espRaw).forEach(([id, cnt]) => {
        const nome = idToNome.get(id);
        if (nome) {
          especialidadeCounts[nome] = (especialidadeCounts[nome] || 0) + Number(cnt);
        }
      });

      return {
        totalLeads: countResult.count || 0,
        especialidades,
        options: {
          status: statusData.options.sort(),
          origem: origemData.options.sort(),
          uf: ufData.options.sort(),
          cidade: cidadeData.options.sort((a, b) => a.toUpperCase().localeCompare(b.toUpperCase())),
          especialidade: especialidadeOptions,
        },
        counts: {
          status: statusData.counts,
          origem: origemData.counts,
          uf: ufData.counts,
          cidade: cidadeData.counts,
          especialidade: especialidadeCounts,
        },
      };
    },
    enabled,
    staleTime: 30000,
    gcTime: 60000,
    refetchOnWindowFocus: false,
  });
}
