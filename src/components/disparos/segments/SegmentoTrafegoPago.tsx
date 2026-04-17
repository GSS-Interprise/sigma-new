import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useCampanhaPropostaCanais } from "@/hooks/useCampanhaPropostaCanais";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  campanhaPropostaId: string;
}

export function SegmentoTrafegoPago({ campanhaPropostaId }: Props) {
  const { data: canais = [], isLoading, refetch } = useCampanhaPropostaCanais(campanhaPropostaId);
  const [reenviando, setReenviando] = useState(false);

  const registro = canais.find((c) => c.canal === "trafego_pago");

  const reenviar = async () => {
    setReenviando(true);
    try {
      // Limpa idempotência
      await supabase
        .from("campanha_propostas")
        .update({ webhook_trafego_enviado_at: null })
        .eq("id", campanhaPropostaId);
      const { error } = await supabase.functions.invoke("trafego-pago-auto-dispatch", {
        body: { campanha_proposta_id: campanhaPropostaId },
      });
      if (error) throw error;
      toast.success("Reenvio disparado");
      await refetch();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setReenviando(false);
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;

  const meta = registro?.metadados || {};

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Tráfego Pago
            </CardTitle>
            <CardDescription>
              Envio automático para webhook + Evolution API
            </CardDescription>
          </div>
          {registro && (
            <Badge
              variant={
                registro.status === "concluido"
                  ? "default"
                  : registro.status === "falha"
                  ? "destructive"
                  : "outline"
              }
            >
              {registro.status === "concluido" && <CheckCircle2 className="h-3 w-3 mr-1" />}
              {registro.status === "falha" && <XCircle className="h-3 w-3 mr-1" />}
              {registro.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Total contatos:</span>{" "}
            <strong>{meta.total ?? "—"}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Iniciado:</span>{" "}
            {registro?.iniciado_em
              ? new Date(registro.iniciado_em).toLocaleString("pt-BR")
              : "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Concluído:</span>{" "}
            {registro?.concluido_em
              ? new Date(registro.concluido_em).toLocaleString("pt-BR")
              : "—"}
          </div>
          <div>
            <span className="text-muted-foreground">HTTP webhook:</span>{" "}
            <strong>{meta.webhook?.status ?? "—"}</strong>
          </div>
        </div>
        {meta.aviso && (
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
            {meta.aviso}
          </div>
        )}
        {meta.webhook?.body && (
          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
            {meta.webhook.body}
          </pre>
        )}
        <Button onClick={reenviar} disabled={reenviando} size="sm" variant="outline">
          {reenviando ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Reenviar para tráfego pago
        </Button>
      </CardContent>
    </Card>
  );
}
