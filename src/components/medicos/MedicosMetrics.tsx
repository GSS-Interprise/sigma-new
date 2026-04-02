import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { 
  UserCheck, 
  UserX, 
  FileX2, 
  FileQuestion, 
  Building2, 
  UserPlus 
} from "lucide-react";
import { subDays, isAfter, parseISO } from "date-fns";

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

interface MedicosMetricsProps {
  medicos: MedicoComClientes[];
  onFilterClick: (filter: string) => void;
  activeFilters: string[];
}

// Helper para verificar se médico atende um filtro específico
const matchesFilter = (medico: MedicoComClientes, filter: string, trintaDiasAtras: Date): boolean => {
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
};

export function MedicosMetrics({ medicos, onFilterClick, activeFilters }: MedicosMetricsProps) {
  const metrics = useMemo(() => {
    const hoje = new Date();
    const trintaDiasAtras = subDays(hoje, 30);

    // Primeiro filtra pelos filtros ativos (exceto o próprio)
    const getFilteredCount = (targetFilter: string) => {
      // Filtros ativos exceto o alvo
      const otherFilters = activeFilters.filter(f => f !== targetFilter);
      
      // Primeiro aplica todos os outros filtros ativos
      let baseList = medicos;
      if (otherFilters.length > 0) {
        baseList = medicos.filter(m => 
          otherFilters.every(f => matchesFilter(m, f, trintaDiasAtras))
        );
      }
      
      // Depois conta quantos da lista base atendem o filtro alvo
      return baseList.filter(m => matchesFilter(m, targetFilter, trintaDiasAtras)).length;
    };

    return {
      ativos: getFilteredCount('ativos'),
      inativos: getFilteredCount('inativos'),
      semContrato: getFilteredCount('sem_contrato'),
      docPendente: getFilteredCount('doc_pendente'),
      semUnidade: getFilteredCount('sem_unidade'),
      novos: getFilteredCount('novos'),
    };
  }, [medicos, activeFilters]);

  const cards = [
    {
      id: 'ativos',
      label: 'Médicos Ativos',
      value: metrics.ativos,
      icon: UserCheck,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      activeBg: 'bg-emerald-100',
    },
    {
      id: 'inativos',
      label: 'Médicos Inativos',
      value: metrics.inativos,
      icon: UserX,
      color: 'text-slate-600',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
      activeBg: 'bg-slate-100',
    },
    {
      id: 'sem_contrato',
      label: 'Sem Contrato Ativo',
      value: metrics.semContrato,
      icon: FileX2,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      activeBg: 'bg-red-100',
    },
    {
      id: 'doc_pendente',
      label: 'Doc. Pendente',
      value: metrics.docPendente,
      icon: FileQuestion,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      activeBg: 'bg-orange-100',
    },
    {
      id: 'sem_unidade',
      label: 'Sem Unidade',
      value: metrics.semUnidade,
      icon: Building2,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      activeBg: 'bg-purple-100',
    },
    {
      id: 'novos',
      label: 'Novos (30 dias)',
      value: metrics.novos,
      icon: UserPlus,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      activeBg: 'bg-blue-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = activeFilters.includes(card.id);
        
        return (
          <Card
            key={card.id}
            className={`p-4 cursor-pointer transition-all duration-200 hover:shadow-md border-2 ${
              isActive 
                ? `${card.activeBg} ${card.borderColor} ring-2 ring-offset-1`
                : `${card.bgColor} border-transparent hover:${card.borderColor}`
            }`}
            onClick={() => onFilterClick(card.id)}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground truncate">{card.label}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
