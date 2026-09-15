import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Search, Plus, Eye, ChevronDown, Check, ArrowUpAZ, ArrowDownAZ, Calendar, X, Ban, Trash2, GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPhoneForDisplay } from "@/lib/phoneUtils";
import { ImportarLeadsDialog } from "./ImportarLeadsDialog";
import { LeadProntuarioDialog } from "./LeadProntuarioDialog";
import { CpfGateDialog } from "./CpfGateDialog";
import { LeadsTablePagination } from "./LeadsTablePagination";
import { cn } from "@/lib/utils";
import { useLeadsPaginated, useLeadsFilterCounts, LEADS_PAGE_SIZE } from "@/hooks/useLeadsPaginated";
import { Skeleton } from "@/components/ui/skeleton";
import { useCaptacaoPermissions } from "@/hooks/useCaptacaoPermissions";

// Status color mapping for consistent display
const getStatusColor = (status: string, isBlacklisted: boolean = false) => {
  if (isBlacklisted) {
    return 'bg-black/5 text-red-600 border-[3px] border-black font-semibold';
  }
  switch (status) {
    case 'Novo': return 'bg-blue-600 text-white border-blue-700';
    case 'Qualificado': return 'bg-purple-600 text-white border-purple-700';
    case 'Acompanhamento': return 'bg-amber-500 text-white border-amber-600';
    case 'Em Resposta': return 'bg-cyan-600 text-white border-cyan-700';
    case 'Proposta Enviada': return 'bg-indigo-600 text-white border-indigo-700';
    case 'Proposta Aceita': return 'bg-emerald-600 text-white border-emerald-700';
    case 'Convertido': return 'bg-green-700 text-white border-green-800';
    case 'Descartado': return 'bg-red-600 text-white border-red-700';
    default: return '';
  }
};

// Enrich status tag
const EnrichStatusBadge = ({ status }: { status: string | null }) => {
  if (!status) return null;
  switch (status) {
    case 'pendente':
      return <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-slate-500 text-white border-slate-600">Pendente</Badge>;
    case 'concluido':
    case 'alimentado':
      return <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-amber-500 text-white border-amber-600 shadow-[0_0_6px_rgba(245,158,11,0.3)]">Enriquecido</Badge>;
    case 'erro':
      return <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-red-500 text-white border-red-600">Não encontrado</Badge>;
    default:
      return null;
  }
};

type LeadMergeCandidate = {
  id: string;
  nome: string | null;
  phone_e164: string | null;
  cpf: string | null;
  chave_unica: string | null;
  uf: string | null;
  cidade: string | null;
  status: string | null;
  especialidade: string | null;
  created_at: string | null;
  matchScore: number;
};

type LeadMergeSource = Pick<LeadMergeCandidate, 'id' | 'nome' | 'phone_e164' | 'cpf' | 'chave_unica'>;

const getSupabaseErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("code" in error)) return "";
  return String((error as { code?: unknown }).code ?? "");
};

const normalizeDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

