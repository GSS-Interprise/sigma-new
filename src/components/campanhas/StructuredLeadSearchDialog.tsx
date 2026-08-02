import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string;
  strategyId: string;
}

interface SearchCriteria {
  busca: string;
  uf: string;
  cidade: string;
  especialidade: string;
  modalidade: string;
  regiaoInteresse: string;
  disponibilidadeMin: string;
  valorMinimoAte: string;
}

interface SearchRow {
  lead_id: string;
  nome: string;
  crm: string | null;
  phone_e164: string | null;
  uf: string | null;
  cidade: string | null;
  especialidade: string | null;
  modalidades: string[] | null;
  ufs_interesse: string[] | null;
  cidades_interesse: string[] | null;
  disponibilidade_plantoes_mes: number | null;
  valor_minimo_aceitavel: number | null;
}

const EMPTY: SearchCriteria = {
  busca: "",
  uf: "",
  cidade: "",
  especialidade: "",
  modalidade: "",
  regiaoInteresse: "",
  disponibilidadeMin: "",
  valorMinimoAte: "",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado";
}

export function StructuredLeadSearchDialog({
  open,
  onOpenChange,
  campanhaId,
  strategyId,
}: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SearchCriteria>(EMPTY);
  const [criteria, setCriteria] = useState<SearchCriteria>(EMPTY);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryKey = ["structured-lead-search", campanhaId, criteria];

  const { data: rows = [], isFetching } = useQuery({
    queryKey,
    enabled: open && !!strategyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "buscar_leads_perfil" as never,
        {
          p_campanha_id: campanhaId,
          p_busca: criteria.busca.trim() || null,
          p_uf: criteria.uf.trim() || null,
          p_cidade: criteria.cidade.trim() || null,
          p_especialidade: criteria.especialidade.trim() || null,
          p_modalidade: criteria.modalidade.trim() || null,
          p_regiao_interesse: criteria.regiaoInteresse.trim() || null,
          p_disponibilidade_min: criteria.disponibilidadeMin
            ? Number(criteria.disponibilidadeMin)
            : null,
          p_valor_minimo_ate: criteria.valorMinimoAte
            ? Number(criteria.valorMinimoAte)
            : null,
          p_limite: 100,
          p_offset: 0,
        } as never,
      );
      if (error) throw error;
      return (data ?? []) as SearchRow[];
    },
  });

  const selectedVisible = useMemo(
    () => rows.filter((row) => selected.has(row.lead_id)).length,
    [rows, selected],
  );

  const adicionar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        "adicionar_leads_estrategia" as never,
        {
          p_campanha_id: campanhaId,
          p_strategy_id: strategyId,
          p_lead_ids: Array.from(selected),
        } as never,
      );
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: async (count) => {
      toast.success(`${count} médico(s) adicionado(s) à estratégia`);
      setSelected(new Set());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campanha-leads", campanhaId] }),
        queryClient.invalidateQueries({ queryKey: ["campanhas-prospeccao"] }),
        queryClient.invalidateQueries({ queryKey }),
      ]);
      if (count > 0) onOpenChange(false);
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const patchDraft = (key: keyof SearchCriteria, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar médicos para a estratégia
          </DialogTitle>
          <DialogDescription>
            Busca por cadastro e pelo perfil de interesse extraído das conversas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Filter label="Nome, CRM ou telefone" value={draft.busca} onChange={(value) => patchDraft("busca", value)} />
          <Filter label="UF atual" value={draft.uf} onChange={(value) => patchDraft("uf", value)} placeholder="Ex.: SC" />
          <Filter label="Cidade atual" value={draft.cidade} onChange={(value) => patchDraft("cidade", value)} />
          <Filter label="Especialidade" value={draft.especialidade} onChange={(value) => patchDraft("especialidade", value)} />
          <Filter label="Modalidade/contratação" value={draft.modalidade} onChange={(value) => patchDraft("modalidade", value)} placeholder="Ex.: PJ" />
          <Filter label="Região de interesse" value={draft.regiaoInteresse} onChange={(value) => patchDraft("regiaoInteresse", value)} placeholder="UF ou cidade" />
          <Filter label="Plantões/mês (mín.)" type="number" value={draft.disponibilidadeMin} onChange={(value) => patchDraft("disponibilidadeMin", value)} />
          <Filter label="Valor mínimo aceitável até" type="number" value={draft.valorMinimoAte} onChange={(value) => patchDraft("valorMinimoAte", value)} />
          <div className="sm:col-span-2 lg:col-span-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setDraft(EMPTY);
                setCriteria(EMPTY);
                setSelected(new Set());
              }}
            >
              Limpar
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => {
                setCriteria({ ...draft });
                setSelected(new Set());
              }}
            >
              <Search className="mr-2 h-4 w-4" />
              Aplicar filtros
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded-lg border">
          {isFetching ? (
            <div className="flex min-h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Buscando...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              Nenhum médico elegível com esses filtros.
            </div>
          ) : (
            <table className="w-full min-w-[980px] text-sm">
              <thead className="sticky top-0 border-b bg-background text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-12 px-3 py-2">
                    <Checkbox
                      checked={selectedVisible === rows.length && rows.length > 0}
                      onCheckedChange={(checked) =>
                        setSelected(checked ? new Set(rows.map((row) => row.lead_id)) : new Set())
                      }
                      aria-label="Selecionar todos os médicos visíveis"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Médico</th>
                  <th className="px-3 py-2 font-medium">Local</th>
                  <th className="px-3 py-2 font-medium">Perfil</th>
                  <th className="px-3 py-2 font-medium">Disponibilidade</th>
                  <th className="px-3 py-2 font-medium">Valor mínimo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.lead_id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/20"
                    onClick={() => {
                      // A linha inteira vira um alvo de toque confiável; o checkbox de 16px
                      // isolado era difícil de acionar em navegadores mobile e na automação.
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(row.lead_id)) next.delete(row.lead_id);
                        else next.add(row.lead_id);
                        return next;
                      });
                    }}
                  >
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selected.has(row.lead_id)}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) => {
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked === true) next.add(row.lead_id);
                            else next.delete(row.lead_id);
                            return next;
                          });
                        }}
                        aria-label={`Selecionar ${row.nome}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{row.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.crm ? `CRM ${row.crm}` : "CRM não informado"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {[row.cidade, row.uf].filter(Boolean).join("/") || "—"}
                      {(row.ufs_interesse?.length || row.cidades_interesse?.length) ? (
                        <p className="mt-1 text-muted-foreground">
                          Interesse: {[...(row.cidades_interesse || []), ...(row.ufs_interesse || [])].join(", ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs">{row.especialidade || "—"}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.modalidades?.map((modalidade) => (
                          <Badge key={modalidade} variant="outline" className="text-[10px]">
                            {modalidade}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {row.disponibilidade_plantoes_mes ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {row.valor_minimo_aceitavel != null
                        ? row.valor_minimo_aceitavel.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <span className="mr-auto text-xs text-muted-foreground">
            {selected.size} selecionado(s) · até 100 resultados por busca
          </span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={selected.size === 0 || adicionar.isPending}
            onClick={() => adicionar.mutate()}
          >
            {adicionar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Adicionar selecionados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Filter({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="space-y-1.5 text-xs font-medium">
      <Label>{label}</Label>
      <Input
        type={type}
        className="min-h-11"
        value={value}
        min={type === "number" ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
