import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, ListChecks, Loader2, Plus, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImportarLeadsDialog } from "@/components/medicos/ImportarLeadsDialog";
import { StructuredLeadSearchDialog } from "./StructuredLeadSearchDialog";
import { useDisparoListas } from "@/hooks/useDisparoListas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string;
  campanhaNome: string;
}

type Source = "lista" | "importacao" | "base";

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;

  // O Supabase pode devolver PostgrestError como objeto serializado (por
  // exemplo, quando a falha atravessa uma mutation). Não esconda a causa
  // atrás de "Erro inesperado": ela é necessária para corrigir a operação.
  if (error && typeof error === "object") {
    const details = error as Record<string, unknown>;
    const message = [details.message, details.error_description, details.details, details.hint]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (message) return message;
    if (typeof details.code === "string" && details.code.trim()) return `Erro ${details.code}`;
  }

  return typeof error === "string" && error.trim() ? error : "Erro inesperado";
}

export function AdicionarMedicosCampanhaDialog({
  open,
  onOpenChange,
  campanhaId,
  campanhaNome,
}: Props) {
  const queryClient = useQueryClient();
  const { data: listas = [] } = useDisparoListas();
  const [strategyId, setStrategyId] = useState("");
  const [source, setSource] = useState<Source>("lista");
  const [listaId, setListaId] = useState("");
  const [newStrategyName, setNewStrategyName] = useState("");
  const [creatingStrategy, setCreatingStrategy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [nominalOpen, setNominalOpen] = useState(false);

  const { data: strategies = [] } = useQuery({
    queryKey: ["campaign-strategies-add-doctors", campanhaId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_strategies" as never)
        .select("id, nome, status, prioridade")
        .eq("campanha_id", campanhaId)
        .in("status", ["ativa", "rascunho"])
        .order("prioridade");
      if (error) throw error;
      return (data || []) as Array<{ id: string; nome: string; status: string; prioridade: number }>;
    },
  });

  useEffect(() => {
    if (!strategyId && strategies[0]?.id) setStrategyId(strategies[0].id);
  }, [strategies, strategyId]);

  useEffect(() => {
    if (!open) {
      setSource("lista");
      setListaId("");
      setNewStrategyName("");
      setCreatingStrategy(false);
      setImportOpen(false);
      setNominalOpen(false);
    }
  }, [open]);

  const createStrategy = useMutation({
    mutationFn: async () => {
      const nome = newStrategyName.trim();
      if (!nome) throw new Error("Informe o nome da estratégia");
      const { data, error } = await supabase
        .from("campaign_strategies" as never)
        .insert({
          campanha_id: campanhaId,
          nome,
          status: "rascunho",
          prioridade: (strategies.at(-1)?.prioridade ?? 0) + 10,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["campaign-strategies-add-doctors", campanhaId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-strategies", campanhaId] });
      setStrategyId(id);
      setNewStrategyName("");
      setCreatingStrategy(false);
      toast.success("Estratégia criada e selecionada");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const addList = useMutation({
    mutationFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        throw new Error("Sua sessão expirou. Saia e entre novamente no Sigma antes de adicionar a lista.");
      }

      const { data, error } = await supabase.rpc(
        "adicionar_lista_estrategia" as never,
        {
          p_campanha_id: campanhaId,
          p_strategy_id: strategyId,
          p_lista_id: listaId,
        } as never,
      );
      if (error) throw error;
      return data as { total_lista: number; adicionados: number; nao_adicionados: number };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campanha-leads", campanhaId] }),
        queryClient.invalidateQueries({ queryKey: ["campanhas-prospeccao"] }),
        queryClient.invalidateQueries({ queryKey: ["campanha-listas", campanhaId] }),
      ]);
      toast.success(`${result.adicionados} médico(s) adicionados à estratégia`);
      if (result.nao_adicionados > 0) {
        toast.info(`${result.nao_adicionados} já estavam na campanha ou não estavam elegíveis`);
      }
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const continueFlow = () => {
    if (!strategyId) return toast.error("Escolha ou crie uma estratégia");
    if (source === "lista") {
      if (!listaId) return toast.error("Escolha uma lista");
      addList.mutate();
      return;
    }
    if (source === "importacao") setImportOpen(true);
    if (source === "base") setNominalOpen(true);
  };

  return (
    <>
      <Dialog open={open && !importOpen && !nominalOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Adicionar médicos
            </DialogTitle>
            <DialogDescription>
              Escolha a origem e a estratégia para a campanha {campanhaNome}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Estratégia de destino</Label>
              <div className="flex flex-col gap-2 xs:flex-row">
                <Select value={strategyId} onValueChange={setStrategyId}>
                  <SelectTrigger className="min-h-11 flex-1">
                    <SelectValue placeholder="Escolha a estratégia" />
                  </SelectTrigger>
                  <SelectContent>
                    {strategies.map((strategy) => (
                      <SelectItem key={strategy.id} value={strategy.id}>
                        {strategy.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setCreatingStrategy((current) => !current)}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Nova estratégia
                </Button>
              </div>
              {creatingStrategy && (
                <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 xs:flex-row">
                  <Input
                    value={newStrategyName}
                    onChange={(event) => setNewStrategyName(event.target.value)}
                    placeholder="Ex.: Pediatras do Paraná"
                    className="min-h-11"
                  />
                  <Button
                    className="min-h-11 shrink-0"
                    onClick={() => createStrategy.mutate()}
                    disabled={!newStrategyName.trim() || createStrategy.isPending}
                  >
                    {createStrategy.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>De onde vêm os médicos?</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <SourceButton
                  active={source === "lista"}
                  icon={ListChecks}
                  title="Lista existente"
                  description="Usar uma lista já preparada"
                  onClick={() => setSource("lista")}
                />
                <SourceButton
                  active={source === "importacao"}
                  icon={FileSpreadsheet}
                  title="Nova planilha"
                  description="Importar e criar uma lista"
                  onClick={() => setSource("importacao")}
                />
                <SourceButton
                  active={source === "base"}
                  icon={Search}
                  title="Base do Sigma"
                  description="Selecionar nominalmente"
                  onClick={() => setSource("base")}
                />
              </div>
            </div>

            {source === "lista" && (
              <div className="space-y-2">
                <Label>Lista</Label>
                <Select value={listaId} onValueChange={setListaId}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue placeholder="Selecione uma lista" />
                  </SelectTrigger>
                  <SelectContent>
                    {listas.map((lista) => (
                      <SelectItem key={lista.id} value={lista.id}>{lista.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 xs:flex-row xs:justify-end">
              <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                className="min-h-11"
                onClick={continueFlow}
                disabled={!strategyId || addList.isPending}
              >
                {addList.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {source === "lista" ? "Adicionar lista" : "Continuar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImportarLeadsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        campanhaDestino={{ campanhaId, strategyId }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["campanha-leads", campanhaId] });
          queryClient.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
          onOpenChange(false);
        }}
      />

      <StructuredLeadSearchDialog
        open={nominalOpen}
        onOpenChange={setNominalOpen}
        campanhaId={campanhaId}
        strategyId={strategyId}
      />
    </>
  );
}

function SourceButton({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: typeof Search;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-24 rounded-lg border p-3 text-left transition-colors ${
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"
      }`}
    >
      <Icon className={`mb-2 h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
