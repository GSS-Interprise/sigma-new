import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface VincularCampanhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: { lead_id: string; nome: string; phone_e164: string | null }[];
}

export function VincularCampanhaDialog({ open, onOpenChange, leads }: VincularCampanhaDialogProps) {
  const queryClient = useQueryClient();
  const [selectedCampanhaId, setSelectedCampanhaId] = useState<string>("");

  const { data: campanhas, isLoading: loadingCampanhas } = useQuery({
    queryKey: ["disparos-campanhas-ativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparos_campanhas")
        .select("id, nome, status, total_contatos, enviados, responsavel_nome, created_at")
        .in("status", ["em_andamento", "pausado", "pendente"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const vincularMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCampanhaId) throw new Error("Selecione uma campanha");

      // Build contatos to insert
      const contatos = leads.map((lead) => ({
        campanha_id: selectedCampanhaId,
        nome: lead.nome,
        telefone_e164: lead.phone_e164 || "",
        telefone_original: lead.phone_e164 || "",
        lead_id: lead.lead_id,
        status: "0-PENDENTE",
      }));

      const { error } = await supabase
        .from("disparos_contatos")
        .insert(contatos as any);
      if (error) throw error;

      // Update total_contatos on the campaign
      const campanha = campanhas?.find((c) => c.id === selectedCampanhaId);
      if (campanha) {
        await supabase
          .from("disparos_campanhas")
          .update({ total_contatos: (campanha.total_contatos || 0) + leads.length } as any)
          .eq("id", selectedCampanhaId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas-ativas"] });
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      toast.success(`${leads.length} lead(s) vinculado(s) à campanha com sucesso`);
      setSelectedCampanhaId("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao vincular leads: " + error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular a Campanha de Disparo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{leads.length} lead(s) selecionado(s)</Badge>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Campanha</label>
            {loadingCampanhas ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando campanhas...
              </div>
            ) : !campanhas?.length ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma campanha ativa encontrada. Crie uma campanha em Disparos Zap primeiro.
              </p>
            ) : (
              <Select value={selectedCampanhaId} onValueChange={setSelectedCampanhaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma campanha..." />
                </SelectTrigger>
                <SelectContent>
                  {campanhas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <span>{c.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          ({c.total_contatos || 0} contatos)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => vincularMutation.mutate()}
            disabled={!selectedCampanhaId || vincularMutation.isPending}
          >
            {vincularMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Vincular {leads.length} lead(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
