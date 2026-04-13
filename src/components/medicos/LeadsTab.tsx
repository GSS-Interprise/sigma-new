import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Search, Plus, Eye, ChevronDown, Check, ArrowUpAZ, ArrowDownAZ, Calendar, X } from "lucide-react";
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
import { formatPhoneForDisplay } from "@/lib/phoneUtils";
import { ImportarLeadsDialog } from "./ImportarLeadsDialog";
import { LeadProntuarioDialog } from "./LeadProntuarioDialog";
import { CpfGateDialog } from "./CpfGateDialog";
import { LeadsTablePagination } from "./LeadsTablePagination";
import { cn } from "@/lib/utils";
import { useLeadsPaginated, useLeadsFilterCounts, LEADS_PAGE_SIZE } from "@/hooks/useLeadsPaginated";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { data: blacklistPhones = [] } = useQuery({
    queryKey: ['blacklist-phones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blacklist')
        .select('phone_e164');
      
      if (error) throw error;
      return data?.map(b => b.phone_e164) || [];
    },
  });

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
      toast.success('Lead excluído com sucesso');
    },
    onError: () => {
      toast.error('Erro ao excluir lead');
    },
  });

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
                              (lead as any).lead_enrichments?.[0]?.status || (lead as any).api_enrich_status
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
    </div>
  );
}
