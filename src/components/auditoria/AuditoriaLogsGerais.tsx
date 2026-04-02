import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Search, Filter, BarChart3, Eye, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const PAGE_SIZE = 50;

interface FiltrosAuditoria {
  modulo: string;
  acao: string;
  usuario: string;
  registro: string;
  dataInicio: string;
  dataFim: string;
  searchTerm: string;
}

// Mapeamento de ações para labels e cores
const ACAO_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  criar: { label: "Criação", variant: "default" },
  editar: { label: "Edição", variant: "secondary" },
  excluir: { label: "Exclusão", variant: "destructive" },
  anexar: { label: "Anexo", variant: "outline" },
  remover_anexo: { label: "Remoção Anexo", variant: "destructive" },
  INSERT: { label: "Criação", variant: "default" },
  UPDATE: { label: "Atualização", variant: "secondary" },
  DELETE: { label: "Exclusão", variant: "destructive" },
  VIEW: { label: "Visualização", variant: "outline" },
  EXPORT: { label: "Exportação", variant: "outline" },
};

const MODULOS_OPCOES = [
  "contratos", "Contratos",
  "Médicos", "medicos_kanban",
  "Clientes", "Licitações",
  "Disparos", "Marketing",
  "Suporte", "Patrimônio",
  "Escalas", "Configurações", "Sistema",
].filter((v, i, a) => a.indexOf(v) === i);

const ACOES_OPCOES = [
  { value: "criar", label: "Criação" },
  { value: "editar", label: "Edição" },
  { value: "excluir", label: "Exclusão" },
  { value: "anexar", label: "Anexar arquivo" },
  { value: "remover_anexo", label: "Remoção de anexo" },
  { value: "INSERT", label: "INSERT (sistema)" },
  { value: "UPDATE", label: "UPDATE (sistema)" },
  { value: "DELETE", label: "DELETE (sistema)" },
];

