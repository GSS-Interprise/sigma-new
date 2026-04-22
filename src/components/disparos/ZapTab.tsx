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
            disabled={gerarMutation.isPending}
          >
            {gerarMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</>
            ) : (
              <><Plus className="h-4 w-4 mr-2" />Adicionar disparo Zap</>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cria contatos pendentes (1-ENVIAR) para os leads elegíveis desta proposta. O n8n consome a fila via GET <code className="bg-muted px-1 rounded">/disparos-zap-pendentes</code>.
        </p>
      </Card>

      <DisparosContatosPanel campanhaPropostaId={campanhaPropostaId} embedded />
    </div>
  );
}