import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { DisparosContatosPanel } from "./DisparosContatosPanel";

interface Props {
  campanhaPropostaId: string;
}

export function ZapTab({ campanhaPropostaId }: Props) {
  const [chipId, setChipId] = useState<string>("");
  const qc = useQueryClient();

  const { data: chips = [] } = useQuery({
    queryKey: ["chips-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips").select("*").eq("status", "ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: instanciasEmUso = [] } = useQuery({
    queryKey: ["disparos-instancias-em-uso"],
    queryFn: async () => {
      const { data } = await supabase
        .from("disparos_campanhas")
        .select("instancia, status, ativo")
        .not("instancia", "is", null);
      return Array.from(new Set(
        (data || [])
          .filter(r => r.ativo && !["concluido", "cancelado"].includes(r.status || ""))
          .map(r => r.instancia)
          .filter(Boolean) as string[]
      ));
    },
  });

  // Disparos ativos da proposta (apenas informativo — cada disparo é independente)
  const { data: disparosAtivos = [] } = useQuery({
    queryKey: ["disparos-ativos-proposta", campanhaPropostaId],
    queryFn: async () => {
      const { data: campanhas, error: e1 } = await supabase
        .from("disparos_campanhas")
        .select("id, instancia, chip_id, status, ativo")
        .eq("campanha_proposta_id", campanhaPropostaId)
        .eq("ativo", true)
        .not("status", "in", "(concluido,cancelado)");
      if (e1) throw e1;
      const ids = (campanhas || []).map(c => c.id);
      if (ids.length === 0) return [];
      const { data: contatos, error: e2 } = await supabase
        .from("disparos_contatos")
        .select("campanha_id, status")
        .in("campanha_id", ids)
        .in("status", ["1-ENVIAR", "2-AGENDADO", "3-TRATANDO"]);
      if (e2) throw e2;
      const pendentesPorCampanha = new Map<string, number>();
      (contatos || []).forEach(c => {
        pendentesPorCampanha.set(c.campanha_id, (pendentesPorCampanha.get(c.campanha_id) || 0) + 1);
      });
      return (campanhas || [])
        .map(c => ({
          id: c.id,
          instancia: c.instancia,
          chip_id: c.chip_id,
          pendentes: pendentesPorCampanha.get(c.id) || 0,
        }))
        .filter(c => c.pendentes > 0);
    },
    refetchInterval: 45000,
  });

  const chipSelecionado = chips.find((c: any) => c.id === chipId);
  const instanciaSelecionada = chipSelecionado?.instance_name || null;

  // Bloqueio: a única regra é que a mesma instância não esteja em outro disparo ativo (global)
  const chipBloqueadoGlobal = !!instanciaSelecionada && instanciasEmUso.includes(instanciaSelecionada);
  const semChipSelecionado = !chipId;
  const botaoBloqueado = semChipSelecionado || chipBloqueadoGlobal;

  const motivoBloqueio = semChipSelecionado
    ? "Selecione um chip para criar um novo disparo"
    : chipBloqueadoGlobal
      ? `Instância ${instanciaSelecionada} já está em uso em outro disparo ativo`
      : undefined;

  const gerarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("gerar_disparo_zap", {
        p_campanha_proposta_id: campanhaPropostaId,
        p_chip_id: chipId || null,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success(`Disparo gerado: ${data?.inseridos ?? 0} novos, ${data?.ignorados ?? 0} ignorados`);
      qc.invalidateQueries({ queryKey: ["disparos-contatos"] });
      qc.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      qc.invalidateQueries({ queryKey: ["disparo-em-andamento", campanhaPropostaId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label>Chip / Instância (opcional)</Label>
            <Select value={chipId} onValueChange={setChipId}>
              <SelectTrigger>
                <SelectValue placeholder="Sem chip selecionado" />
              </SelectTrigger>
              <SelectContent>
                {chips.map((chip: any) => {
                  const inst = chip.instance_name || null;
                  const blocked = !!inst && instanciasEmUso.includes(inst);
                  return (
                    <SelectItem key={chip.id} value={chip.id} disabled={blocked}>
                      {chip.nome} - {inst || chip.numero}{blocked ? " (em uso)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => gerarMutation.mutate()}
            disabled={gerarMutation.isPending || botaoBloqueado}
            title={motivoBloqueio}
          >
            {gerarMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</>
            ) : (
              <><Plus className="h-4 w-4 mr-2" />Adicionar disparo Zap</>
            )}
          </Button>
        </div>
        {disparosAtivos.length > 0 && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-medium">Disparos ativos nesta proposta ({disparosAtivos.length}):</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {disparosAtivos.map(d => (
                <li key={d.id}>
                  • <code className="bg-background px-1 rounded">{d.instancia || "sem instância"}</code> — {d.pendentes} pendente(s)
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Cada disparo é independente (até 120 msgs/dia por instância). A mesma instância não pode estar em dois disparos ativos ao mesmo tempo — escolha uma instância livre.
        </p>
      </Card>

      <DisparosContatosPanel campanhaPropostaId={campanhaPropostaId} embedded />
    </div>
  );
}