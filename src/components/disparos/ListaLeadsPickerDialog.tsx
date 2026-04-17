import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2 } from "lucide-react";
import { useAddLeadsToLista } from "@/hooks/useDisparoListas";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listaId: string;
  listaNome: string;
}

export function ListaLeadsPickerDialog({ open, onOpenChange, listaId, listaNome }: Props) {
  const [busca, setBusca] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const add = useAddLeadsToLista();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    if (!open) {
      setSelecionados(new Set());
      setBusca("");
      setDebounced("");
    }
  }, [open]);

  const { data: jaNaLista } = useQuery({
    queryKey: ["disparo-lista-itens-ids", listaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("disparo_lista_itens")
        .select("lead_id")
        .eq("lista_id", listaId);
      return new Set((data || []).map((r: any) => r.lead_id));
    },
    enabled: open,
  });

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads-picker", debounced],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("id, nome, phone_e164, especialidade, uf, cidade")
        .not("phone_e164", "is", null)
        .is("merged_into_id", null)
        .limit(200);
      if (debounced.trim()) {
        q = q.or(`nome.ilike.%${debounced}%,phone_e164.ilike.%${debounced}%,especialidade.ilike.%${debounced}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Adicionar leads à lista: {listaNome}</DialogTitle>
        </DialogHeader>

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

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {filtrados.length} disponíveis · {selecionados.size} selecionados
            </span>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selecionados.size === filtrados.length ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
          </div>

          <ScrollArea className="h-[400px] rounded-md border">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhum lead disponível
              </div>
            ) : (
              <div className="divide-y">
                {filtrados.map((l: any) => {
                  const checked = selecionados.has(l.id);
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
