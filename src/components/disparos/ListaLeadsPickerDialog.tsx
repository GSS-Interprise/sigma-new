import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Search, Loader2, Filter, X, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { useAddLeadsToLista } from "@/hooks/useDisparoListas";
import { useLeadsFilterCounts } from "@/hooks/useLeadsPaginated";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listaId: string;
  listaNome: string;
}

const PAGE_SIZE = 50;
const SELECT_ALL_CHUNK = 1000;
const SELECT_ALL_MAX = 50000;

type AnoMode = "min" | "exato";

// Monta os parâmetros da RPC search_leads_for_picker a partir dos filtros da UI
function buildRpcParams(opts: {
  debounced: string;
  especialidades: string[];
  ufs: string[];
  cidade: string;
  ano: string;
  anoMode: AnoMode;
}, limit: number, offset: number) {
  const { debounced, especialidades, ufs, cidade, ano, anoMode } = opts;
  const params: Record<string, any> = {
    p_especialidade_ids: especialidades.length > 0 ? especialidades : null,
    p_ufs: ufs.length > 0 ? ufs.map((u) => u.toUpperCase()) : null,
    p_cidade: cidade.trim() || null,
    p_busca: debounced.trim() || null,
    p_limit: limit,
    p_offset: offset,
    p_ano_min: null,
    p_ano_max: null,
  };
  if (ano && /^\d{4}$/.test(ano)) {
    const y = parseInt(ano, 10);
    params.p_ano_min = y;
    if (anoMode === "exato") params.p_ano_max = y;
  }
  return params;
}

