import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Upload, FileDown, ArrowUpDown, Pencil, Ban } from "lucide-react";
import { toast } from "sonner";
import { exportMedicosToPDF } from "@/lib/pdfExport";
import { MedicoDialog } from "./MedicoDialog";
import { LeadProntuarioDialog } from "./LeadProntuarioDialog";
import { ImportarMedicosDialog } from "./ImportarMedicosDialog";
import { FiltroMedicos } from "./FiltroMedicos";
import { MedicosMetrics } from "./MedicosMetrics";
import { useAuth } from "@/contexts/AuthContext";
import { subDays, isAfter, parseISO } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPhoneForDisplay } from "@/lib/phoneUtils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SortField = 'nome_completo' | 'especialidade' | 'status_contrato' | 'telefone';
type SortDirection = 'asc' | 'desc';

type MedicoComClientes = {
  id: string;
  nome_completo: string;
  especialidade: string[];
  status_contrato: string | null;
  phone_e164: string | null;
  status_medico: string;
  status_documentacao?: string;
  unidades_vinculadas?: Array<{ id: string; cliente_nome: string; unidade_nome: string; unidade_codigo?: string }>;
  created_at?: string;
  [key: string]: any;
};

export function CorpoClinicoTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClientes, setSelectedClientes] = useState<string[]>([]);
  const [selectedEspecialidades, setSelectedEspecialidades] = useState<string[]>([]);
  const [medicoDialogOpen, setMedicoDialogOpen] = useState(false);
  const [prontuarioDialogOpen, setProntuarioDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedMedico, setSelectedMedico] = useState<any>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [activeMetricFilters, setActiveMetricFilters] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useQuery({
    queryKey: ['user-role', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id)
        .eq('role', 'admin')
        .maybeSingle();
      setIsAdmin(!!data);
      return data;
    },
  });

  const { data: medicos, isLoading } = useQuery<MedicoComClientes[]>({
    queryKey: ['corpo-clinico'],
    queryFn: async () => {
      const DATA_CORTE = new Date('2025-12-17T00:00:00');
      
      // 1. Buscar TODOS os médicos e cards do kanban em paralelo
      const [medicosResult, kanbanResult] = await Promise.all([
        supabase.from('medicos').select('*').order('created_at', { ascending: false }),
        supabase.from('medico_kanban_cards').select('medico_id').not('medico_id', 'is', null)
      ]);
      
      if (medicosResult.error) throw medicosResult.error;
      if (!medicosResult.data) return [] as MedicoComClientes[];
      
      const medicosNoKanban = new Set(kanbanResult.data?.map(c => c.medico_id) || []);
      
      // 1.5 Buscar status dos leads vinculados para verificar desconversões
      const allLeadIds = medicosResult.data.map(m => m.lead_id).filter(Boolean) as string[];
      const leadsStatusResult = allLeadIds.length > 0
        ? await supabase.from('leads').select('id, status').in('id', allLeadIds)
        : { data: [], error: null };
      
      const leadsStatusMap = new Map<string, string>();
      leadsStatusResult.data?.forEach(l => leadsStatusMap.set(l.id, l.status));
      
      // 2. Filtrar médicos aprovados ou legados (excluindo desconvertidos)
      const medicosFiltrados = medicosResult.data.filter(medico => {
        // Se tem lead_id e o lead NÃO está convertido, excluir do corpo clínico
        if (medico.lead_id) {
          const leadStatus = leadsStatusMap.get(medico.lead_id);
          if (leadStatus && leadStatus !== 'Convertido') {
            return false; // Lead foi desconvertido
          }
        }
        
        const isApproved = medico.aprovacao_contrato_assinado === true && 
                          medico.aprovacao_documentacao_unidade === true && 
                          medico.aprovacao_cadastro_unidade === true;
        const createdAt = new Date(medico.created_at);
        const isLegacy = createdAt < DATA_CORTE && !medicosNoKanban.has(medico.id);
        return isApproved || isLegacy;
      });
      
      // 3. Coletar todos os lead_ids e medico_ids para buscar em batch
      const leadIds = medicosFiltrados.map(m => m.lead_id).filter(Boolean) as string[];
      const medicoIds = medicosFiltrados.map(m => m.id);
      
      // 4. Buscar leads e vínculos em paralelo (uma query para cada)
      const [leadsResult, vinculosResult] = await Promise.all([
        leadIds.length > 0 
          ? supabase.from('leads').select('id, unidades_vinculadas, status_contrato, especialidades').in('id', leadIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('medico_vinculo_unidade')
          .select('medico_id, unidade_id, unidades!inner(id, nome, codigo, clientes!inner(nome_fantasia))')
          .in('medico_id', medicoIds)
          .eq('status', 'ativo')
      ]);
      
      // 5. Coletar todas as unidades_vinculadas dos leads para buscar detalhes
      const allUnidadeIds = new Set<string>();
      const leadsMap = new Map<string, { unidades_vinculadas: string[]; status_contrato: string | null; especialidades: string[] }>();
      
      leadsResult.data?.forEach(lead => {
        leadsMap.set(lead.id, { 
          unidades_vinculadas: lead.unidades_vinculadas || [], 
          status_contrato: lead.status_contrato,
          especialidades: lead.especialidades || []
        });
        lead.unidades_vinculadas?.forEach((uid: string) => allUnidadeIds.add(uid));
      });
      
      // 6. Buscar detalhes das unidades em batch
      const unidadesResult = allUnidadeIds.size > 0
        ? await supabase.from('unidades')
            .select('id, nome, codigo, clientes!inner(nome_fantasia)')
            .in('id', Array.from(allUnidadeIds))
        : { data: [], error: null };
      
      const unidadesMap = new Map<string, { id: string; nome: string; codigo?: string; cliente_nome: string }>();
      unidadesResult.data?.forEach(u => {
        unidadesMap.set(u.id, {
          id: u.id,
          nome: u.nome,
          codigo: u.codigo || undefined,
          cliente_nome: u.clientes?.nome_fantasia || ''
        });
      });
      
      // 7. Mapear vínculos por médico
      const vinculosPorMedico = new Map<string, Array<{ id: string; cliente_nome: string; unidade_nome: string; unidade_codigo?: string }>>();
      vinculosResult.data?.forEach(v => {
        if (!vinculosPorMedico.has(v.medico_id)) {
          vinculosPorMedico.set(v.medico_id, []);
        }
        vinculosPorMedico.get(v.medico_id)!.push({
          id: v.unidades.id,
          cliente_nome: v.unidades.clientes?.nome_fantasia || '',
          unidade_nome: v.unidades.nome,
          unidade_codigo: v.unidades.codigo || undefined,
        });
      });
      
      // 8. Montar resultado final sem queries adicionais
      return medicosFiltrados.map(medico => {
        let unidades_vinculadas: Array<{ id: string; cliente_nome: string; unidade_nome: string; unidade_codigo?: string }> = [];
        let status_contrato_final = medico.status_contrato;
        let especialidade_final = medico.especialidade || [];
        
        // Verificar se tem dados do lead
        if (medico.lead_id && leadsMap.has(medico.lead_id)) {
          const leadData = leadsMap.get(medico.lead_id)!;
          if (leadData.status_contrato) {
            status_contrato_final = leadData.status_contrato;
          }
          // Usar especialidades do lead se o médico não tiver ou estiver vazio
          if (leadData.especialidades && leadData.especialidades.length > 0) {
            especialidade_final = leadData.especialidades;
          }
          unidades_vinculadas = leadData.unidades_vinculadas
            .map(uid => unidadesMap.get(uid))
            .filter(Boolean)
            .map(u => ({
              id: u!.id,
              cliente_nome: u!.cliente_nome,
              unidade_nome: u!.nome,
              unidade_codigo: u!.codigo,
            }));
        }
        
        // Se não encontrou via lead, usar vínculos legados
        if (unidades_vinculadas.length === 0) {
          unidades_vinculadas = vinculosPorMedico.get(medico.id) || [];
        }
        
        return {
          ...medico,
          especialidade: especialidade_final,
          status_contrato: status_contrato_final,
          unidades_vinculadas
        } as MedicoComClientes;
      });
    },
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome_fantasia')
        .eq('status_cliente', 'Ativo')
        .order('nome_fantasia');
      
      if (error) throw error;
      return data;
    },
  });

  // Extrair especialidades únicas dos médicos
  const especialidadesDisponiveis = useMemo(() => {
    if (!medicos) return [];
    const allEspecialidades = medicos
      .flatMap((m) => m.especialidade || [])
      .filter(esp => esp && esp.trim() !== '');
    return Array.from(new Set(allEspecialidades)).sort();
  }, [medicos]);

  const addToBlacklistMutation = useMutation({
    mutationFn: async ({ medicoId, phone, nome }: { medicoId: string; phone: string; nome: string }) => {
      const reason = prompt('Motivo para adicionar à blacklist:');
      if (!reason) throw new Error('Motivo obrigatório');
      
      const { error } = await supabase
        .from('blacklist')
        .insert({
          phone_e164: phone,
          nome,
          origem: 'clinico',
          reason,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
      toast.success('Médico adicionado à blacklist');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao adicionar à blacklist');
    },
  });

  const filteredMedicos = useMemo(() => {
    if (!medicos) return [];
    
    let result = medicos.filter((medico) => {
      // Filtro por múltiplos campos (nome, CPF, CRM, email, telefone, especialidade)
      const searchLower = searchTerm.toLowerCase();
      
      const especialidadesArray = Array.isArray(medico.especialidade) ? medico.especialidade : [];
      const especialidadesStr = especialidadesArray.join(' ').toLowerCase();
      
      const crm = medico.crm?.toLowerCase() || '';
      const cpf = medico.cpf?.toLowerCase() || '';
      const email = medico.email?.toLowerCase() || '';
      const telefone = medico.phone_e164?.toLowerCase() || '';
      const telefoneFormatado = medico.phone_e164 ? formatPhoneForDisplay(medico.phone_e164).toLowerCase() : '';
      
      const matchesSearch = 
        medico.nome_completo?.toLowerCase().includes(searchLower) ||
        especialidadesStr.includes(searchLower) ||
        crm.includes(searchLower) ||
        cpf.includes(searchLower) ||
        email.includes(searchLower) ||
        telefone.includes(searchLower) ||
        telefoneFormatado.includes(searchLower);
      
      // Filtro por especialidade
      const medicoEspecialidades = Array.isArray(medico.especialidade) ? medico.especialidade : [];
      const matchesEspecialidade = selectedEspecialidades.length === 0 ||
        medicoEspecialidades.some(esp => selectedEspecialidades.includes(esp));
      
      // Filtro por cliente vinculado
      const matchesCliente = selectedClientes.length === 0 || 
        (medico.alocado_cliente_id && 
         Array.isArray(medico.alocado_cliente_id) &&
         medico.alocado_cliente_id.some(clienteId => selectedClientes.includes(clienteId)));
      
      return matchesSearch && matchesEspecialidade && matchesCliente;
    });

    // Aplicar filtros de métricas (múltiplos filtros combinados)
    if (activeMetricFilters.length > 0) {
      const hoje = new Date();
      const trintaDiasAtras = subDays(hoje, 30);

      result = result.filter((medico) => {
        // O médico deve atender a TODOS os filtros selecionados
        return activeMetricFilters.every((filter) => {
          switch (filter) {
            case 'ativos':
              return medico.status_medico?.toLowerCase() === 'ativo' && 
                     medico.status_contrato?.toLowerCase() === 'ativo';
            case 'inativos':
              return medico.status_medico?.toLowerCase() === 'inativo';
            case 'sem_contrato':
              return !medico.status_contrato || medico.status_contrato.toLowerCase() !== 'ativo';
            case 'doc_pendente':
              return medico.status_documentacao?.toLowerCase() === 'pendente';
            case 'sem_unidade':
              return !medico.unidades_vinculadas || medico.unidades_vinculadas.length === 0;
            case 'novos':
              if (!medico.created_at) return false;
              try {
                return isAfter(parseISO(medico.created_at), trintaDiasAtras);
              } catch {
                return false;
              }
            default:
              return true;
          }
        });
      });
    }

    return result;
  }, [medicos, searchTerm, selectedEspecialidades, selectedClientes, activeMetricFilters]);

  const handleEspecialidadeToggle = (especialidade: string) => {
    setSelectedEspecialidades(prev =>
      prev.includes(especialidade) ? prev.filter(e => e !== especialidade) : [...prev, especialidade]
    );
  };

  const handleClienteToggle = (clienteId: string) => {
    setSelectedClientes(prev =>
      prev.includes(clienteId) ? prev.filter(c => c !== clienteId) : [...prev, clienteId]
    );
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedClientes([]);
    setSelectedEspecialidades([]);
    setActiveMetricFilters([]);
  };

  const handleMetricFilterClick = (filter: string) => {
    setActiveMetricFilters(prev =>
      prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]
    );
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedMedicos = useMemo(() => {
    if (!sortField) return filteredMedicos;

    return [...filteredMedicos].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortField === 'nome_completo') {
        aValue = a.nome_completo || '';
        bValue = b.nome_completo || '';
      } else if (sortField === 'especialidade') {
        aValue = Array.isArray(a.especialidade) ? a.especialidade.join(', ') : a.especialidade || '';
        bValue = Array.isArray(b.especialidade) ? b.especialidade.join(', ') : b.especialidade || '';
      } else if (sortField === 'status_contrato') {
        aValue = a.status_contrato || '';
        bValue = b.status_contrato || '';
      } else if (sortField === 'telefone') {
        aValue = a.phone_e164 || '';
        bValue = b.phone_e164 || '';
      }

      const comparison = aValue.toString().localeCompare(bValue.toString(), 'pt-BR');
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredMedicos, sortField, sortDirection]);

  return (
    <div className="space-y-4">
      {/* Cards de Métricas */}
      <MedicosMetrics
        medicos={medicos || []}
        onFilterClick={handleMetricFilterClick}
        activeFilters={activeMetricFilters}
      />

      <FiltroMedicos
        searchNome={searchTerm}
        selectedClientes={selectedClientes}
        selectedEspecialidades={selectedEspecialidades}
        clientes={clientes}
        especialidades={especialidadesDisponiveis}
        onSearchChange={setSearchTerm}
        onClienteToggle={handleClienteToggle}
        onEspecialidadeToggle={handleEspecialidadeToggle}
        onClearFilters={handleClearFilters}
      />

      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => exportMedicosToPDF(filteredMedicos, filteredMedicos.length)}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar Excel
            </Button>
          )}
          <Button onClick={() => {
            setSelectedLeadId(null);
            setProntuarioDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Médico
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('nome_completo')}
                  className="h-8 gap-1 font-semibold"
                >
                  Nome
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('especialidade')}
                  className="h-8 gap-1 font-semibold"
                >
                  Especialidade
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Unidades Vinculadas</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('status_contrato')}
                  className="h-8 gap-1 font-semibold"
                >
                  Status Contrato
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('telefone')}
                  className="h-8 gap-1 font-semibold"
                >
                  Telefone
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : sortedMedicos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Nenhum médico encontrado
                </TableCell>
              </TableRow>
            ) : (
              sortedMedicos.map((medico) => (
                <TableRow key={medico.id}>
                  <TableCell className="font-medium">
                    {medico.nome_completo}
                  </TableCell>
                  <TableCell>
                    {Array.isArray(medico.especialidade) 
                      ? medico.especialidade.join(', ') 
                      : medico.especialidade || '-'}
                  </TableCell>
                  <TableCell>
                    {medico.unidades_vinculadas && medico.unidades_vinculadas.length > 0
                      ? medico.unidades_vinculadas.map((u: any) => {
                          const codigo = u.unidade_codigo ? `${u.unidade_codigo} - ` : '';
                          return `${u.cliente_nome} - ${codigo}${u.unidade_nome}`;
                        }).join(', ')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {medico.status_contrato ? (() => {
                      const status = medico.status_contrato.toLowerCase();
                      let badgeClass = '';
                      if (status === 'ativo') {
                        badgeClass = 'bg-primary text-primary-foreground';
                      } else if (status === 'inativo') {
                        badgeClass = 'bg-foreground text-background';
                      } else if (status === 'cancelado') {
                        badgeClass = 'bg-destructive text-destructive-foreground';
                      } else if (status === 'pendente') {
                        badgeClass = 'bg-warning text-warning-foreground';
                      }
                      return (
                        <Badge className={badgeClass}>
                          {medico.status_contrato.charAt(0).toUpperCase() + medico.status_contrato.slice(1).toLowerCase()}
                        </Badge>
                      );
                    })() : (
                      <span className="text-muted-foreground text-sm">Não definido</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {medico.phone_e164 ? formatPhoneForDisplay(medico.phone_e164) : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <TooltipProvider>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                // If medico has lead_id, open LeadProntuarioDialog
                                if (medico.lead_id) {
                                  setSelectedLeadId(medico.lead_id);
                                  setProntuarioDialogOpen(true);
                                } else {
                                  // Legacy medicos without lead_id use MedicoDialog
                                  setSelectedMedico(medico);
                                  setMedicoDialogOpen(true);
                                }
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar médico</TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => addToBlacklistMutation.mutate({
                                medicoId: medico.id,
                                phone: medico.phone_e164,
                                nome: medico.nome_completo
                              })}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Adicionar à blacklist</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <MedicoDialog
        open={medicoDialogOpen}
        onOpenChange={setMedicoDialogOpen}
        medico={selectedMedico}
        onOpenProntuario={(leadId) => {
          setSelectedLeadId(leadId);
          setProntuarioDialogOpen(true);
        }}
      />

      <LeadProntuarioDialog
        open={prontuarioDialogOpen}
        onOpenChange={setProntuarioDialogOpen}
        leadId={selectedLeadId}
        isNewLead={selectedLeadId === null}
        createAsCorpoClinico={selectedLeadId === null}
      />

      <ImportarMedicosDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
          setImportDialogOpen(false);
        }}
      />
    </div>
  );
}