export function AuditoriaLogsGerais() {
  const [filtros, setFiltros] = useState<FiltrosAuditoria>({
    modulo: "todos",
    acao: "todos",
    usuario: "",
    registro: "",
    dataInicio: "",
    dataFim: "",
    searchTerm: ""
  });

  const [showFiltros, setShowFiltros] = useState(false);
  const [page, setPage] = useState(0);
  // Debounce do searchTerm para não disparar query a cada keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filtros.searchTerm), 400);
    return () => clearTimeout(t);
  }, [filtros.searchTerm]);

  // Reset page when filters change
  const updateFiltro = useCallback((patch: Partial<FiltrosAuditoria>) => {
    setFiltros(prev => ({ ...prev, ...patch }));
    setPage(0);
  }, []);

  const filtrosAtivos = [
    filtros.modulo !== "todos",
    filtros.acao !== "todos",
    !!filtros.usuario,
    !!filtros.registro,
    !!filtros.dataInicio,
    !!filtros.dataFim,
    !!filtros.searchTerm,
  ].filter(Boolean).length;

  // Query principal paginada — sem colunas JSON pesadas (dados_antigos/novos)
  // queryKey usa debouncedSearch para evitar query a cada letra digitada
  const { data: result, isLoading } = useQuery({
    queryKey: ['auditoria-logs-gerais', filtros.modulo, filtros.acao, filtros.usuario, filtros.registro, filtros.dataInicio, filtros.dataFim, debouncedSearch, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('auditoria_logs')
        .select(
          'id, created_at, usuario_nome, usuario_perfil, acao, modulo, tabela, registro_id, registro_descricao, detalhes, campos_alterados',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filtros.modulo !== 'todos') {
        query = query.ilike('modulo', filtros.modulo);
      }
      if (filtros.acao !== 'todos') {
        query = query.eq('acao', filtros.acao);
      }
      if (filtros.usuario) {
        query = query.ilike('usuario_nome', `%${filtros.usuario}%`);
      }
      if (filtros.registro) {
        query = query.ilike('registro_descricao', `%${filtros.registro}%`);
      }
      if (debouncedSearch) {
        // server-side OR usando PostgREST
        query = query.or(
          `usuario_nome.ilike.%${debouncedSearch}%,` +
          `detalhes.ilike.%${debouncedSearch}%,` +
          `registro_descricao.ilike.%${debouncedSearch}%,` +
          `tabela.ilike.%${debouncedSearch}%,` +
          `modulo.ilike.%${debouncedSearch}%`
        );
      }
      if (filtros.dataInicio) {
        query = query.gte('created_at', filtros.dataInicio + 'T00:00:00');
      }
      if (filtros.dataFim) {
        query = query.lte('created_at', filtros.dataFim + 'T23:59:59');
      }

      const { data, error, count } = await query;
      if (error) {
        console.error('[AuditoriaLogsGerais] query error:', error);
        throw error;
      }
      return { logs: data || [], total: count || 0 };
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
  });

  const logs = result?.logs ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Stats query separada (leve — só contagens)
  const { data: stats } = useQuery({
    queryKey: ['auditoria-logs-stats'],
    queryFn: async () => {
      const [total7d, ultimas24h, modulos, usuarios] = await Promise.all([
        supabase.from('auditoria_logs').select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('auditoria_logs').select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('auditoria_logs').select('modulo').limit(1000),
        supabase.from('auditoria_logs').select('usuario_nome')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1000),
      ]);

      const modulosCounts = (modulos.data || []).reduce((acc: any, log: any) => {
        acc[log.modulo] = (acc[log.modulo] || 0) + 1;
        return acc;
      }, {});

      const usuariosCounts = (usuarios.data || []).reduce((acc: any, log: any) => {
        acc[log.usuario_nome] = (acc[log.usuario_nome] || 0) + 1;
        return acc;
      }, {});

      return {
        total7d: total7d.count || 0,
        ultimas24h: ultimas24h.count || 0,
        modulosCounts: Object.entries(modulosCounts).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5),
        usuariosCounts: Object.entries(usuariosCounts).sort((a: any, b: any) => b[1] - a[1]).slice(0, 10),
      };
    },
    staleTime: 60_000,
  });

  // Query para listar usuários do sistema (profiles)
  const { data: usuariosList } = useQuery({
    queryKey: ['auditoria-usuarios-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome_completo')
        .order('nome_completo', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  // Buscar detalhes completos (dados_antigos/novos) apenas ao abrir o dialog
  const fetchLogDetalhes = async (id: string) => {
    const { data } = await supabase
      .from('auditoria_logs')
      .select('dados_antigos, dados_novos')
      .eq('id', id)
      .single();
    return data;
  };

  const handleExport = async () => {
    // Exporta apenas os registros filtrados (até 500) sem os JSONs pesados
    let query = supabase
      .from('auditoria_logs')
      .select('created_at, usuario_nome, usuario_perfil, modulo, tabela, acao, registro_descricao, detalhes, campos_alterados')
      .order('created_at', { ascending: false })
      .limit(500);

    if (filtros.modulo !== 'todos') query = query.ilike('modulo', filtros.modulo);
    if (filtros.acao !== 'todos') query = query.eq('acao', filtros.acao);
    if (filtros.usuario) query = query.ilike('usuario_nome', `%${filtros.usuario}%`);
    if (filtros.registro) query = query.ilike('registro_descricao', `%${filtros.registro}%`);
    if (filtros.dataInicio) query = query.gte('created_at', filtros.dataInicio + 'T00:00:00');
    if (filtros.dataFim) query = query.lte('created_at', filtros.dataFim + 'T23:59:59');

    const { data } = await query;
    if (!data || data.length === 0) return;

    const csv = [
      ['Data/Hora', 'Usuário', 'Perfil', 'Módulo', 'Tabela', 'Ação', 'Registro', 'Detalhes', 'Campos Alterados'],
      ...data.map((log: any) => [
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
        log.usuario_nome, log.usuario_perfil || '-', log.modulo, log.tabela, log.acao,
        log.registro_descricao || '-', log.detalhes || '-',
        log.campos_alterados?.join(', ') || '-'
      ])
    ].map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria-geral-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
    link.click();
  };

  const getAcaoBadge = (acao: string) => {
    const config = ACAO_CONFIG[acao];
    if (config) return <Badge variant={config.variant}>{config.label}</Badge>;
    return <Badge variant="outline">{acao}</Badge>;
  };

  const limparFiltros = () => {
    setFiltros({ modulo: "todos", acao: "todos", usuario: "", registro: "", dataInicio: "", dataFim: "", searchTerm: "" });
    setPage(0);
  };

  return (
    <div className="space-y-6">
      {/* Estatísticas rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-lg border">
          <div className="text-xs text-muted-foreground mb-1">Últimos 7 dias</div>
          <div className="text-2xl font-bold">{stats?.total7d ?? '—'}</div>
        </div>
        <div className="bg-card p-4 rounded-lg border">
          <div className="text-xs text-muted-foreground mb-1">Últimas 24h</div>
          <div className="text-2xl font-bold">{stats?.ultimas24h ?? '—'}</div>
        </div>
        <div className="bg-card p-4 rounded-lg border">
          <div className="text-xs text-muted-foreground mb-1">Módulo + ativo</div>
          <div className="text-sm font-semibold truncate">{String(stats?.modulosCounts?.[0]?.[0] ?? '—')}</div>
          <div className="text-xs text-muted-foreground">{Number(stats?.modulosCounts?.[0]?.[1] ?? 0)} ações</div>
        </div>
        <div className="bg-card p-4 rounded-lg border">
          <div className="text-xs text-muted-foreground mb-1">Usuário + ativo (7d)</div>
          <div className="text-sm font-semibold truncate">{String(stats?.usuariosCounts?.[0]?.[0] ?? '—')}</div>
          <div className="text-xs text-muted-foreground">{Number(stats?.usuariosCounts?.[0]?.[1] ?? 0)} ações</div>
        </div>
      </div>

      {/* Barra de ferramentas */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar em todos os campos..."
              value={filtros.searchTerm}
              onChange={(e) => updateFiltro({ searchTerm: e.target.value })}
              className="pl-8"
            />
          </div>
          <Button variant="outline" onClick={() => setShowFiltros(!showFiltros)} className="relative">
            <Filter className="mr-2 h-4 w-4" />
            Filtros
            {filtrosAtivos > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-primary text-primary-foreground">
                {filtrosAtivos}
              </span>
            )}
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <BarChart3 className="mr-2 h-4 w-4" />
                Estatísticas
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Estatísticas de Auditoria</DialogTitle></DialogHeader>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-3">Top 5 Módulos Mais Usados</h3>
                    <div className="space-y-2">
                      {stats?.modulosCounts?.map(([modulo, count]: [string, any], idx) => (
                        <div key={modulo} className="flex items-center justify-between">
                          <span className="text-sm">{idx + 1}. {modulo}</span>
                          <Badge variant="secondary">{count} ações</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-3">Top 10 Usuários Mais Ativos (7 dias)</h3>
                    <div className="space-y-2">
                      {stats?.usuariosCounts?.map(([usuario, count]: [string, any], idx) => (
                        <div key={usuario} className="flex items-center justify-between">
                          <span className="text-sm">{idx + 1}. {usuario}</span>
                          <Badge variant="outline">{count} ações</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>

          <Button onClick={handleExport} disabled={total === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        {/* Filtros Avançados */}
        {showFiltros && (
          <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Módulo</label>
                <Select value={filtros.modulo} onValueChange={(v) => updateFiltro({ modulo: v })}>
                  <SelectTrigger><SelectValue placeholder="Todos os módulos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os módulos</SelectItem>
                    {MODULOS_OPCOES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ação</label>
                <Select value={filtros.acao} onValueChange={(v) => updateFiltro({ acao: v })}>
                  <SelectTrigger><SelectValue placeholder="Todas as ações" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as ações</SelectItem>
                    {ACOES_OPCOES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Usuário</label>
                <Select value={filtros.usuario || "todos"} onValueChange={(v) => updateFiltro({ usuario: v === "todos" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Todos os usuários" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os usuários</SelectItem>
                    {usuariosList?.map(u => (
                      <SelectItem key={u.id} value={u.nome_completo}>{u.nome_completo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Registro / Descrição</label>
                <Input
                  placeholder="Ex: Contrato 011/2026..."
                  value={filtros.registro}
                  onChange={(e) => updateFiltro({ registro: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data início</label>
                <Input type="date" value={filtros.dataInicio} onChange={(e) => updateFiltro({ dataInicio: e.target.value })} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data fim</label>
                <Input type="date" value={filtros.dataFim} onChange={(e) => updateFiltro({ dataFim: e.target.value })} />
              </div>
            </div>

            {filtrosAtivos > 0 && (
              <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-muted-foreground">
                <X className="mr-1 h-3 w-3" />
                Limpar {filtrosAtivos} filtro{filtrosAtivos > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead className="max-w-xs">Detalhes</TableHead>
              <TableHead className="w-10 text-center">+</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum registro encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm leading-tight">{log.usuario_nome}</div>
                    {log.usuario_perfil && <div className="text-xs text-muted-foreground">{log.usuario_perfil}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{log.modulo}</Badge>
                  </TableCell>
                  <TableCell>{getAcaoBadge(log.acao)}</TableCell>
                  <TableCell className="max-w-[160px]">
                    <div className="text-sm truncate" title={log.registro_descricao || log.tabela}>
                      {log.registro_descricao || <span className="text-muted-foreground text-xs">{log.tabela}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <span className="text-sm text-muted-foreground line-clamp-2" title={log.detalhes}>
                      {log.campos_alterados?.length > 0
                        ? `Campos: ${log.campos_alterados.join(', ')}`
                        : log.detalhes || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <LogDetalhesDialog log={log} fetchDetalhes={fetchLogDetalhes} getAcaoBadge={getAcaoBadge} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total} registros
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="icon" className="h-7 w-7"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2">Página {page + 1} de {totalPages}</span>
            <Button
              variant="outline" size="icon" className="h-7 w-7"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente separado para o dialog de detalhes — carrega dados_antigos/novos só quando aberto
function LogDetalhesDialog({
  log,
  fetchDetalhes,
  getAcaoBadge,
}: {
  log: any;
  fetchDetalhes: (id: string) => Promise<any>;
  getAcaoBadge: (acao: string) => React.ReactNode;
}) {
  const [detalhes, setDetalhes] = useState<{ dados_antigos: any; dados_novos: any } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async (open: boolean) => {
    if (open && !detalhes) {
      setLoading(true);
      const data = await fetchDetalhes(log.id);
      setDetalhes(data);
      setLoading(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Detalhes do Log de Auditoria</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[550px]">
          <div className="space-y-5 pr-2">
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Data/Hora</div>
                <div className="text-sm font-medium">{format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Usuário</div>
                <div className="text-sm font-medium">{log.usuario_nome}</div>
                {log.usuario_perfil && <div className="text-xs text-muted-foreground">{log.usuario_perfil}</div>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Módulo / Tabela</div>
                <div className="text-sm">{log.modulo} → {log.tabela}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Ação</div>
                <div>{getAcaoBadge(log.acao)}</div>
              </div>
              {log.registro_descricao && (
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground mb-0.5">Registro</div>
                  <div className="text-sm font-medium">{log.registro_descricao}</div>
                </div>
              )}
            </div>

            {log.detalhes && (
              <div>
                <div className="text-sm font-medium mb-1">Detalhes</div>
                <div className="text-sm p-3 bg-muted rounded-md">{log.detalhes}</div>
              </div>
            )}

            {log.campos_alterados && log.campos_alterados.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Campos Alterados</div>
                <div className="flex flex-wrap gap-1.5">
                  {log.campos_alterados.map((campo: string) => (
                    <Badge key={campo} variant="secondary">{campo}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Dados antigos/novos — carregados sob demanda */}
            {loading && (
              <div className="text-sm text-muted-foreground text-center py-4">Carregando dados completos...</div>
            )}
            {!loading && detalhes && (detalhes.dados_antigos || detalhes.dados_novos) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {detalhes.dados_antigos && (
                  <div>
                    <div className="text-sm font-medium mb-1 text-destructive">Dados Anteriores</div>
                    <pre className="text-xs p-3 bg-destructive/5 border border-destructive/20 rounded-md overflow-auto max-h-60">
                      {JSON.stringify(detalhes.dados_antigos, null, 2)}
                    </pre>
                  </div>
                )}
                {detalhes.dados_novos && (
                  <div>
                    <div className="text-sm font-medium mb-1 text-primary">Dados Novos</div>
                    <pre className="text-xs p-3 bg-primary/5 border border-primary/20 rounded-md overflow-auto max-h-60">
                      {JSON.stringify(detalhes.dados_novos, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
