import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Loader2 } from "lucide-react";
import { registrarAuditoria } from "@/lib/auditLogger";

interface LeadBulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arquivoNome: string;
  totalLeads: number;
}

const EDITABLE_FIELDS = [
  { key: "especialidade", label: "Especialidade" },
  { key: "uf", label: "UF (Estado)" },
  { key: "cidade", label: "Cidade" },
  { key: "origem", label: "Origem" },
  { key: "status", label: "Status" },
] as const;

type EditableField = typeof EDITABLE_FIELDS[number]["key"];

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const STATUS_OPTIONS = [
  "Novo",
  "Acompanhamento",
  "Aprovados",
  "Convertido",
  "Descartado",
  "em_conversa",
];

export function LeadBulkEditDialog({ open, onOpenChange, arquivoNome, totalLeads }: LeadBulkEditDialogProps) {
  const queryClient = useQueryClient();
  const [selectedFields, setSelectedFields] = useState<Set<EditableField>>(new Set());
  const [values, setValues] = useState<Record<EditableField, string>>({
    especialidade: "",
    uf: "",
    cidade: "",
    origem: "",
    status: "",
  });
  const [confirmed, setConfirmed] = useState(false);

  // Busca exaustiva paginada para ultrapassar limite de 1000 registros
  const fetchAllDistinct = async (column: "especialidade" | "origem" | "cidade") => {
    const PAGE_SIZE = 1000;
    const allValues = new Set<string>();
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data } = await supabase
        .from("leads")
        .select(column)
        .not(column, "is", null)
        .neq(column, "")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (!data || data.length === 0) break;

      data.forEach((d: any) => {
        const val = d[column]?.trim();
        if (val) allValues.add(val);
      });

      hasMore = data.length === PAGE_SIZE;
      page++;
    }

    return [...allValues].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  };

  const { data: especialidadeOptions = [] } = useQuery({
    queryKey: ["leads-distinct-especialidade"],
    queryFn: () => fetchAllDistinct("especialidade"),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  const { data: origemOptions = [] } = useQuery({
    queryKey: ["leads-distinct-origem"],
    queryFn: () => fetchAllDistinct("origem"),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  const { data: cidadeOptions = [] } = useQuery({
    queryKey: ["leads-distinct-cidade"],
    queryFn: () => fetchAllDistinct("cidade"),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  const toggleField = (field: EditableField) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const updateValue = (field: EditableField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const getOptionsForField = (field: EditableField): string[] => {
    switch (field) {
      case "especialidade": return especialidadeOptions;
      case "uf": return UF_OPTIONS;
      case "cidade": return cidadeOptions;
      case "origem": return origemOptions;
      case "status": return STATUS_OPTIONS;
      default: return [];
    }
  };

  const getPlaceholder = (field: EditableField): string => {
    switch (field) {
      case "especialidade": return "Selecione a especialidade";
      case "uf": return "Selecione o estado";
      case "cidade": return "Selecione a cidade";
      case "origem": return "Selecione a origem";
      case "status": return "Selecione o status";
      default: return "Selecione...";
    }
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async () => {
      const fieldsToUpdate: Record<string, string> = {};
      selectedFields.forEach((field) => {
        if (values[field].trim()) {
          fieldsToUpdate[field] = values[field].trim();
        }
      });

      if (Object.keys(fieldsToUpdate).length === 0) {
        throw new Error("Selecione ao menos um campo e preencha o valor.");
      }

      const FETCH_SIZE = 500;
      const UPDATE_BATCH = 100;
      let totalUpdated = 0;
      let lastId = '';
      let hasMore = true;

      // Cursor-based pagination (much more reliable than offset/range)
      while (hasMore) {
        let query = supabase
          .from("leads")
          .select("id")
          .eq("arquivo_id", arquivoNome)
          .order("id", { ascending: true })
          .limit(FETCH_SIZE);

        if (lastId) {
          query = query.gt("id", lastId);
        }

        const { data: batch, error: fetchError } = await query;

        if (fetchError) {
          console.error("Erro ao buscar lote:", fetchError);
          throw fetchError;
        }
        if (!batch || batch.length === 0) {
          break;
        }

        // Track last ID for cursor pagination
        lastId = batch[batch.length - 1].id;

        // Update in smaller sub-batches to avoid Bad Request
        for (let i = 0; i < batch.length; i += UPDATE_BATCH) {
          const subBatch = batch.slice(i, i + UPDATE_BATCH);
          const ids = subBatch.map((b) => b.id);

          const { error: updateError } = await supabase
            .from("leads")
            .update(fieldsToUpdate)
            .in("id", ids);

          if (updateError) {
            console.error(`Erro ao atualizar sub-lote (${i}-${i + subBatch.length}):`, updateError);
            throw updateError;
          }
          totalUpdated += ids.length;
        }

        console.log(`✅ Lote processado: ${batch.length} registros (total: ${totalUpdated})`);
        hasMore = batch.length === FETCH_SIZE;
      }

      console.log(`🎯 Edição em massa finalizada: ${totalUpdated} leads atualizados`);

      await registrarAuditoria({
        modulo: "Leads",
        tabela: "leads",
        acao: "editar",
        registroId: arquivoNome,
        registroDescricao: `Edição em massa de ${totalUpdated} leads do arquivo "${arquivoNome}"`,
        dadosNovos: fieldsToUpdate,
        camposAlterados: Object.keys(fieldsToUpdate),
        detalhes: `Campos alterados: ${Object.entries(fieldsToUpdate).map(([k, v]) => `${k} → "${v}"`).join(", ")}`,
      });

      return totalUpdated;
    },
    onSuccess: (count) => {
      toast.success(`${count} leads atualizados com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["leads-filter-counts-v2"] });
      handleClose();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar leads");
    },
  });

  const handleClose = () => {
    setSelectedFields(new Set());
    setValues({ especialidade: "", uf: "", cidade: "", origem: "", status: "" });
    setConfirmed(false);
    onOpenChange(false);
  };

  const hasValidSelection = Array.from(selectedFields).some((f) => values[f]?.trim());

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edição em Massa
          </DialogTitle>
          <DialogDescription>
            Alterar campos de <strong>{totalLeads.toLocaleString()}</strong> leads do arquivo: <strong>{arquivoNome}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Marque os campos que deseja alterar e selecione o novo valor. Todos os leads dessa importação serão atualizados.
          </p>

          {EDITABLE_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex items-start gap-3">
              <Checkbox
                id={`field-${key}`}
                checked={selectedFields.has(key)}
                onCheckedChange={() => toggleField(key)}
                className="mt-2"
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor={`field-${key}`} className="cursor-pointer font-medium">
                  {label}
                </Label>
                {selectedFields.has(key) && (
                  <Select value={values[key]} onValueChange={(v) => updateValue(key, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={getPlaceholder(key)} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {getOptionsForField(key).map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          ))}

          {hasValidSelection && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Atenção!</p>
                <p>
                  Essa ação alterará{" "}
                  <strong>{totalLeads.toLocaleString()} leads</strong> de uma vez. Essa ação não pode ser desfeita facilmente.
                </p>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <Checkbox
                    checked={confirmed}
                    onCheckedChange={(c) => setConfirmed(!!c)}
                  />
                  <span>Confirmo que desejo alterar todos os leads dessa importação</span>
                </label>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => bulkUpdateMutation.mutate()}
              disabled={!hasValidSelection || !confirmed || bulkUpdateMutation.isPending}
            >
              {bulkUpdateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Atualizando...
                </>
              ) : (
                `Atualizar ${totalLeads.toLocaleString()} leads`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
