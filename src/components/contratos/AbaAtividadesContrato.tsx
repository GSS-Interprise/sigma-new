import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, History, FileText, Edit, Trash2, Plus, User, Building2, FileCheck, Clock, DollarSign, Calendar, MapPin, Tag } from "lucide-react";

interface AbaAtividadesContratoProps {
  contratoId?: string;
}

interface AtividadeLog {
  id: string;
  created_at: string;
  usuario_nome: string;
  acao: string;
  tabela: string;
  campos_alterados: string[] | null;
  dados_antigos: Record<string, any> | null;
  dados_novos: Record<string, any> | null;
  detalhes: string | null;
}

// Mapeamento completo de campos para labels amigáveis
const FIELD_LABELS: Record<string, string> = {
  // Contrato principal
  codigo_contrato: "Código do Contrato",
  codigo_interno: "Código Interno",
  tipo_servico: "Tipo de Serviço",
  objeto_contrato: "Objeto do Contrato",
  data_inicio: "Data de Início",
  data_termino: "Data de Término",
  data_fim: "Data de Fim",
  prazo_meses: "Prazo (meses)",
  condicao_pagamento: "Condição de Pagamento",
  valor_estimado: "Valor Estimado",
  status_contrato: "Status do Contrato",
  assinado: "Status Assinatura",
  motivo_pendente: "Motivo Pendente",
  dias_aviso_vencimento: "Dias Aviso Vencimento",
  tipo_contratacao: "Tipo de Contratação",
  
  // Cliente
  nome_fantasia: "Nome Fantasia",
  razao_social: "Razão Social",
  cnpj: "CNPJ",
  endereco: "Endereço",
  email_contato: "Email de Contato",
  telefone_contato: "Telefone de Contato",
  email_financeiro: "Email Financeiro",
  telefone_financeiro: "Telefone Financeiro",
  estado: "Estado",
  nome_unidade: "Nome da Unidade",
  
  // Relacionamentos - IDs que precisam de resolução
  medico_id: "Médico Associado",
  especialidade_contrato: "Especialidade do Contrato",
  licitacao_origem_id: "Licitação de Origem",
  cliente_id: "Cliente",
  unidade_id: "Unidade",
  
  // Anexos
  arquivo_nome: "Nome do Arquivo",
  arquivo_url: "URL do Arquivo",
  
  // Itens (campos de auditoria agregados)
  item: "Item/Serviço",
  valor_item: "Valor do Item",
  quantidade: "Quantidade",
  quantidade_itens: "Qtd. de Itens",
  itens: "Itens do Contrato",
  
  // Aditivos (campos de auditoria agregados)
  observacoes: "Observações",
  quantidade_aditivos: "Qtd. de Aditivos",
  prazo_total_meses: "Prazo Total (meses)",
  
  // Renovações (campos de auditoria agregados)
  valor: "Valor",
  valor_total: "Valor Total",
  percentual_reajuste: "Percentual de Reajuste",
  data_vigencia: "Data de Vigência",
  quantidade_renovacoes: "Qtd. de Renovações",
};

// Configuração visual por ação
const ACTION_CONFIG: Record<string, { label: string; icon: typeof Edit; color: string; bgColor: string }> = {
  criar: { label: "criou", icon: Plus, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-900/20" },
  editar: { label: "editou", icon: Edit, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-900/20" },
  excluir: { label: "excluiu", icon: Trash2, color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-900/20" },
  anexar: { label: "anexou arquivo", icon: FileText, color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-900/20" },
  remover_anexo: { label: "removeu arquivo", icon: Trash2, color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-900/20" },
};

// Configuração por tabela
const TABLE_CONFIG: Record<string, { label: string; icon: typeof FileText }> = {
  contratos: { label: "Contrato", icon: FileCheck },
  contrato_anexos: { label: "Anexo", icon: FileText },
  contrato_itens: { label: "Item", icon: Tag },
  contrato_aditivos_tempo: { label: "Aditivo", icon: Clock },
  contrato_renovacoes: { label: "Renovação", icon: Calendar },
};

// Campos que são IDs e precisam de resolução de nomes
const ID_FIELDS = ['medico_id', 'especialidade_contrato', 'licitacao_origem_id', 'cliente_id', 'unidade_id'];

// Campos a ignorar na exibição
const CAMPOS_IGNORADOS = ['updated_at', 'created_at', 'id', 'contrato_id', 'usuario_id'];

function formatValue(value: any, field?: string): string {
  if (value === null || value === undefined || value === '') return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "number") {
    // Valores monetários
    if (field && (field.includes('valor') || field === 'valor_estimado' || field === 'valor_item')) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    }
    return value.toString();
  }
  // Datas
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      return format(new Date(value), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return value;
    }
  }
  return String(value);
}

function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function getInitials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0]?.substring(0, 2).toUpperCase() || "??";
}

