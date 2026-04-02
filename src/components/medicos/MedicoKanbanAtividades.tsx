import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, History, FileText, Edit, Trash2, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MedicoKanbanAtividadesProps {
  cardId: string;
}

interface AtividadeLog {
  id: string;
  created_at: string;
  usuario_nome: string;
  acao: string;
  campos_alterados: string[] | null;
  dados_antigos: Record<string, any> | null;
  dados_novos: Record<string, any> | null;
  detalhes: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  nome: "Nome",
  cpf: "CPF",
  data_nascimento: "Data de Nascimento",
  crm: "CRM",
  telefone: "Telefone",
  email: "E-mail",
  observacoes: "Observações",
  status: "Status",
  arquivo_nome: "Arquivo",
};

const ACTION_CONFIG: Record<string, { label: string; icon: typeof Edit; color: string }> = {
  criar: { label: "criou o card", icon: Plus, color: "text-green-600" },
  editar: { label: "editou", icon: Edit, color: "text-blue-600" },
  excluir: { label: "excluiu", icon: Trash2, color: "text-red-600" },
  anexar: { label: "adicionou arquivo", icon: FileText, color: "text-purple-600" },
  remover_anexo: { label: "removeu arquivo", icon: Trash2, color: "text-orange-600" },
};

function formatValue(value: any): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.join(", ");
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

export function MedicoKanbanAtividades({ cardId }: MedicoKanbanAtividadesProps) {
  const { data: atividades, isLoading } = useQuery({
    queryKey: ["medico-kanban-atividades", cardId],
    enabled: !!cardId,
    queryFn: async () => {
      const { data: cardLogs, error: cardError } = await supabase
        .from("auditoria_logs")
        .select("*")
        .eq("tabela", "medico_kanban_cards")
        .eq("registro_id", cardId)
        .order("created_at", { ascending: false });

      if (cardError) throw cardError;

      const { data: anexosLogs } = await supabase
        .from("auditoria_logs")
        .select("*")
        .eq("tabela", "medico_kanban_card_anexos")
        .eq("registro_id", cardId)
        .order("created_at", { ascending: false });

      const allLogs = [
        ...(cardLogs || []),
        ...(anexosLogs || []),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return allLogs as AtividadeLog[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!atividades || atividades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-muted-foreground">
        <History className="h-8 w-8 mb-3 opacity-50" />
        <p className="text-sm font-medium text-center">Nenhuma atividade</p>
        <p className="text-xs text-center mt-1">As alterações serão exibidas aqui.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {atividades.map((atividade, index) => {
          const actionConfig = ACTION_CONFIG[atividade.acao] || { 
            label: atividade.acao, 
            icon: Edit,
            color: "text-muted-foreground"
          };
          const ActionIcon = actionConfig.icon;
          const camposAlterados = atividade.campos_alterados || [];
          const dadosAntigos = atividade.dados_antigos || {};
          const dadosNovos = atividade.dados_novos || {};

          return (
            <div 
              key={atividade.id} 
              className={`px-3 py-2 hover:bg-muted/50 transition-colors rounded-md ${index !== atividades.length - 1 ? 'border-b border-border/30' : ''}`}
            >
              <div className="flex items-start gap-2">
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                    {getInitials(atividade.usuario_nome)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium text-foreground truncate">
                      {atividade.usuario_nome}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {format(new Date(atividade.created_at), "dd MMM HH:mm", { locale: ptBR })}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <ActionIcon className={`h-2.5 w-2.5 ${actionConfig.color}`} />
                    <span>{actionConfig.label}</span>
                  </div>

                  {camposAlterados.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {camposAlterados.slice(0, 2).map((campo) => {
                        const valorAntigo = dadosAntigos[campo];
                        const valorNovo = dadosNovos[campo];
                        
                        if (campo === "arquivo_nome" && atividade.acao === "anexar") {
                          return (
                            <div key={campo} className="flex items-center gap-1 text-[10px]">
                              <FileText className="h-2.5 w-2.5 text-purple-500" />
                              <span className="truncate">{valorNovo}</span>
                            </div>
                          );
                        }

                        return (
                          <div key={campo} className="text-[10px] space-y-0.5">
                            <span className="text-muted-foreground">{getFieldLabel(campo)}</span>
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge variant="outline" className="text-[9px] py-0 px-1 bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                                {formatValue(valorAntigo)}
                              </Badge>
                              <span className="text-muted-foreground">→</span>
                              <Badge variant="outline" className="text-[9px] py-0 px-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                                {formatValue(valorNovo)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                      {camposAlterados.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{camposAlterados.length - 2} campo(s)
                        </span>
                      )}
                    </div>
                  )}

                  {atividade.detalhes && camposAlterados.length === 0 && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
                      {atividade.detalhes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
