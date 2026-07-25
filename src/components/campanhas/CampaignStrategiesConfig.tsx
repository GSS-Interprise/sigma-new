import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface Props {
  campanhaId: string;
}

interface Strategy {
  id: string;
  nome: string;
  descricao: string | null;
  status: "rascunho" | "ativa" | "pausada" | "finalizada";
  prioridade: number;
  publico_alvo: { descricao?: string } | null;
  ordem_regioes: Array<{ uf: string; ordem: number }> | null;
  abordagem: string | null;
  inicio_em: string | null;
  fim_em: string | null;
}

const STATUS_META: Record<Strategy["status"], { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-slate-50 text-slate-700" },
  ativa: { label: "Ativa", className: "bg-emerald-50 text-emerald-700" },
  pausada: { label: "Pausada", className: "bg-amber-50 text-amber-700" },
  finalizada: { label: "Finalizada", className: "bg-slate-100 text-slate-600" },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado";
}

export function CampaignStrategiesConfig({ campanhaId }: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState("");
  const [publico, setPublico] = useState("");
  const [regioes, setRegioes] = useState("");
  const [abordagem, setAbordagem] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  const queryKey = ["campaign-strategies", campanhaId];
  const { data: strategies = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_strategies" as never)
        .select("id, nome, descricao, status, prioridade, publico_alvo, ordem_regioes, abordagem, inicio_em, fim_em")
        .eq("campanha_id", campanhaId)
        .order("prioridade");
      if (error) throw error;
      return (data ?? []) as Strategy[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const ordemRegioes = regioes
        .split(",")
        .map((uf) => uf.trim().toUpperCase())
        .filter(Boolean)
        .map((uf, index) => ({ uf, ordem: index + 1 }));
      const prioridade = (strategies.at(-1)?.prioridade || 0) + 10;
      const { error } = await supabase.from("campaign_strategies" as never).insert({
        campanha_id: campanhaId,
        nome: nome.trim(),
        status: "rascunho",
        prioridade,
        publico_alvo: { descricao: publico.trim() },
        ordem_regioes: ordemRegioes,
        abordagem: abordagem.trim() || null,
        inicio_em: inicio ? new Date(inicio).toISOString() : null,
        fim_em: fim ? new Date(fim).toISOString() : null,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Estratégia criada");
      setShowForm(false);
      setNome("");
      setPublico("");
      setRegioes("");
      setAbordagem("");
      setInicio("");
      setFim("");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Strategy["status"] }) => {
      const { error } = await supabase
        .from("campaign_strategies" as never)
        .update({ status } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando estratégias...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-primary" />
            Estratégias da campanha
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Compare públicos e abordagens sem duplicar a oportunidade.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
          onClick={() => setShowForm((current) => !current)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova estratégia
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="strategy-name">Nome</Label>
            <Input
              id="strategy-name"
              className="min-h-11"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Ex.: Sul — intensivistas"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-audience">Público-alvo</Label>
            <Textarea
              id="strategy-audience"
              value={publico}
              onChange={(event) => setPublico(event.target.value)}
              placeholder="Especialidade, disponibilidade, perfil e demais critérios"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-regions">Ordem de regiões</Label>
            <Input
              id="strategy-regions"
              className="min-h-11"
              value={regioes}
              onChange={(event) => setRegioes(event.target.value)}
              placeholder="SC, PR, RS"
            />
            <p className="text-xs text-muted-foreground">A ordem informada será preservada na fila.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-approach">Abordagem</Label>
            <Textarea
              id="strategy-approach"
              value={abordagem}
              onChange={(event) => setAbordagem(event.target.value)}
              placeholder="Mensagem ou linha de abordagem que será testada"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              Início
              <Input
                type="datetime-local"
                className="min-h-11"
                value={inicio}
                onChange={(event) => setInicio(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Fim
              <Input
                type="datetime-local"
                className="min-h-11"
                value={fim}
                min={inicio || undefined}
                onChange={(event) => setFim(event.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={!nome.trim() || criar.isPending}
              onClick={() => criar.mutate()}
            >
              {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar estratégia
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {strategies.map((strategy) => {
          const meta = STATUS_META[strategy.status];
          return (
            <article key={strategy.id} className="rounded-lg border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium">{strategy.nome}</h4>
                    <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                  </div>
                  {strategy.publico_alvo?.descricao && (
                    <p className="mt-2 text-sm text-muted-foreground">{strategy.publico_alvo.descricao}</p>
                  )}
                  {strategy.ordem_regioes && strategy.ordem_regioes.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Ordem: {strategy.ordem_regioes.map((region) => region.uf).join(" → ")}
                    </p>
                  )}
                  {strategy.abordagem && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      Abordagem: {strategy.abordagem}
                    </p>
                  )}
                </div>
                <select
                  aria-label={`Status de ${strategy.nome}`}
                  className="min-h-11 rounded-md border bg-background px-3 text-sm"
                  value={strategy.status}
                  disabled={mudarStatus.isPending}
                  onChange={(event) =>
                    mudarStatus.mutate({
                      id: strategy.id,
                      status: event.target.value as Strategy["status"],
                    })
                  }
                >
                  {Object.entries(STATUS_META).map(([value, status]) => (
                    <option key={value} value={value}>{status.label}</option>
                  ))}
                </select>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
