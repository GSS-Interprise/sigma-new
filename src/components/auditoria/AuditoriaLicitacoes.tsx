import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Search, ArrowRight, Filter, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  status_alterado: { label: "Movimentação de Status", color: "bg-purple-100 text-purple-800 border-purple-200" },
  campo_atualizado: { label: "Alteração de Campo", color: "bg-blue-100 text-blue-800 border-blue-200" },
  comentario: { label: "Comentário", color: "bg-green-100 text-green-800 border-green-200" },
  criado: { label: "Criação", color: "bg-orange-100 text-orange-800 border-orange-200" },
  arquivo_anexado: { label: "Arquivo Anexado", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  descarte: { label: "Descarte", color: "bg-red-100 text-red-800 border-red-200" },
};

const STATUS_LABELS: Record<string, string> = {
  captacao_edital: "Captação de Edital",
  capitacao_de_credenciamento: "Captação de Credenciamento",
  edital_analise: "Edital em Análise",
  conferencia: "Conferência",
  deliberacao: "Deliberação",
  esclarecimentos_impugnacao: "Esclarecimentos/Impugnação",
  cadastro_proposta: "Cadastro de Proposta",
  aguardando_sessao: "Aguardando Sessão",
  em_disputa: "Em Disputa",
  proposta_final: "Proposta Final",
  recurso_contrarrazao: "Recurso/Contrarrazão",
  adjudicacao_homologacao: "Adjudicação/Homologação",
  arrematados: "Arrematados",
  descarte_edital: "Descarte de Edital",
  suspenso_revogado: "Suspenso/Revogado",
  nao_ganhamos: "Não Ganhamos",
};

function formatStatus(status: string) {
  return STATUS_LABELS[status] || status;
}

