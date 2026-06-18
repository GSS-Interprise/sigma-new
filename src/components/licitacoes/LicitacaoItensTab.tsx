import { useMemo, useState } from "react";
import { useLicitacaoItens, type LicitacaoItem } from "@/hooks/useLicitacaoItens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Package, Download } from "lucide-react";
import { toast } from "sonner";

interface Props {
  licitacaoId: string;
  readOnly?: boolean;
}

const formatBRL = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export function LicitacaoItensTab({ licitacaoId, readOnly = false }: Props) {
  const { data: itens = [], isLoading, create, update, remove } = useLicitacaoItens(licitacaoId);
  const [novoLote, setNovoLote] = useState("");

  // Agrupa por lote
  const grupos = useMemo(() => {
    const map = new Map<string, LicitacaoItem[]>();
    for (const item of itens) {
      const key = item.lote || "__sem_lote__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [itens]);

  const totalGeral = useMemo(
    () =>
      itens.reduce(
        (acc, it) => acc + (Number(it.vlr_total_estimavel) || 0),
        0
      ),
    [itens]
  );

  const addItem = (lote: string | null) => {
    if (readOnly) return;
    create.mutate({
      lote,
      numero_item: String((itens.filter((i) => (i.lote || null) === lote).length || 0) + 1),
      descricao: "",
      unidade_medida: "",
      qnt_unit_total: null,
      qnt_valor_und: null,
    });
  };

  const addLote = () => {
    if (readOnly) return;
    const lote = novoLote.trim() || `Lote ${grupos.filter(([k]) => k !== "__sem_lote__").length + 1}`;
    create.mutate({
      lote,
      numero_item: "1",
      descricao: "",
      unidade_medida: "",
    });
    setNovoLote("");
  };

  const exportCSV = () => {
    const header = ["Lote", "Nº", "Descrição", "Unidade", "Quantidade", "Valor Unit.", "Valor Total"];
    const lines = [header.join(";")];
    for (const it of itens) {
      lines.push(
        [
          it.lote ?? "",
          it.numero_item ?? "",
          (it.descricao ?? "").replace(/[\r\n;]/g, " "),
          it.unidade_medida ?? "",
          it.qnt_unit_total ?? "",
          it.qnt_valor_und ?? "",
          it.vlr_total_estimavel ?? "",
        ].join(";")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `licitacao-itens-${licitacaoId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  return (
    <ScrollArea className="h-full px-3 py-2">
      {/* Barra de ações */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Input
            value={novoLote}
            onChange={(e) => setNovoLote(e.target.value)}
            placeholder="Novo lote (ex: Lote 1)"
            className="h-8 w-48 text-xs"
            disabled={readOnly}
          />
          <Button size="sm" variant="outline" className="h-8" onClick={addLote} disabled={readOnly}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar lote
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => addItem(null)} disabled={readOnly}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Item sem lote
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Total estimado: <strong className="text-foreground">{formatBRL(totalGeral)}</strong>
          </span>
          <Button size="sm" variant="ghost" className="h-8" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground py-8 text-center">Carregando itens…</p>
      )}

      {!isLoading && itens.length === 0 && (
        <div className="text-center py-10 text-muted-foreground border border-dashed rounded-md">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum item cadastrado</p>
          <p className="text-xs">Use os botões acima para adicionar um lote ou item avulso.</p>
        </div>
      )}

      {grupos.map(([lote, lista]) => (
        <div key={lote} className="mb-4 border rounded-md overflow-hidden">
          <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5 border-b">
            <h4 className="text-xs font-semibold">
              {lote === "__sem_lote__" ? "Sem lote" : lote}
              <span className="ml-2 text-muted-foreground font-normal">
                ({lista.length} {lista.length === 1 ? "item" : "itens"})
              </span>
            </h4>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              disabled={readOnly}
              onClick={() => addItem(lote === "__sem_lote__" ? null : lote)}
            >
              <Plus className="h-3 w-3 mr-1" /> Item
            </Button>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted/20">
              <tr className="text-left text-muted-foreground">
                <th className="px-2 py-1 w-12">Nº</th>
                <th className="px-2 py-1">Descrição</th>
                <th className="px-2 py-1 w-20">Und</th>
                <th className="px-2 py-1 w-24">Qtd</th>
                <th className="px-2 py-1 w-28">Vlr Unit.</th>
                <th className="px-2 py-1 w-28">Vlr Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  readOnly={readOnly}
                  onPatch={(patch) => update.mutate({ id: item.id, patch })}
                  onDelete={() => remove.mutate(item.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </ScrollArea>
  );
}

function ItemRow({
  item,
  readOnly,
  onPatch,
  onDelete,
}: {
  item: LicitacaoItem;
  readOnly: boolean;
  onPatch: (patch: Partial<LicitacaoItem>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(item);

  // Debounce manual via blur
  const commit = (patch: Partial<LicitacaoItem>) => {
    onPatch(patch);
  };

  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  return (
    <tr className="border-t">
      <td className="px-2 py-1">
        <Input
          value={local.numero_item ?? ""}
          disabled={readOnly}
          onChange={(e) => setLocal({ ...local, numero_item: e.target.value })}
          onBlur={() => local.numero_item !== item.numero_item && commit({ numero_item: local.numero_item })}
          className="h-7 text-xs px-1"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={local.descricao ?? ""}
          disabled={readOnly}
          onChange={(e) => setLocal({ ...local, descricao: e.target.value })}
          onBlur={() => local.descricao !== item.descricao && commit({ descricao: local.descricao })}
          className="h-7 text-xs px-2"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={local.unidade_medida ?? ""}
          disabled={readOnly}
          onChange={(e) => setLocal({ ...local, unidade_medida: e.target.value })}
          onBlur={() =>
            local.unidade_medida !== item.unidade_medida && commit({ unidade_medida: local.unidade_medida })
          }
          className="h-7 text-xs px-1"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          type="number"
          step="0.0001"
          value={local.qnt_unit_total ?? ""}
          disabled={readOnly}
          onChange={(e) =>
            setLocal({ ...local, qnt_unit_total: numOrNull(e.target.value) as any })
          }
          onBlur={() =>
            local.qnt_unit_total !== item.qnt_unit_total &&
            commit({ qnt_unit_total: local.qnt_unit_total })
          }
          className="h-7 text-xs px-1"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          type="number"
          step="0.0001"
          value={local.qnt_valor_und ?? ""}
          disabled={readOnly}
          onChange={(e) =>
            setLocal({ ...local, qnt_valor_und: numOrNull(e.target.value) as any })
          }
          onBlur={() =>
            local.qnt_valor_und !== item.qnt_valor_und &&
            commit({ qnt_valor_und: local.qnt_valor_und })
          }
          className="h-7 text-xs px-1"
        />
      </td>
      <td className="px-2 py-1 text-muted-foreground tabular-nums">
        {item.vlr_total_estimavel === null || item.vlr_total_estimavel === undefined
          ? "—"
          : new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(Number(item.vlr_total_estimavel))}
      </td>
      <td className="px-1 py-1 text-right">
        {!readOnly && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </td>
    </tr>
  );
}