export function ListaLeadsPickerDialog({ open, onOpenChange, listaId, listaNome }: Props) {
  const [busca, setBusca] = useState("");
  const [debounced, setDebounced] = useState("");
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [ufs, setUfs] = useState<string[]>([]);
  const [cidade, setCidade] = useState<string>("");
  const [ano, setAno] = useState<string>("");
  const [anoMode, setAnoMode] = useState<AnoMode>("min");
  const [page, setPage] = useState(0);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const add = useAddLeadsToLista();
  const { data: filterMeta } = useLeadsFilterCounts(open);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  // Reset página ao mudar filtros
  useEffect(() => { setPage(0); }, [debounced, especialidades, ufs, cidade, ano, anoMode]);

  useEffect(() => {
    if (!open) {
      setSelecionados(new Set());
      setBusca(""); setDebounced("");
      setEspecialidades([]); setUfs([]); setCidade(""); setAno("");
      setAnoMode("min"); setPage(0);
    }
  }, [open]);

  const { data: jaNaLista } = useQuery({
    queryKey: ["disparo-lista-itens-ids", listaId],
    queryFn: async () => {
      const ids = new Set<string>();
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("disparo_lista_itens")
          .select("lead_id")
          .eq("lista_id", listaId)
          .range(from, from + 999);
        if (error) throw error;
        (data || []).forEach((r: any) => ids.add(r.lead_id));
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      return ids;
    },
    enabled: open,
  });

  const filtersOpts = { debounced, especialidades, ufs, cidade, ano, anoMode };

  const { data: pageData, isLoading, isFetching } = useQuery({
    queryKey: ["leads-picker-page", page, debounced, especialidades, ufs, cidade, ano, anoMode],
    queryFn: async () => {
      const params = buildRpcParams(filtersOpts, PAGE_SIZE, page * PAGE_SIZE);
      const { data, error } = await (supabase as any).rpc("search_leads_for_picker", params);
      if (error) throw error;
      const rows = (data || []) as any[];
      const totalCount = rows.length > 0 ? Number(rows[0].total_count) || 0 : 0;
      return { leads: rows, totalCount };
    },
    enabled: open,
    placeholderData: (prev) => prev,
  });

  const leadsPagina = pageData?.leads || [];
  const totalCount = pageData?.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const filtrados = useMemo(
    () => leadsPagina.filter((l: any) => !jaNaLista?.has(l.id)),
    [leadsPagina, jaNaLista]
  );

  const todosDaPaginaSelecionados =
    filtrados.length > 0 && filtrados.every((l: any) => selecionados.has(l.id));

  const togglePagina = () => {
    const next = new Set(selecionados);
    if (todosDaPaginaSelecionados) {
      filtrados.forEach((l: any) => next.delete(l.id));
    } else {
      filtrados.forEach((l: any) => next.add(l.id));
    }
    setSelecionados(next);
  };

  // Seleciona TODOS os IDs (todas as páginas) buscando em chunks
  const selecionarTodosFiltrados = async () => {
    setSelectingAll(true);
    try {
      const next = new Set(selecionados);
      let from = 0;
      while (from < SELECT_ALL_MAX) {
        let q: any = supabase.from("leads").select("id");
        q = applyFilters(q, filtersOpts, espLeadIds).range(from, from + SELECT_ALL_CHUNK - 1);
        const { data, error } = await q;
        if (error) throw error;
        (data || []).forEach((l: any) => {
          if (!jaNaLista?.has(l.id)) next.add(l.id);
        });
        if (!data || data.length < SELECT_ALL_CHUNK) break;
        from += SELECT_ALL_CHUNK;
      }
      setSelecionados(next);
    } finally {
      setSelectingAll(false);
    }
  };

  const handleAdd = async () => {
    await add.mutateAsync({ listaId, leadIds: Array.from(selecionados) });
    onOpenChange(false);
  };

  const limparFiltros = () => {
    setEspecialidades([]); setUfs([]); setCidade(""); setAno(""); setBusca("");
  };

  const filtrosAtivos =
    (especialidades.length ? 1 : 0) + (ufs.length ? 1 : 0) + (cidade ? 1 : 0) + (ano ? 1 : 0) + (busca ? 1 : 0);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header com gradiente primary */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Adicionar leads à <span className="text-primary">{listaNome}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Use os filtros acumulativos para selecionar contatos por especialidade, região e ano de formatura.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-6 gap-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10 h-11 text-sm"
              placeholder="Buscar por nome, telefone, especialidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {/* Filtros */}
          <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-muted/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Filtros acumulativos
              </Label>
              {filtrosAtivos > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={limparFiltros}
                  className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" /> Limpar {filtrosAtivos}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Especialidades</Label>
                <SearchableMultiSelect
                  placeholder="Todas"
                  searchPlaceholder="Buscar especialidade..."
                  values={especialidades}
                  onChange={setEspecialidades}
                  options={(filterMeta?.especialidades || [])
                    .filter((e) => e.id && e.nome)
                    .map((e) => ({ value: e.id, label: e.nome }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">UFs</Label>
                <SearchableMultiSelect
                  placeholder="Todas"
                  searchPlaceholder="Buscar UF..."
                  values={ufs}
                  onChange={setUfs}
                  options={(filterMeta?.options.uf || [])
                    .filter((u) => u && u.trim())
                    .map((u) => ({ value: u.toUpperCase(), label: u.toUpperCase() }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Cidade (contém)</Label>
                <Input
                  placeholder="Ex.: Florianópolis"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Ano de formatura</Label>
                <div className="flex gap-2">
                  <Select value={anoMode} onValueChange={(v) => setAnoMode(v as AnoMode)}>
                    <SelectTrigger className="w-[110px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="min">A partir de</SelectItem>
                      <SelectItem value="exato">Exato</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="2025"
                    min={1950}
                    max={2100}
                    value={ano}
                    onChange={(e) => setAno(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Resumo + ações */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/5 text-foreground">
                <span className="font-semibold text-primary">{totalCount.toLocaleString("pt-BR")}</span> encontrados
              </Badge>
              <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/10 text-foreground">
                <span className="font-semibold text-primary">{selecionados.size.toLocaleString("pt-BR")}</span> selecionados
              </Badge>
              {(isFetching || selectingAll) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={togglePagina}
                disabled={filtrados.length === 0}
              >
                {todosDaPaginaSelecionados ? "Desmarcar página" : "Selecionar página"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={selecionarTodosFiltrados}
                disabled={totalCount === 0 || selectingAll}
                className="border-primary/40 text-primary hover:bg-primary/10"
              >
                {selectingAll ? (
                  <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Selecionando...</>
                ) : (
                  `Selecionar todos (${totalCount.toLocaleString("pt-BR")})`
                )}
              </Button>
            </div>
          </div>

          {/* Lista de leads */}
          <ScrollArea className="flex-1 min-h-0 rounded-lg border bg-card">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 h-40">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Carregando leads...</span>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">
                Nenhum lead disponível com os filtros atuais
              </div>
            ) : (
              <div className="divide-y">
                {filtrados.map((l: any) => {
                  const checked = selecionados.has(l.id);
                  const anoForm = l.data_formatura ? new Date(l.data_formatura).getFullYear() : null;
                  return (
                    <label
                      key={l.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        checked ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = new Set(selecionados);
                          if (v) next.add(l.id); else next.delete(l.id);
                          setSelecionados(next);
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{l.nome}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          <span className="font-mono">{l.phone_e164}</span>
                          {" · "}{l.especialidade || "-"}
                          {" · "}{l.cidade || "-"}/{l.uf || "-"}
                          {anoForm ? ` · Form. ${anoForm}` : ""}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Paginação */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Página <span className="font-semibold text-foreground">{page + 1}</span> de{" "}
              <span className="font-semibold text-foreground">{totalPages.toLocaleString("pt-BR")}</span>
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(0)}
                disabled={page === 0 || isFetching}
              >
                « Primeira
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || isFetching}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1 || isFetching}
              >
                Última »
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleAdd}
            disabled={selecionados.size === 0 || add.isPending}
            className="min-w-[140px]"
          >
            {add.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adicionando...</>
            ) : (
              `Adicionar ${selecionados.size}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

