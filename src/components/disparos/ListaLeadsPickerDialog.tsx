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
import { Search, Loader2, Filter, X } from "lucide-react";
import { useAddLeadsToLista } from "@/hooks/useDisparoListas";
import { useLeadsFilterCounts } from "@/hooks/useLeadsPaginated";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listaId: string;
  listaNome: string;
}

const PAGE_SIZE = 500;
const MAX_FETCH = 10000;

type AnoMode = "min" | "exato";

export function ListaLeadsPickerDialog({ open, onOpenChange, listaId, listaNome }: Props) {
  const [busca, setBusca] = useState("");
  const [debounced, setDebounced] = useState("");
  const [especialidade, setEspecialidade] = useState<string>("");
  const [uf, setUf] = useState<string>("");
  const [cidade, setCidade] = useState<string>("");
  const [ano, setAno] = useState<string>("");
  const [anoMode, setAnoMode] = useState<AnoMode>("min");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const add = useAddLeadsToLista();
  const { data: filterMeta } = useLeadsFilterCounts(open);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    if (!open) {
      setSelecionados(new Set());
      setBusca(""); setDebounced("");
      setEspecialidade(""); setUf(""); setCidade(""); setAno("");
      setAnoMode("min");
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

  const queryKey = ["leads-picker-v2", debounced, especialidade, uf, cidade, ano, anoMode];

  const { data: leads, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      while (from < MAX_FETCH) {
        let q = supabase
          .from("leads")
          .select("id, nome, phone_e164, especialidade, especialidade_id, uf, cidade, data_formatura")
          .not("phone_e164", "is", null)
          .is("merged_into_id", null)
          .range(from, from + PAGE_SIZE - 1);

        if (debounced.trim()) {
          q = q.or(`nome.ilike.%${debounced}%,phone_e164.ilike.%${debounced}%,especialidade.ilike.%${debounced}%`);
        }
        if (especialidade) q = q.eq("especialidade_id", especialidade);
        if (uf) q = q.ilike("uf", uf);
        if (cidade.trim()) q = q.ilike("cidade", `%${cidade.trim()}%`);
        if (ano && /^\d{4}$/.test(ano)) {
          if (anoMode === "min") {
            q = q.gte("data_formatura", `${ano}-01-01`);
          } else {
            q = q.gte("data_formatura", `${ano}-01-01`).lte("data_formatura", `${ano}-12-31`);
          }
        }

        const { data, error } = await q;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
    enabled: open,
  });

  const filtrados = useMemo(
    () => (leads || []).filter((l: any) => !jaNaLista?.has(l.id)),
    [leads, jaNaLista]
  );

  const toggleAll = () => {
    if (selecionados.size === filtrados.length) setSelecionados(new Set());
    else setSelecionados(new Set(filtrados.map((l: any) => l.id)));
  };

  const handleAdd = async () => {
    await add.mutateAsync({ listaId, leadIds: Array.from(selecionados) });
    onOpenChange(false);
  };

  const limparFiltros = () => {
    setEspecialidade(""); setUf(""); setCidade(""); setAno(""); setBusca("");
  };

  const filtrosAtivos =
    (especialidade ? 1 : 0) + (uf ? 1 : 0) + (cidade ? 1 : 0) + (ano ? 1 : 0) + (busca ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar leads à lista: {listaNome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Busca + filtros */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Buscar por nome, telefone, especialidade..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 rounded-md border bg-muted/30">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Especialidade</Label>
                <Select value={especialidade || "all"} onValueChange={(v) => setEspecialidade(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">Todas</SelectItem>
                    {(filterMeta?.especialidades || []).filter((e) => e.id && e.nome).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">UF</Label>
                <Select value={uf || "all"} onValueChange={(v) => setUf(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">Todas</SelectItem>
                    {(filterMeta?.options.uf || []).map((u) => (
                      <SelectItem key={u} value={u}>{u.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cidade (contém)</Label>
                <Input
                  placeholder="Ex.: Florianópolis"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Ano de formatura</Label>
                <div className="flex gap-1">
                  <Select value={anoMode} onValueChange={(v) => setAnoMode(v as AnoMode)}>
                    <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="min">A partir</SelectItem>
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

          <div className="flex items-center justify-between text-sm flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground">
                {filtrados.length} disponíveis · {selecionados.size} selecionados
              </span>
              {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              {filtrosAtivos > 0 && (
                <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={limparFiltros}>
                  {filtrosAtivos} filtro(s) <X className="h-3 w-3" />
                </Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={toggleAll} disabled={filtrados.length === 0}>
              {selecionados.size === filtrados.length && filtrados.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0 rounded-md border">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhum lead disponível com os filtros atuais
              </div>
            ) : (
              <div className="divide-y">
                {filtrados.map((l: any) => {
                  const checked = selecionados.has(l.id);
                  const ano = l.data_formatura ? new Date(l.data_formatura).getFullYear() : null;
                  return (
                    <label
                      key={l.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
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
                        <p className="font-medium truncate">{l.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {l.phone_e164} · {l.especialidade || "-"} · {l.cidade || "-"}/{l.uf || "-"}
                          {ano ? ` · Form. ${ano}` : ""}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={selecionados.size === 0 || add.isPending}>
            {add.isPending ? "Adicionando..." : `Adicionar ${selecionados.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
