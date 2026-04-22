import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Loader2, Send, MessageCircle, MessagesSquare, CheckCircle2, Trophy } from "lucide-react";

interface Props {
  campanhaPropostaId: string;
}

interface FunilRow {
  campanha_proposta_id: string;
  total_enviados: number;
  total_responderam: number;
  total_em_conversa: number;
  total_aceitaram: number;
  total_convertidos: number;
  primeiro_envio: string | null;
  ultimo_envio: string | null;
}

export function TrafegoPagoFunilRelatorio({ campanhaPropostaId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["trafego-pago-funil", campanhaPropostaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_trafego_pago_funil" as any)
        .select("*")
        .eq("campanha_proposta_id", campanhaPropostaId)
        .maybeSingle();
      if (error) throw error;
      return data as FunilRow | null;
    },
    refetchInterval: 30000,
  });

  const enviados = data?.total_enviados ?? 0;
  const responderam = data?.total_responderam ?? 0;
  const emConversa = data?.total_em_conversa ?? 0;
  const convertidos = data?.total_convertidos ?? 0;
  const taxaResposta = enviados > 0 ? ((responderam / enviados) * 100).toFixed(1) : "0";
  const taxaConversao = enviados > 0 ? ((convertidos / enviados) * 100).toFixed(1) : "0";

  const etapas = [
    { label: "Enviados (XLSX)", valor: enviados, icon: Send, cor: "text-blue-600" },
    { label: "Responderam", valor: responderam, icon: MessageCircle, cor: "text-purple-600" },
    { label: "Em conversa", valor: emConversa, icon: MessagesSquare, cor: "text-amber-600" },
    { label: "Aceitaram", valor: data?.total_aceitaram ?? 0, icon: CheckCircle2, cor: "text-green-600" },
    { label: "Convertidos", valor: convertidos, icon: Trophy, cor: "text-emerald-600" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Funil de Conversão — Tráfego Pago
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {etapas.map((e) => {
                const Icon = e.icon;
                return (
                  <div key={e.label} className="border rounded-lg p-3 text-center">
                    <Icon className={`h-5 w-5 mx-auto mb-1 ${e.cor}`} />
                    <div className="text-2xl font-bold">{e.valor}</div>
                    <div className="text-xs text-muted-foreground">{e.label}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 text-sm pt-2 border-t">
              <div>
                <span className="text-muted-foreground">Taxa de resposta:</span>{" "}
                <span className="font-semibold">{taxaResposta}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Taxa de conversão:</span>{" "}
                <span className="font-semibold">{taxaConversao}%</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}