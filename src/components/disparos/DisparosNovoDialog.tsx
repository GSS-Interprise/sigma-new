import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DisparosNovoDialog({ open, onOpenChange }: Props) {
  const [campanhaId, setCampanhaId] = useState<string>("");
  const [propostaId, setPropostaId] = useState<string>("");
  const [chipId, setChipId] = useState<string>("");
  const qc = useQueryClient();

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setCampanhaId("");
      setPropostaId("");
      setChipId("");
    }
  }, [open]);

  // Campanhas ativas
  const { data: campanhas = [], isLoading: loadingCampanhas } = useQuery({
    queryKey: ["disparos-novo-campanhas-ativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas")
        .select("id, nome, status")
        .eq("status", "ativa")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Auto-select se houver apenas 1 campanha ativa
  useEffect(() => {
    if (open && campanhas.length === 1 && !campanhaId) {
      setCampanhaId(campanhas[0].id);
    }
  }, [open, campanhas, campanhaId]);

  // Propostas ativas da campanha
  const { data: propostas = [], isLoading: loadingPropostas } = useQuery({
    queryKey: ["disparos-novo-propostas-ativas", campanhaId],
    queryFn: async () => {
      if (!campanhaId) return [];
      const { data, error } = await supabase
        .from("campanha_propostas")
        .select("id, status, lista_id, proposta:proposta_id (id, nome, numero_proposta, observacoes)")
        .eq("campanha_id", campanhaId)
        .eq("status", "ativa")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!campanhaId,
  });

  // Auto-select proposta se houver apenas 1
  useEffect(() => {
    setPropostaId("");
    if (propostas.length === 1) {
      setPropostaId(propostas[0].id);
    }
  }, [propostas]);

  const propostaSelecionada = useMemo(
    () => propostas.find((p: any) => p.id === propostaId),
    [propostas, propostaId]
  );

  // Lista vinculada + contagem
  const { data: listaInfo } = useQuery({
    queryKey: ["disparos-novo-lista", propostaSelecionada?.lista_id],
    queryFn: async () => {
      const listaId = (propostaSelecionada as any)?.lista_id;
      if (!listaId) return null;
      const [{ data: lista }, { count }] = await Promise.all([
        supabase.from("disparo_listas").select("id, nome, descricao").eq("id", listaId).maybeSingle(),
        supabase
          .from("disparo_lista_itens")
          .select("id, leads:lead_id(phone_e164)", { count: "exact", head: false })
          .eq("lista_id", listaId),
      ]);
      const valid = (count ?? 0);
      return { lista, total: valid };
    },
    enabled: !!(propostaSelecionada as any)?.lista_id,
  });

  // Chips ativos
  const { data: chips = [] } = useQuery({
    queryKey: ["chips-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips").select("*").eq("status", "ativo").order("nome");
      if (error) throw error;
      return data;
    },
    enabled: open,
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
    enabled: open,
  });

  const criarMutation = useMutation({
    mutationFn: async () => {
      if (!campanhaId) throw new Error("Selecione uma campanha");
      if (!propostaId) throw new Error("Selecione uma proposta");
      const { data, error } = await supabase.rpc("gerar_disparo_zap", {
        p_campanha_proposta_id: propostaId,
        p_chip_id: chipId || null,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success(`Disparo criado: ${data?.inseridos ?? 0} novos, ${data?.ignorados ?? 0} ignorados`);
      qc.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      qc.invalidateQueries({ queryKey: ["disparos-contatos"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar disparo"),
  });

  const podeEnviar = !!campanhaId && !!propostaId && !criarMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Adicionar Disparo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Campanha */}
          <div className="space-y-2">
            <Label>
              Campanha <span className="text-destructive">*</span>
            </Label>
            <Select value={campanhaId} onValueChange={setCampanhaId} disabled={loadingCampanhas}>
              <SelectTrigger>
                <SelectValue placeholder={loadingCampanhas ? "Carregando..." : "Selecione uma campanha ativa"} />
              </SelectTrigger>
              <SelectContent>
                {campanhas.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
                {campanhas.length === 0 && !loadingCampanhas && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma campanha ativa</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Proposta */}
          <div className="space-y-2">
            <Label>
              Proposta <span className="text-destructive">*</span>
            </Label>
            <Select value={propostaId} onValueChange={setPropostaId} disabled={!campanhaId || loadingPropostas}>
              <SelectTrigger>
                <SelectValue placeholder={
                  !campanhaId ? "Selecione a campanha primeiro" :
                  loadingPropostas ? "Carregando..." :
                  propostas.length === 0 ? "Nenhuma proposta ativa" :
                  "Selecione uma proposta"
                } />
              </SelectTrigger>
              <SelectContent>
                {propostas.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.proposta?.codigo_proposta || p.proposta?.id?.slice(0, 8) || "Proposta"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {campanhaId && propostas.length > 1 && !propostaId && (
              <p className="text-xs text-muted-foreground">
                Esta campanha tem múltiplas propostas ativas. Selecione uma.
              </p>
            )}
          </div>

          {/* Preview da lista */}
          {propostaId && (
            <Card className="p-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                {(propostaSelecionada as any)?.lista_id ? (
                  listaInfo ? (
                    <div>
                      <div className="font-medium">{listaInfo.lista?.nome || "Lista"}</div>
                      <div className="text-xs text-muted-foreground">
                        {listaInfo.total} contato(s) na lista
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Carregando lista...</span>
                  )
                ) : (
                  <span className="text-destructive">
                    Esta proposta não tem lista de disparo vinculada.
                  </span>
                )}
              </div>
            </Card>
          )}

          {/* Chip */}
          <div className="space-y-2">
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
            <p className="text-xs text-muted-foreground">
              Status de envio (1-ENVIAR…06-BLOQUEADOR) e fallback de chip seguem o fluxo atual.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => criarMutation.mutate()} disabled={!podeEnviar}>
            {criarMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</>
            ) : (
              <><Plus className="h-4 w-4 mr-2" />Criar Disparo</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
