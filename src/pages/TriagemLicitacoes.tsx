import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, ExternalLink, Loader2, MapPin, Building2, DollarSign, Calendar, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PERFIL = "gss-saude";

// Fila de triagem: candidatos do espelho PNCP pontuados pelo scoring.
// Verde (score>=5) já vem pré-aprovado; amarelo (3-4) precisa decisão humana.
// Aprovar → promove pro Sigma (cria card + PDF via edge pncp-promote).
export default function TriagemLicitacoes() {
  const queryClient = useQueryClient();
  const [aba, setAba] = useState<"pendente_humano" | "auto_aprovado">("pendente_humano");

  const { data: fila = [], isLoading } = useQuery({
    queryKey: ["pncp-triagem", aba],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_pncp_triagem")
        .select("*")
        .eq("perfil_slug", PERFIL)
        .eq("status", aba)
        .is("promovido_licitacao_id", null)
        .order("score", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: contadores } = useQuery({
    queryKey: ["pncp-triagem-contadores"],
    queryFn: async () => {
      const { data } = await supabase.from("vw_pncp_triagem").select("status").eq("perfil_slug", PERFIL).is("promovido_licitacao_id", null);
      const c: Record<string, number> = {};
      (data || []).forEach((r: any) => { c[r.status] = (c[r.status] || 0) + 1; });
      return c;
    },
  });

  const decidir = useMutation({
    mutationFn: async ({ ncp, aprovar }: { ncp: string; aprovar: boolean }) => {
      const novoStatus = aprovar ? "humano_aprovado" : "humano_rejeitado";
      const { error } = await supabase.from("pncp_triagem")
        .update({ status: novoStatus, decidido_em: new Date().toISOString() })
        .eq("numero_controle_pncp", ncp).eq("perfil_slug", PERFIL);
      if (error) throw error;
      if (aprovar) {
        // promove imediatamente (cria card + PDF no Sigma)
        await supabase.functions.invoke("pncp-promote", { body: { perfil: PERFIL, limite: 5 } });
      }
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["pncp-triagem"] });
      queryClient.invalidateQueries({ queryKey: ["pncp-triagem-contadores"] });
      toast.success(v.aprovar ? "Aprovada — indo pro Sigma" : "Descartada");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao decidir"),
  });

  const fmtMoeda = (v: any) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const fmtData = (d: any) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Triagem de Licitações (PNCP)</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Oportunidades captadas do espelho PNCP e pontuadas automaticamente. Aprove pra criar o card no Sigma com o edital.
        </p>

        <Tabs value={aba} onValueChange={(v) => setAba(v as any)} className="mb-4">
          <TabsList>
            <TabsTrigger value="pendente_humano">
              Revisar {contadores?.pendente_humano ? <Badge variant="secondary" className="ml-2">{contadores.pendente_humano}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="auto_aprovado">
              Alta confiança {contadores?.auto_aprovado ? <Badge variant="secondary" className="ml-2">{contadores.auto_aprovado}</Badge> : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : fila.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Nada na fila. As novas oportunidades aparecem aqui conforme o espelho captura.</div>
        ) : (
          <div className="space-y-3">
            {fila.map((l: any) => (
              <Card key={l.numero_controle_pncp} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={l.score >= 5 ? "default" : "secondary"}>score {l.score}</Badge>
                      <Badge variant="outline">{l.modalidade_nome}</Badge>
                    </div>
                    <p className="text-sm font-medium leading-snug line-clamp-2">{l.objeto_compra}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{l.orgao_razao_social}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{l.municipio}/{l.uf}</span>
                      <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{fmtMoeda(l.valor_estimado)}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtData(l.data_encerramento_proposta)}</span>
                      <a href={l.url_pncp} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" />PNCP
                      </a>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="text-destructive"
                      onClick={() => decidir.mutate({ ncp: l.numero_controle_pncp, aprovar: false })}
                      disabled={decidir.isPending}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm"
                      onClick={() => decidir.mutate({ ncp: l.numero_controle_pncp, aprovar: true })}
                      disabled={decidir.isPending}>
                      <Check className="h-4 w-4 mr-1" />Aprovar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