export function AuditoriaLicitacoes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterUsuario, setFilterUsuario] = useState<string>("all");
  const [filterPeriodo, setFilterPeriodo] = useState<string>("30");

  const { data: logs, isLoading } = useQuery({
    queryKey: ['licitacoes-log-auditoria', filterPeriodo],
    queryFn: async () => {
      let query = supabase
        .from('licitacoes_atividades')
        .select(`
          *,
          licitacoes (numero_edital, objeto),
          profiles:user_id!left (nome_completo)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (filterPeriodo !== "all") {
        const days = parseInt(filterPeriodo);
        const since = new Date();
        since.setDate(since.getDate() - days);
        query = query.gte('created_at', since.toISOString());
      }

      // tipo filtering is done client-side to support "descarte" matching status_alterado+valor_novo=descarte_edital

      const { data } = await query;
      return data || [];
    },
  });

  const usuarios = [...new Set((logs || []).map((l: any) => l.profiles?.nome_completo).filter(Boolean))];

  const filtered = (logs || []).filter((log: any) => {
    const matchSearch = !searchTerm ||
      log.profiles?.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.tipo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.licitacoes?.numero_edital?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchUsuario = filterUsuario === "all" || log.profiles?.nome_completo === filterUsuario;

    // "descarte" filter catches both tipo=descarte AND status moves to descarte_edital
    const matchTipo = filterTipo === "all" ||
      log.tipo === filterTipo ||
      (filterTipo === "descarte" && log.tipo === "status_alterado" && log.valor_novo === "descarte_edital");

    return matchSearch && matchUsuario && matchTipo;
  });

  const statusMovimentos = filtered.filter((l: any) => l.tipo === 'status_alterado').length;
  const campoUpdates = filtered.filter((l: any) => l.tipo === 'campo_atualizado').length;
  const comentarios = filtered.filter((l: any) => l.tipo === 'comentario').length;

  const handleExport = () => {
    if (!filtered.length) return;
    const csv = [
      ['Data/Hora', 'Usuário', 'Tipo', 'Licitação', 'Descrição', 'Campo', 'Anterior', 'Novo'],
      ...filtered.map((log: any) => [
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        log.profiles?.nome_completo || '-',
        log.tipo,
        log.licitacoes?.numero_edital || '-',
        `"${(log.descricao || '').replace(/"/g, '""')}"`,
        log.campo_alterado || '-',
        `"${(log.valor_antigo || '-').replace(/"/g, '""')}"`,
        `"${(log.valor_novo || '-').replace(/"/g, '""')}"`,
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria-licitacoes-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const hasActiveFilters = filterTipo !== "all" || filterUsuario !== "all" || filterPeriodo !== "30" || searchTerm;

  const clearFilters = () => {
    setFilterTipo("all");
    setFilterUsuario("all");
    setFilterPeriodo("30");
    setSearchTerm("");
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-purple-600">{statusMovimentos}</div>
            <div className="text-xs text-muted-foreground">Movimentações de Status</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-blue-600">{campoUpdates}</div>
            <div className="text-xs text-muted-foreground">Alterações de Campo</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-green-600">{comentarios}</div>
            <div className="text-xs text-muted-foreground">Comentários</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário, licitação..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={filterTipo} onValueChange={(v) => { setFilterTipo(v); if (v === "descarte") setFilterPeriodo("all"); }}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="status_alterado">🔄 Movimentação de Status</SelectItem>
            <SelectItem value="campo_atualizado">✏️ Alteração de Campo</SelectItem>
            <SelectItem value="comentario">💬 Comentário</SelectItem>
            <SelectItem value="criado">✅ Criação</SelectItem>
            <SelectItem value="arquivo_anexado">📎 Arquivo Anexado</SelectItem>
            <SelectItem value="descarte">🗑️ Descarte</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterUsuario} onValueChange={setFilterUsuario}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Usuário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os usuários</SelectItem>
            {usuarios.map((u: string) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Hoje</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="all">Todo o período</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpar filtros
          </Button>
        )}

        <div className="ml-auto">
          <Button onClick={handleExport} disabled={!filtered.length} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {filtered.length} registro{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[130px]">Data/Hora</TableHead>
              <TableHead className="w-[160px]">Usuário</TableHead>
              <TableHead className="w-[200px]">Tipo</TableHead>
              <TableHead className="w-[120px]">Licitação</TableHead>
              <TableHead>Descrição / Detalhe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhum registro encontrado para os filtros selecionados
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log: any) => {
                const tipoConfig = TIPO_LABELS[log.tipo] || { label: log.tipo, color: "bg-gray-100 text-gray-800 border-gray-200" };
                const isStatus = log.tipo === 'status_alterado';
                const isDescarte = log.tipo === 'descarte' || log.valor_novo === 'descarte_edital';

                return (
                  <TableRow key={log.id} className={isStatus ? "bg-purple-50/40 dark:bg-purple-950/10" : isDescarte ? "bg-red-50/40 dark:bg-red-950/10" : ""}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(log.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "HH:mm", { locale: ptBR })}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {log.profiles?.nome_completo || '-'}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${tipoConfig.color}`}>
                        {tipoConfig.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {log.licitacoes?.numero_edital || '-'}
                    </TableCell>
                    <TableCell>
                      {isStatus && log.valor_antigo && log.valor_novo ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs border">
                            {formatStatus(log.valor_antigo)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-purple-500 flex-shrink-0" />
                          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs border border-purple-200 font-medium">
                            {formatStatus(log.valor_novo)}
                          </span>
                        </div>
                      ) : log.campo_alterado ? (
                        <div className="text-sm">
                          <span className="font-medium text-blue-700">{log.campo_alterado}:</span>{" "}
                          <span className="text-muted-foreground line-through text-xs">
                            {log.valor_antigo ? (log.valor_antigo.length > 40 ? log.valor_antigo.substring(0, 40) + '...' : log.valor_antigo) : '–'}
                          </span>
                          {log.valor_novo && (
                            <>
                              {" → "}
                              <span className="text-xs font-medium">
                                {log.valor_novo.length > 40 ? log.valor_novo.substring(0, 40) + '...' : log.valor_novo}
                              </span>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground line-clamp-2">{log.descricao}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