// Função para obter ícone do campo
function getFieldIcon(field: string) {
  if (field.includes('medico')) return User;
  if (field.includes('cliente') || field.includes('unidade')) return Building2;
  if (field.includes('valor') || field.includes('preco')) return DollarSign;
  if (field.includes('data') || field.includes('prazo')) return Calendar;
  if (field.includes('endereco') || field.includes('estado')) return MapPin;
  if (field.includes('arquivo')) return FileText;
  return Tag;
}

export function AbaAtividadesContrato({ contratoId }: AbaAtividadesContratoProps) {
  // Query para buscar dados de referência (médicos, licitações, etc.)
  const { data: referencias } = useQuery({
    queryKey: ["contrato-referencias"],
    queryFn: async () => {
      const [medicosRes, licitacoesRes, clientesRes, unidadesRes, especialidadesRes] = await Promise.all([
        supabase.from("medicos").select("id, nome_completo"),
        supabase.from("licitacoes").select("id, numero_edital, objeto"),
        supabase.from("clientes").select("id, nome_empresa, nome_fantasia"),
        supabase.from("unidades").select("id, nome"),
        supabase.from("config_lista_items").select("id, valor").eq("campo_nome", "especialidade_contrato"),
      ]);

      return {
        medicos: new Map((medicosRes.data || []).map(m => [m.id, m.nome_completo])),
        licitacoes: new Map((licitacoesRes.data || []).map(l => [l.id, l.numero_edital || l.objeto || 'Licitação'])),
        clientes: new Map((clientesRes.data || []).map(c => [c.id, c.nome_fantasia || c.nome_empresa])),
        unidades: new Map((unidadesRes.data || []).map(u => [u.id, u.nome])),
        especialidades: new Map((especialidadesRes.data || []).map(e => [e.id, e.valor])),
      };
    },
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  const { data: atividades, isLoading } = useQuery({
    queryKey: ["contrato-atividades", contratoId],
    enabled: !!contratoId,
    queryFn: async () => {
      // Buscar logs do contrato principal
      const { data: contratoLogs, error: contratoError } = await supabase
        .from("auditoria_logs")
        .select("*")
        .eq("tabela", "contratos")
        .eq("registro_id", contratoId)
        .order("created_at", { ascending: false });

      if (contratoError) throw contratoError;

      // Buscar logs de anexos
      const { data: anexosLogs } = await supabase
        .from("auditoria_logs")
        .select("*")
        .eq("tabela", "contrato_anexos")
        .or(`registro_id.eq.${contratoId},detalhes.ilike.%${contratoId}%`)
        .order("created_at", { ascending: false });

      // Buscar logs de itens
      const { data: itensLogs } = await supabase
        .from("auditoria_logs")
        .select("*")
        .eq("tabela", "contrato_itens")
        .or(`registro_id.eq.${contratoId},detalhes.ilike.%${contratoId}%`)
        .order("created_at", { ascending: false });

      // Buscar logs de aditivos
      const { data: aditivosLogs } = await supabase
        .from("auditoria_logs")
        .select("*")
        .eq("tabela", "contrato_aditivos_tempo")
        .or(`registro_id.eq.${contratoId},detalhes.ilike.%${contratoId}%`)
        .order("created_at", { ascending: false });

      // Buscar logs de renovações
      const { data: renovacoesLogs } = await supabase
        .from("auditoria_logs")
        .select("*")
        .eq("tabela", "contrato_renovacoes")
        .or(`registro_id.eq.${contratoId},detalhes.ilike.%${contratoId}%`)
        .order("created_at", { ascending: false });

      const allLogs = [
        ...(contratoLogs || []),
        ...(anexosLogs || []),
        ...(itensLogs || []),
        ...(aditivosLogs || []),
        ...(renovacoesLogs || []),
      ]
        // Filtrar logs duplicados do trigger de banco (acao em maiúsculo como INSERT/UPDATE/DELETE)
        .filter(log => !['INSERT', 'UPDATE', 'DELETE'].includes(log.acao))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return allLogs as AtividadeLog[];
    },
  });

  // Função para resolver ID para nome
  const resolveIdToName = (field: string, value: any): string | null => {
    if (!referencias || !value) return null;
    
    if (field === 'medico_id') {
      return referencias.medicos.get(value) || null;
    }
    if (field === 'licitacao_origem_id') {
      return referencias.licitacoes.get(value) || null;
    }
    if (field === 'cliente_id') {
      return referencias.clientes.get(value) || null;
    }
    if (field === 'unidade_id') {
      return referencias.unidades.get(value) || null;
    }
    if (field === 'especialidade_contrato') {
      // Especialidade pode ser o próprio valor de texto ou um ID
      return referencias.especialidades.get(value) || value;
    }
    return null;
  };

  // Função para formatar valor resolvendo IDs
  const formatResolvedValue = (value: any, field: string): string => {
    if (value === null || value === undefined || value === '') return "—";
    
    // Tentar resolver ID para nome
    if (ID_FIELDS.includes(field)) {
      const resolvedName = resolveIdToName(field, value);
      if (resolvedName) return resolvedName;
    }
    
    return formatValue(value, field);
  };

  // Filtrar campos relevantes (remover ignorados e vazios)
  const getRelevantChanges = (campos: string[] | null, dadosAntigos: Record<string, any> | null, dadosNovos: Record<string, any> | null) => {
    if (!campos) return [];
    
    return campos.filter(campo => {
      if (CAMPOS_IGNORADOS.includes(campo)) return false;
      
      const valorAntigo = dadosAntigos?.[campo];
      const valorNovo = dadosNovos?.[campo];
      
      // Ignorar se ambos são vazios/nulos
      const antigoVazio = valorAntigo === null || valorAntigo === undefined || valorAntigo === '';
      const novoVazio = valorNovo === null || valorNovo === undefined || valorNovo === '';
      
      // Se dados_novos está completamente vazio (logs antigos), mostrar campos que tinham valor antigo
      if (dadosNovos && Object.keys(dadosNovos).length === 0 && !antigoVazio) {
        return true;
      }
      
      if (antigoVazio && novoVazio) return false;
      
      return true;
    });
  };
  
  // Verificar se é um log antigo (sem dados_novos registrados)
  const isLegacyLog = (dadosNovos: Record<string, any> | null) => {
    return !dadosNovos || Object.keys(dadosNovos).length === 0;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!atividades || atividades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-muted-foreground">
        <History className="h-10 w-10 mb-3 opacity-50" />
        <p className="text-sm font-medium text-center">Nenhuma atividade registrada</p>
        <p className="text-xs text-center mt-1">As alterações neste contrato serão exibidas aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {atividades.map((atividade, index) => {
        const actionConfig = ACTION_CONFIG[atividade.acao] || { 
          label: atividade.acao, 
          icon: Edit,
          color: "text-muted-foreground",
          bgColor: "bg-muted"
        };
        const ActionIcon = actionConfig.icon;
        
        const tableConfig = TABLE_CONFIG[atividade.tabela] || { label: atividade.tabela, icon: FileText };
        const TableIcon = tableConfig.icon;
        
        const dadosAntigos = atividade.dados_antigos || {};
        const dadosNovos = atividade.dados_novos || {};
        const camposRelevantes = getRelevantChanges(atividade.campos_alterados, dadosAntigos, dadosNovos);
        const isLegacy = isLegacyLog(atividade.dados_novos);

        return (
          <div 
            key={atividade.id} 
            className={`px-4 py-3 hover:bg-muted/50 transition-colors ${index !== atividades.length - 1 ? 'border-b border-border/50' : ''}`}
          >
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                  {getInitials(atividade.usuario_nome)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {atividade.usuario_nome}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {format(new Date(atividade.created_at), "dd MMM 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>

                {/* Ação e tabela */}
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${actionConfig.bgColor}`}>
                    <ActionIcon className={`h-3 w-3 ${actionConfig.color}`} />
                    <span className={actionConfig.color}>{actionConfig.label}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <TableIcon className="h-3 w-3" />
                    <span>{tableConfig.label}</span>
                  </div>
                </div>

                {/* Campos alterados */}
                {camposRelevantes.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {camposRelevantes.slice(0, 5).map((campo) => {
                      const valorAntigo = dadosAntigos[campo];
                      const valorNovo = dadosNovos[campo];
                      const FieldIcon = getFieldIcon(campo);
                      
                      // Para anexos, mostrar de forma especial
                      if (campo === "arquivo_nome" && atividade.acao === "anexar") {
                        return (
                          <div key={campo} className="flex items-center gap-2 text-xs bg-purple-50 dark:bg-purple-900/20 px-2 py-1.5 rounded">
                            <FileText className="h-3.5 w-3.5 text-purple-500" />
                            <span className="text-muted-foreground">Arquivo anexado:</span>
                            <span className="font-medium text-foreground truncate">{valorNovo || valorAntigo}</span>
                          </div>
                        );
                      }

                      // Log antigo sem dados_novos - mostrar apenas campos alterados
                      if (isLegacy) {
                        return (
                          <div key={campo} className="text-xs bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 rounded">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <FieldIcon className="h-3 w-3" />
                              <span className="font-medium">{getFieldLabel(campo)}</span>
                              <span className="text-amber-600 dark:text-amber-400">foi alterado</span>
                            </div>
                            {valorAntigo !== null && valorAntigo !== undefined && (
                              <div className="flex items-center gap-1.5 pl-4 mt-1">
                                <span className="text-muted-foreground">Valor anterior:</span>
                                <Badge 
                                  variant="outline" 
                                  className="text-xs py-0 px-1.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 max-w-[150px] truncate"
                                  title={formatResolvedValue(valorAntigo, campo)}
                                >
                                  {formatResolvedValue(valorAntigo, campo)}
                                </Badge>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div key={campo} className="text-xs bg-muted/30 px-2 py-1.5 rounded">
                          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                            <FieldIcon className="h-3 w-3" />
                            <span className="font-medium">{getFieldLabel(campo)}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap pl-4">
                            <Badge 
                              variant="outline" 
                              className="text-xs py-0 px-1.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 max-w-[150px] truncate"
                              title={formatResolvedValue(valorAntigo, campo)}
                            >
                              {formatResolvedValue(valorAntigo, campo)}
                            </Badge>
                            <span className="text-muted-foreground">→</span>
                            <Badge 
                              variant="outline" 
                              className="text-xs py-0 px-1.5 bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 max-w-[150px] truncate"
                              title={formatResolvedValue(valorNovo, campo)}
                            >
                              {formatResolvedValue(valorNovo, campo)}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                    {camposRelevantes.length > 5 && (
                      <span className="text-xs text-muted-foreground pl-2">
                        +{camposRelevantes.length - 5} campo(s) alterado(s)
                      </span>
                    )}
                  </div>
                )}

                {/* Detalhes quando não há campos alterados */}
                {camposRelevantes.length === 0 && atividade.detalhes && (
                  <p className="mt-2 text-xs text-muted-foreground bg-muted/30 px-2 py-1.5 rounded line-clamp-2">
                    {atividade.detalhes}
                  </p>
                )}

                {/* Mensagem para criação */}
                {camposRelevantes.length === 0 && Object.keys(dadosNovos).length > 0 && atividade.acao === "criar" && (
                  <p className="mt-2 text-xs text-muted-foreground bg-green-50 dark:bg-green-900/20 px-2 py-1.5 rounded">
                    ✓ {tableConfig.label} criado(a) com dados iniciais
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
