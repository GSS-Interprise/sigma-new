import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, RefreshCw, CheckCircle2, UserCheck, AlertTriangle, Lightbulb } from "lucide-react";
import { toast } from "sonner";

type Resumo = {
  resumo_executivo?: string;
  o_que_funcionou?: string;
  perfil_melhor?: string;
  objecoes?: string[];
  ajuste_sugerido?: string;
};
type Metricas = { total?: number; responderam?: number; convertidos?: number; taxa_resposta_pct?: number; taxa_conversao_pct?: number };

export function CampanhaResumoIaDialog({
  campanhaId,
  nome,
  open,
  onOpenChange,
}: {
  campanhaId: string;
  nome: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);

  // Busca o último resumo salvo (cache) ao abrir
  const carregarCache = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("campanha_resumos")
      .select("resumo, metricas, created_at")
      .eq("campanha_id", campanhaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setResumo(data.resumo);
      setMetricas(data.metricas);
      setGeradoEm(data.created_at);
    }
  }, [campanhaId]);

  const gerar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("campanha-resumo-ia", { body: { campanha_id: campanhaId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao gerar resumo");
      setResumo(data.resumo);
      setMetricas(data.metricas);
      setGeradoEm(data.created_at);
      toast.success("Resumo gerado");
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [campanhaId]);

  useEffect(() => {
    if (open) {
      setResumo(null);
      setMetricas(null);
      setGeradoEm(null);
      carregarCache();
    }
  }, [open, carregarCache]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Resumo executivo — {nome}
          </DialogTitle>
        </DialogHeader>

        {metricas && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { l: "Leads", v: metricas.total ?? 0 },
              { l: "Resposta", v: `${metricas.taxa_resposta_pct ?? 0}%` },
              { l: "Conversão", v: `${metricas.taxa_conversao_pct ?? 0}%` },
            ].map((k) => (
              <div key={k.l} className="rounded-lg border p-2">
                <div className="text-lg font-bold">{k.v}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.l}</div>
              </div>
            ))}
          </div>
        )}

        {resumo ? (
          <div className="space-y-3 text-sm">
            {resumo.resumo_executivo && <p className="text-foreground">{resumo.resumo_executivo}</p>}
            {resumo.o_que_funcionou && (
              <Bloco icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} titulo="O que funcionou" texto={resumo.o_que_funcionou} />
            )}
            {resumo.perfil_melhor && (
              <Bloco icon={<UserCheck className="h-4 w-4 text-blue-600" />} titulo="Perfil que respondeu melhor" texto={resumo.perfil_melhor} />
            )}
            {resumo.objecoes && resumo.objecoes.length > 0 && (
              <div>
                <div className="flex items-center gap-2 font-medium mb-1"><AlertTriangle className="h-4 w-4 text-amber-600" /> Objeções recorrentes</div>
                <div className="flex flex-wrap gap-1.5">
                  {resumo.objecoes.map((o, i) => <Badge key={i} variant="secondary">{o}</Badge>)}
                </div>
              </div>
            )}
            {resumo.ajuste_sugerido && (
              <Bloco icon={<Lightbulb className="h-4 w-4 text-yellow-500" />} titulo="Ajuste sugerido" texto={resumo.ajuste_sugerido} />
            )}
          </div>
        ) : (
          !loading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Gere um resumo executivo desta campanha com IA — o que funcionou, qual perfil respondeu melhor e o que ajustar.</p>
            </div>
          )
        )}

        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Analisando a campanha…
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-muted-foreground">
            {geradoEm ? `Gerado ${new Date(geradoEm).toLocaleString("pt-BR")}` : ""}
          </span>
          <Button onClick={gerar} disabled={loading} size="sm">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {resumo ? "Gerar novamente" : "Gerar resumo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bloco({ icon, titulo, texto }: { icon: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 font-medium mb-0.5">{icon} {titulo}</div>
      <p className="text-muted-foreground">{texto}</p>
    </div>
  );
}
