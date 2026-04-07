import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, Link2, Building2, FileText, Calendar, DollarSign, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { registrarAuditoria } from "@/lib/auditLogger";

interface VincularContratoExistenteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rascunhoId: string;
  licitacaoId?: string;
  onSuccess?: (contratoId: string) => void;
}

export function VincularContratoExistenteDialog({
  open,
  onOpenChange,
  rascunhoId,
  licitacaoId,
  onSuccess,
}: VincularContratoExistenteDialogProps) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [contratoSelecionado, setContratoSelecionado] = useState<any>(null);

  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ["contratos-para-vincular", busca],
    queryFn: async () => {
      let query = supabase
        .from("contratos")
        .select("id, codigo_contrato, codigo_interno, objeto_contrato, cliente_id, data_inicio, data_fim, valor_estimado")
        .order("created_at", { ascending: false })
        .limit(50);

      if (busca.trim()) {
        query = query.or(
          `codigo_contrato.ilike.%${busca}%,objeto_contrato.ilike.%${busca}%,codigo_interno::text.ilike.%${busca}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Buscar nomes de clientes
  const clienteIds = [...new Set(contratos.map((c) => c.cliente_id).filter(Boolean))];
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-vincular", clienteIds],
    queryFn: async () => {
      if (clienteIds.length === 0) return [];
      const { data } = await supabase
        .from("clientes")
        .select("id, nome_empresa, nome_fantasia")
        .in("id", clienteIds as string[]);
      return data || [];
    },
    enabled: clienteIds.length > 0,
  });

  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c.nome_fantasia || c.nome_empresa]));

  const vincularMutation = useMutation({
    mutationFn: async () => {
      if (!contratoSelecionado) throw new Error("Selecione um contrato");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Buscar o rascunho para obter o pré-contrato automático vinculado
      const { data: rascunho } = await supabase
        .from("contrato_rascunho")
        .select("contrato_id, licitacao_id")
        .eq("id", rascunhoId)
        .maybeSingle();

      const preContratoId = rascunho?.contrato_id;

      // 2. Buscar o codigo_interno do pré-contrato automático
      let codigoInternoPreContrato: number | null = null;
      if (preContratoId && preContratoId !== contratoSelecionado.id) {
        const { data: preContrato } = await supabase
          .from("contratos")
          .select("codigo_interno")
          .eq("id", preContratoId)
          .maybeSingle();
        codigoInternoPreContrato = preContrato?.codigo_interno ?? null;
      }

      // 3. Marcar rascunho como consolidado vinculado ao contrato existente
      const { error: rascunhoError } = await supabase
        .from("contrato_rascunho")
        .update({
          status: "consolidado",
          contrato_id: contratoSelecionado.id,
          consolidado_em: new Date().toISOString(),
          consolidado_por: user.id,
        })
        .eq("id", rascunhoId);

      if (rascunhoError) throw rascunhoError;

      // 4. Transferir codigo_interno do pré-contrato para o contrato real e vincular licitação
      const updates: Record<string, any> = {};
      if (codigoInternoPreContrato !== null) {
        updates.codigo_interno = codigoInternoPreContrato;
      }
      if (licitacaoId) {
        const { data: contratoAtual } = await supabase
          .from("contratos")
          .select("licitacao_origem_id")
          .eq("id", contratoSelecionado.id)
          .maybeSingle();
        if (!contratoAtual?.licitacao_origem_id) {
          updates.licitacao_origem_id = licitacaoId;
        }
      }
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("contratos")
          .update(updates as any)
          .eq("id", contratoSelecionado.id);
      }

      // 5. Deletar o pré-contrato automático (já foi substituído pelo contrato real)
      if (preContratoId && preContratoId !== contratoSelecionado.id) {
        await supabase
          .from("contratos")
          .delete()
          .eq("id", preContratoId);
      }

      // 6. Log de auditoria
      await registrarAuditoria({
        modulo: "Contratos",
        tabela: "contrato_rascunho",
        acao: "editar",
        registroId: rascunhoId,
        registroDescricao: `Rascunho vinculado ao contrato existente ${contratoSelecionado.codigo_contrato || contratoSelecionado.id}`,
        detalhes: `Pré-contrato #${codigoInternoPreContrato} vinculado ao contrato #${contratoSelecionado.codigo_interno} → codigo_interno transferido, pré-contrato removido`,
      });

      return contratoSelecionado.id;
    },
    onSuccess: (contratoId) => {
      queryClient.invalidateQueries({ queryKey: ["contratos-rascunho"] });
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      queryClient.invalidateQueries({ queryKey: ["contratos-temporarios"] });
      toast.success("Pré-contrato vinculado ao contrato existente com sucesso!");
      onSuccess?.(contratoId);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao vincular contrato");
    },
  });

  const formatCurrency = (v: any) => {
    if (!v) return null;
    const num = typeof v === "string" ? parseFloat(v) : v;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Vincular a Contrato Existente
          </DialogTitle>
          <DialogDescription>
            Selecione um contrato existente para vinculá-lo a este pré-contrato. Os dados do contrato existente <strong>não serão alterados</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por código, objeto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {/* Lista */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : contratos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Nenhum contrato encontrado</p>
          ) : (
            <div className="space-y-2 pr-2">
              {contratos.map((contrato) => {
                const selecionado = contratoSelecionado?.id === contrato.id;
                return (
                  <div
                    key={contrato.id}
                    onClick={() => setContratoSelecionado(selecionado ? null : contrato)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selecionado
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {contrato.codigo_contrato && (
                            <span className="font-semibold text-sm">{contrato.codigo_contrato}</span>
                          )}
                          {contrato.codigo_interno && (
                            <Badge variant="outline" className="text-xs">#{contrato.codigo_interno}</Badge>
                          )}
                        </div>

                        {contrato.cliente_id && clienteMap[contrato.cliente_id] && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {clienteMap[contrato.cliente_id]}
                          </div>
                        )}

                        {contrato.objeto_contrato && (
                          <div className="flex items-start gap-1 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{contrato.objeto_contrato}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {contrato.data_inicio && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(contrato.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
                              {contrato.data_fim && ` → ${format(new Date(contrato.data_fim), "dd/MM/yyyy", { locale: ptBR })}`}
                            </span>
                          )}
                          {contrato.valor_estimado && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {formatCurrency(contrato.valor_estimado)}
                            </span>
                          )}
                        </div>
                      </div>

                      {selecionado && (
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <Separator />

        {/* Aviso importante */}
        {contratoSelecionado && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            ⚠️ O contrato <strong>{contratoSelecionado.codigo_contrato || `#${contratoSelecionado.codigo_interno}`}</strong> será vinculado a este pré-contrato. <strong>Nenhum dado do contrato será alterado.</strong>
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!contratoSelecionado || vincularMutation.isPending}
            onClick={() => vincularMutation.mutate()}
          >
            {vincularMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Vinculando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Vincular Contrato
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