const escapeIlikeLiteral = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export function LeadsTab() {
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [prontuarioOpen, setProntuarioOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isNewLead, setIsNewLead] = useState(false);
  const [cpfGateOpen, setCpfGateOpen] = useState(false);
  const [initialCpf, setInitialCpf] = useState<string | undefined>(undefined);
  const [initialCnpj, setInitialCnpj] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();

  // Filtros de coluna
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [origemFilter, setOrigemFilter] = useState<string | null>(null);
  const [ufFilter, setUfFilter] = useState<string | null>(null);
  const [cidadeFilter, setCidadeFilter] = useState<string | null>(null);
  const [especialidadeFilter, setEspecialidadeFilter] = useState<string | null>(null); // agora é especialidade_id
  const [dataInicio, setDataInicio] = useState<string | null>(null);
  const [dataFim, setDataFim] = useState<string | null>(null);
  const [anoFormaturaMin, setAnoFormaturaMin] = useState<number | null>(null);
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null);
  const { hasCaptacaoPermission } = useCaptacaoPermissions();
  const canManageLeads = hasCaptacaoPermission('leads');
  const canManageBlacklist = hasCaptacaoPermission('blacklist');

  // Exclusão física falha quando o lead já tem histórico, conversas ou outros
  // vínculos. Nessa situação abrimos um seletor para preservar o registro
  // canônico e mesclar o duplicado com rastreabilidade.
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSourceLead, setMergeSourceLead] = useState<LeadMergeSource | null>(null);
  const [mergeCandidates, setMergeCandidates] = useState<LeadMergeCandidate[]>([]);
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string | null>(null);
  const [isFindingMergeCandidates, setIsFindingMergeCandidates] = useState(false);

  // Ordenação
  type SortConfig = { field: string; direction: 'asc' | 'desc' } | null;
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  // Debounce do search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0); // Reset para primeira página ao buscar
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset página quando filtros mudam
  useEffect(() => {
    setPage(0);
  }, [statusFilter, origemFilter, ufFilter, cidadeFilter, especialidadeFilter, sortConfig, dataInicio, dataFim, anoFormaturaMin, enrichStatus]);

  // Limpar cidade quando UF muda
  useEffect(() => {
    setCidadeFilter(null);
  }, [ufFilter]);

  // Query principal com paginação - carrega rápido apenas 50 registros
  const { data: paginatedData, isLoading, isFetching } = useLeadsPaginated({
    page,
    searchTerm: debouncedSearch,
    statusFilter,
    origemFilter,
    ufFilter,
    cidadeFilter,
    especialidadeFilter,
    sortField: sortConfig?.field || null,
    sortDirection: sortConfig?.direction || null,
    dataInicio,
    dataFim,
    anoFormaturaMin,
    enrichStatus,
  });

  // Query para opções de filtro - carrega em background, não bloqueia
  const { data: filterData } = useLeadsFilterCounts(true);

  // Buscar telefones da blacklist para verificação
  const { data: blacklistEntries = [] } = useQuery({
    queryKey: ['blacklist-phones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blacklist')
        .select('id, phone_e164');
      
      if (error) throw error;
      return data || [];
    },
  });
  const blacklistPhones = blacklistEntries.map((entry) => entry.phone_e164);

  // Função para verificar se lead está na blacklist
  const isLeadBlacklisted = (phone: string | null) => {
    if (!phone) return false;
    return blacklistPhones.includes(phone);
  };

  const converterMutation = useMutation({
    mutationFn: async (lead: any) => {
      const { data: emailResposta } = await supabase
        .from('email_respostas')
        .select('id')
        .eq('remetente_email', lead.email)
        .single();
      
      if (emailResposta) {
        throw new Error('Este lead veio de uma resposta de email e já está sendo gerenciado no Acompanhamento. Não é necessário converter.');
      }
      
      const { data: existingMedico } = await supabase
        .from('medicos')
        .select('id')
        .eq('phone_e164', lead.phone_e164)
        .single();
      
      if (existingMedico) {
        const { error: updateError } = await supabase
          .from('medicos')
          .update({ lead_id: lead.id })
          .eq('id', existingMedico.id);
        
        if (updateError) throw updateError;
      } else {
        const especialidadesArray = (lead as any).especialidades || 
          (lead.especialidade ? [lead.especialidade] : []);
        
        const { error: insertError } = await supabase
          .from('medicos')
          .insert({
            nome_completo: lead.nome,
            especialidade: especialidadesArray,
            phone_e164: lead.phone_e164,
            estado: lead.uf,
            lead_id: lead.id,
            email: lead.email || `temp_${lead.phone_e164}@example.com`,
            telefone: lead.phone_e164,
            crm: lead.crm || 'PENDENTE',
          });
        
        if (insertError) throw insertError;
      }
      
      const { error: leadError } = await supabase
        .from('leads')
        .update({ status: 'Convertido' })
        .eq('id', lead.id);
      
      if (leadError) throw leadError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
      toast.success('Lead convertido em médico com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao converter lead');
    },
  });

  const addToBlacklistMutation = useMutation({
    mutationFn: async ({ leadId, phone, nome }: { leadId: string; phone: string; nome: string }) => {
      const reason = prompt('Motivo para adicionar à blacklist:');
      if (!reason) throw new Error('Motivo obrigatório');
      
      const { error } = await supabase
        .from('blacklist')
        .insert({
          phone_e164: phone,
          nome,
          origem: 'lead',
          reason,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
      queryClient.invalidateQueries({ queryKey: ['blacklist-phones'] });
      toast.success('Lead adicionado à blacklist');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao adicionar à blacklist');
    },
  });

  const removeFromBlacklistMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('blacklist')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
      queryClient.invalidateQueries({ queryKey: ['black-list'] });
      queryClient.invalidateQueries({ queryKey: ['blacklist-phones'] });
      toast.success('Lead removido da blacklist');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover da blacklist');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts-v4'] });
      toast.success('Lead excluído com sucesso');
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ canonicalId, duplicateId }: { canonicalId: string; duplicateId: string }) => {
      // O wrapper valida a permissão no banco e chama a rotina transacional de
      // merge. Assim a UI não precisa mover histórico tabela por tabela.
      const { data, error } = await supabase.rpc('merge_lead_cluster_for_captacao', {
        p_canonical_id: canonicalId,
        p_duplicate_id: duplicateId,
        p_batch_tag: 'manual_ui',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setMergeDialogOpen(false);
      setMergeSourceLead(null);
      setMergeCandidates([]);
      setSelectedCanonicalId(null);
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts-v4'] });
      queryClient.invalidateQueries({ queryKey: ['lead-historico'] });
      toast.success('Duplicado mesclado e removido da lista. O histórico foi preservado no registro canônico.');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao mesclar lead duplicado');
    },
  });

  const findMergeCandidates = async (source: LeadMergeSource) => {
    setMergeSourceLead(source);
    setMergeCandidates([]);
    setSelectedCanonicalId(null);
    setMergeDialogOpen(true);
    setIsFindingMergeCandidates(true);

    try {
      const select = 'id, nome, phone_e164, cpf, chave_unica, uf, cidade, status, especialidade, created_at';
      const baseQuery = () => supabase
        .from('leads')
        .select(select)
        .neq('id', source.id)
        .is('merged_into_id', null)
        .limit(50);
      const queries: PromiseLike<{ data: Omit<LeadMergeCandidate, 'matchScore'>[] | null; error: { message: string } | null }>[] = [];

      if (source.phone_e164) {
        queries.push(baseQuery().eq('phone_e164', source.phone_e164));
      }

      const cpf = String(source.cpf ?? '').trim();
      if (cpf) {
        const cpfDigits = normalizeDigits(cpf);
        const variants = [...new Set([cpf, cpfDigits].filter(Boolean))];
        queries.push(baseQuery().in('cpf', variants));
      }

      const chaveUnica = String(source.chave_unica ?? '').trim();
      if (chaveUnica) {
        queries.push(baseQuery().eq('chave_unica', chaveUnica));
      }

      if (source.nome) {
        // Sem curingas: ilike continua case-insensitive, mas não amplia para
        // nomes apenas parecidos. A decisão final sempre fica com a pessoa.
        queries.push(baseQuery().ilike('nome', escapeIlikeLiteral(String(source.nome).trim())));
      }

      const responses = await Promise.all(queries);
      const byId = new Map<string, LeadMergeCandidate>();
      const sourcePhone = normalizeDigits(source.phone_e164);
      const sourceCpf = normalizeDigits(source.cpf);
      const sourceName = normalizeName(source.nome);
      const sourceKey = String(source.chave_unica ?? '').trim();

      responses.forEach(({ data, error }) => {
        if (error) throw error;
        (data ?? []).forEach((candidate: Omit<LeadMergeCandidate, 'matchScore'>) => {
          const score =
            (sourcePhone && sourcePhone === normalizeDigits(candidate.phone_e164) ? 100 : 0) +
            (sourceCpf && sourceCpf === normalizeDigits(candidate.cpf) ? 100 : 0) +
            (sourceKey && sourceKey === String(candidate.chave_unica ?? '').trim() ? 90 : 0) +
            (sourceName && sourceName === normalizeName(candidate.nome) ? 20 : 0);
          const existing = byId.get(candidate.id);
          if (!existing || score > existing.matchScore) {
            byId.set(candidate.id, { ...candidate, matchScore: score });
          }
        });
      });

      const candidates = [...byId.values()].sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
      });
      setMergeCandidates(candidates);
      setSelectedCanonicalId(candidates[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível localizar os possíveis duplicados');
    } finally {
      setIsFindingMergeCandidates(false);
    }
  };

  const handleDeleteLead = async (lead: LeadMergeSource) => {
    if (!window.confirm(`Excluir o lead ${lead.nome}? Se ele possuir histórico, você poderá mesclá-lo a outro registro.`)) return;

    try {
      await deleteMutation.mutateAsync(lead.id);
    } catch (error) {
      if (getSupabaseErrorCode(error) === '23503') {
        await findMergeCandidates(lead);
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir lead');
    }
  };

  const normalizeKey = (value: string) => value.trim().toUpperCase();

  // Componente de cabeçalho com filtro e busca interna
  const FilterableHeader = ({ 
    label, 
    field, 
    options, 
    counts,
    currentFilter, 
    onFilterChange 
  }: { 
    label: string; 
    field: string;
    options: string[]; 
    counts: Record<string, number>;
    currentFilter: string | null; 
    onFilterChange: (value: string | null) => void;
  }) => {
    const [dropdownSearch, setDropdownSearch] = useState("");
    const filteredOptions = options.filter(o => 
      o.toLowerCase().includes(dropdownSearch.toLowerCase())
    );
    return (
      <DropdownMenu onOpenChange={() => setDropdownSearch("")}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn(
              "h-8 px-2 -ml-2 font-medium",
              currentFilter && "text-primary"
            )}
          >
            {label}
            {currentFilter && <span className="ml-1 text-xs">({currentFilter})</span>}
            <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 bg-popover z-50">
          <DropdownMenuItem 
            onClick={() => setSortConfig({ field, direction: 'asc' })}
            className="gap-2"
          >
            <ArrowUpAZ className="h-4 w-4" />
            Ordenar A-Z
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => setSortConfig({ field, direction: 'desc' })}
            className="gap-2"
          >
            <ArrowDownAZ className="h-4 w-4" />
            Ordenar Z-A
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {options.length > 8 && (
            <div className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
              <Input
                placeholder="Buscar..."
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
                className="h-7 text-xs"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-[50vh] overflow-y-auto">
            <DropdownMenuItem 
              onClick={() => onFilterChange(null)}
              className={cn("gap-2", !currentFilter && "bg-primary text-primary-foreground")}
            >
              {!currentFilter && <Check className="h-4 w-4" />}
              <span className={!currentFilter ? "" : "ml-6"}>Todos</span>
            </DropdownMenuItem>
            {filteredOptions.map(option => (
              <DropdownMenuItem 
                key={option}
                onClick={() => onFilterChange(option)}
                className="justify-between"
              >
                <div className="flex items-center gap-2">
                  {currentFilter === option && <Check className="h-4 w-4" />}
                  <span className={currentFilter === option ? "" : "ml-6"}>{option}</span>
                </div>
                <span className="text-muted-foreground text-xs">({counts[normalizeKey(option)] || counts[option] || 0})</span>
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const leads = paginatedData?.leads || [];
  const totalCount = paginatedData?.totalCount || 0;
  const totalPages = paginatedData?.totalPages || 0;

  const filterOptions = filterData?.options || { status: [], origem: [], uf: [], cidade: [], especialidade: [] };
  const filterCounts = filterData?.counts || { status: {}, origem: {}, uf: {}, cidade: {}, especialidade: {} };
  const especialidadesMap = filterData?.especialidades || [];

  // Cidades filtradas por UF selecionada
  const { data: cidadesDoUf } = useQuery({
    queryKey: ['leads-cidades-by-uf', ufFilter],
    queryFn: async () => {
      if (!ufFilter) return null;
      const { data } = await supabase
        .from('leads')
        .select('cidade')
        .ilike('uf', ufFilter)
        .not('cidade', 'is', null);
      const unique = [...new Set((data || []).map(d => d.cidade).filter(Boolean))] as string[];
      return unique.sort((a, b) => a.localeCompare(b));
    },
    enabled: !!ufFilter,
    staleTime: 30000,
  });

  const cidadeOptions = ufFilter ? (cidadesDoUf || []) : filterOptions.cidade;

  const hasActiveFilters = statusFilter || origemFilter || ufFilter || cidadeFilter || especialidadeFilter || dataInicio || dataFim || anoFormaturaMin || enrichStatus;

  // Loading skeleton - apenas 10 linhas para carregar rápido
  const TableSkeleton = () => (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-36" /></TableCell>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        </TableRow>
      ))}
    </>
  );

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, especialidade ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {filterData && (
            <span className="text-sm text-muted-foreground">
              {filterData.totalLeads.toLocaleString('pt-BR')} leads no total
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Importar Excel
          </Button>
          <Button onClick={() => setCpfGateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Lead
          </Button>
        </div>
      </div>

      {/* Filtros de data e avançados */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">De:</span>
          <Input
            type="date"
            value={dataInicio || ''}
            onChange={(e) => setDataInicio(e.target.value || null)}
            className="h-8 w-[150px] text-xs"
          />
          <span className="text-sm text-muted-foreground">Até:</span>
          <Input
            type="date"
            value={dataFim || ''}
            onChange={(e) => setDataFim(e.target.value || null)}
            className="h-8 w-[150px] text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Formatura a partir de:</span>
          <Input
            type="number"
            placeholder="Ex: 2020"
            min={1950}
            max={2030}
            value={anoFormaturaMin || ''}
            onChange={(e) => setAnoFormaturaMin(e.target.value ? Number(e.target.value) : null)}
            className="h-8 w-[100px] text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Enriquecimento:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-8 text-xs", enrichStatus && "text-primary border-primary")}>
                {enrichStatus === 'enriquecido' ? 'Enriquecido' : enrichStatus === 'erro' ? 'Não encontrado' : enrichStatus === 'pendente' ? 'Pendente' : enrichStatus === 'sem' ? 'Sem enriquecimento' : 'Todos'}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setEnrichStatus(null)} className={cn(!enrichStatus && "bg-primary text-primary-foreground")}>Todos</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEnrichStatus('enriquecido')}>Enriquecido</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEnrichStatus('pendente')}>Pendente</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEnrichStatus('erro')}>Não encontrado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEnrichStatus('sem')}>Sem enriquecimento</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setStatusFilter(null);
              setOrigemFilter(null);
              setUfFilter(null);
              setCidadeFilter(null);
              setEspecialidadeFilter(null);
              setDataInicio(null);
              setDataFim(null);
              setAnoFormaturaMin(null);
              setEnrichStatus(null);
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="rounded-md border flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="overflow-auto flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>
                  <FilterableHeader 
                    label="Especialidade" 
                    field="especialidade"
                    options={filterOptions.especialidade} 
                    counts={filterCounts.especialidade}
                    currentFilter={especialidadeFilter ? (especialidadesMap.find(e => e.id === especialidadeFilter)?.nome || especialidadeFilter) : null} 
                    onFilterChange={(value) => {
                      if (!value) {
                        setEspecialidadeFilter(null);
                      } else {
                        const esp = especialidadesMap.find(e => e.nome === value);
                        setEspecialidadeFilter(esp?.id || null);
                      }
                    }} 
                  />
                </TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>
                  <FilterableHeader 
                    label="UF" 
                    field="uf"
                    options={filterOptions.uf} 
                    counts={filterCounts.uf}
                    currentFilter={ufFilter} 
                    onFilterChange={setUfFilter} 
                  />
                </TableHead>
                <TableHead>
                  <FilterableHeader 
                    label="Cidade" 
                    field="cidade"
                    options={cidadeOptions} 
                    counts={filterCounts.cidade}
                    currentFilter={cidadeFilter} 
                    onFilterChange={setCidadeFilter} 
                  />
                </TableHead>
                <TableHead>
                  <FilterableHeader 
                    label="Origem" 
                    field="origem"
                    options={filterOptions.origem} 
                    counts={filterCounts.origem}
                    currentFilter={origemFilter} 
                    onFilterChange={setOrigemFilter} 
                  />
                </TableHead>
                <TableHead>
                  <FilterableHeader 
                    label="Status" 
                    field="status"
                    options={filterOptions.status} 
                    counts={filterCounts.status}
                    currentFilter={statusFilter} 
                    onFilterChange={setStatusFilter} 
                  />
                </TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    Nenhum lead encontrado
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => {
                  const isBlacklisted = isLeadBlacklisted(lead.phone_e164);
                  const blacklistEntry = blacklistEntries.find((entry) => entry.phone_e164 === lead.phone_e164);
                  return (
                  <TableRow 
                    key={lead.id} 
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      isBlacklisted && 'border-2 border-black',
                      isFetching && 'opacity-60'
                    )}
                    onClick={() => {
                      setSelectedLeadId(lead.id);
                      setIsNewLead(false);
                      setProntuarioOpen(true);
                    }}
                  >
                    <TableCell className={`font-medium ${isBlacklisted ? 'text-destructive' : ''}`}>{lead.nome}</TableCell>
                    <TableCell className={isBlacklisted ? 'text-destructive' : ''}>{(lead as any).especialidades_ref?.nome || lead.especialidade || '-'}</TableCell>
                    <TableCell className={isBlacklisted ? 'text-destructive' : ''}>
                      {formatPhoneForDisplay(lead.phone_e164)}
                    </TableCell>
                    <TableCell className={isBlacklisted ? 'text-destructive' : ''}>{(lead as any).email || '-'}</TableCell>
                    <TableCell className={isBlacklisted ? 'text-destructive' : ''}>{lead.uf || '-'}</TableCell>
                    <TableCell className={isBlacklisted ? 'text-destructive' : ''}>{lead.cidade || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={isBlacklisted ? 'text-destructive' : ''}>{lead.origem || 'manual'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {isLeadBlacklisted(lead.phone_e164) ? (
                          <Badge variant="outline" className={getStatusColor('', true)}>
                            Blacklist
                          </Badge>
                        ) : (
                          <>
                            <Badge variant="outline" className={getStatusColor(lead.status || '', false)}>
                              {lead.status || 'Novo'}
                            </Badge>
                            <EnrichStatusBadge status={
                              (lead as any).lead_enrichments?.[0]?.status
                            } />
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedLeadId(lead.id);
                            setIsNewLead(false);
                            setProntuarioOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Ações
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedLeadId(lead.id);
                                setIsNewLead(false);
                                setProntuarioOpen(true);
                              }}
                            >
                              Ver prontuário
                            </DropdownMenuItem>
                            {canManageBlacklist && !isBlacklisted && lead.phone_e164 && (
                              <DropdownMenuItem
                                onClick={() => addToBlacklistMutation.mutate({
                                  leadId: lead.id,
                                  phone: lead.phone_e164,
                                  nome: lead.nome,
                                })}
                                className="gap-2"
                              >
                                <Ban className="h-4 w-4" />
                                Adicionar à blacklist
                              </DropdownMenuItem>
                            )}
                            {canManageBlacklist && isBlacklisted && blacklistEntry && (
                              <DropdownMenuItem
                                onClick={() => {
                                  if (window.confirm(`Remover ${lead.nome} da blacklist?`)) {
                                    removeFromBlacklistMutation.mutate({ id: blacklistEntry.id });
                                  }
                                }}
                                className="gap-2"
                              >
                                <Ban className="h-4 w-4" />
                                Remover da blacklist
                              </DropdownMenuItem>
                            )}
                            {canManageLeads && (
                              <DropdownMenuItem
                                onClick={() => { void handleDeleteLead(lead); }}
                                className="gap-2 text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                                Excluir lead
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )})
              )}
            </TableBody>
          </Table>
        </div>

        <LeadsTablePagination
          currentPage={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      </div>

      <ImportarLeadsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
          queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
        }}
      />

      <CpfGateDialog
        open={cpfGateOpen}
        onOpenChange={setCpfGateOpen}
        onLeadFound={(leadId) => {
          setSelectedLeadId(leadId);
          setIsNewLead(false);
          setInitialCpf(undefined);
          setInitialCnpj(undefined);
          setProntuarioOpen(true);
        }}
        onNewLead={(result) => {
          setSelectedLeadId(null);
          setIsNewLead(true);
          if (result.type === "cnpj") {
            setInitialCpf(undefined);
            setInitialCnpj(result.value);
          } else {
            setInitialCpf(result.value);
            setInitialCnpj(undefined);
          }
          setProntuarioOpen(true);
        }}
      />

      <LeadProntuarioDialog
        open={prontuarioOpen}
        onOpenChange={(open) => {
          setProntuarioOpen(open);
          if (!open) {
            setIsNewLead(false);
            setInitialCpf(undefined);
            setInitialCnpj(undefined);
          }
        }}
        leadId={selectedLeadId}
        isNewLead={isNewLead}
        initialCpf={initialCpf}
        initialCnpj={initialCnpj}
      />

      <Dialog
        open={mergeDialogOpen}
        onOpenChange={(open) => {
          if (mergeMutation.isPending) return;
          setMergeDialogOpen(open);
          if (!open) {
            setMergeSourceLead(null);
            setMergeCandidates([]);
            setSelectedCanonicalId(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <GitMerge className="h-5 w-5 text-primary" />
              Lead com vínculos: mesclar duplicado
            </DialogTitle>
            <DialogDescription>
              Este lead tem histórico, conversa ou outro vínculo e não pode ser apagado fisicamente.
              Escolha qual registro deve permanecer; o duplicado será retirado da lista e o histórico será preservado.
            </DialogDescription>
          </DialogHeader>

          {mergeSourceLead && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">Duplicado selecionado: </span>
              {mergeSourceLead.nome || 'Lead sem nome'}
              {mergeSourceLead.phone_e164 && (
                <span className="text-muted-foreground"> · {formatPhoneForDisplay(mergeSourceLead.phone_e164)}</span>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1" aria-live="polite">
            {isFindingMergeCandidates ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Procurando registros correspondentes…
              </div>
            ) : mergeCandidates.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Não encontramos outro registro com os mesmos dados. Para evitar perda de histórico, o Sigma não
                remove este lead sem um registro canônico. Confira o telefone/CPF ou use a aba Monitor para revisar
                a duplicidade.
              </div>
            ) : (
              <>
                <p className="text-sm font-medium">Escolha o registro que deve permanecer:</p>
                {mergeCandidates.map((candidate, index) => {
                  const isSelected = selectedCanonicalId === candidate.id;
                  const isRecommended = index === 0 && candidate.matchScore >= 20;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedCanonicalId(candidate.id)}
                      className={cn(
                        "w-full min-h-16 rounded-md border p-3 text-left transition-colors",
                        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected && "border-primary bg-primary/5 ring-1 ring-primary",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{candidate.nome || 'Lead sem nome'}</span>
                        {isRecommended && (
                          <Badge variant="secondary" className="text-xs">Melhor correspondência</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{candidate.phone_e164 ? formatPhoneForDisplay(candidate.phone_e164) : 'Sem telefone'}</span>
                        <span>{[candidate.cidade, candidate.uf].filter(Boolean).join('/') || 'Local não informado'}</span>
                        <span>{candidate.status || 'Novo'}</span>
                        {candidate.created_at && (
                          <span>
                            Criado em {new Intl.DateTimeFormat('pt-BR').format(new Date(candidate.created_at))}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="min-h-10"
              onClick={() => setMergeDialogOpen(false)}
              disabled={mergeMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              className="min-h-10"
              disabled={!selectedCanonicalId || !mergeSourceLead || mergeMutation.isPending}
              onClick={() => {
                if (!selectedCanonicalId || !mergeSourceLead) return;
                const canonical = mergeCandidates.find((candidate) => candidate.id === selectedCanonicalId);
                if (!canonical) return;
                if (window.confirm(`Manter ${canonical.nome || 'este registro'} e mesclar ${mergeSourceLead.nome || 'o duplicado'}? O histórico será preservado.`)) {
                  mergeMutation.mutate({ canonicalId: canonical.id, duplicateId: mergeSourceLead.id });
                }
              }}
            >
              {mergeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitMerge className="mr-2 h-4 w-4" />
              )}
              Mesclar e remover duplicado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
