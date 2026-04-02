import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Eye, DollarSign, BarChart3 } from "lucide-react";

export function RelatoriosSimplificadoTab() {
  const { data: conteudos } = useQuery({
    queryKey: ["marketing-conteudos-stats"],
    queryFn: async () => { const { data } = await supabase.from("marketing_conteudos").select("*"); return data || []; },
  });

  const { data: trafego } = useQuery({
    queryKey: ["marketing-trafego-stats"],
    queryFn: async () => { const { data } = await supabase.from("marketing_trafego_pago").select("*"); return data || []; },
  });

  const { data: eventos } = useQuery({
    queryKey: ["marketing-eventos-stats"],
    queryFn: async () => { const { data } = await supabase.from("marketing_eventos").select("*"); return data || []; },
  });

  const totalConteudos = conteudos?.length || 0;
  const conteudosPublicados = conteudos?.filter((c) => c.status === "publicado").length || 0;
  const totalOrcamento = trafego?.reduce((sum, t) => sum + (t.orcamento || 0), 0) || 0;
  const totalEventos = eventos?.length || 0;
  const eventosFinalizados = eventos?.filter((e) => e.status === "finalizado").length || 0;

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-semibold">Relatórios e Acompanhamentos</h2><p className="text-sm text-muted-foreground">Métricas consolidadas de marketing</p></div>

      <div>
        <h3 className="text-lg font-medium mb-3 flex items-center gap-2"><BarChart3 className="h-5 w-5" />Marketing Digital</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Target className="h-4 w-4" /><span className="text-xs">Conteúdos</span></div><p className="text-2xl font-bold">{totalConteudos}</p></Card>
          <Card className="p-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /><span className="text-xs">Publicados</span></div><p className="text-2xl font-bold">{conteudosPublicados}</p></Card>
          <Card className="p-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Eye className="h-4 w-4" /><span className="text-xs">Eventos</span></div><p className="text-2xl font-bold">{totalEventos}</p></Card>
          <Card className="p-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><DollarSign className="h-4 w-4" /><span className="text-xs">Orçamento Ads</span></div><p className="text-2xl font-bold">R$ {totalOrcamento.toLocaleString("pt-BR")}</p></Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-green-600" />O que está funcionando</h3>
          <ul className="space-y-2 text-sm">
            {conteudosPublicados > 0 && <li className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500 rounded-full" />{conteudosPublicados} conteúdos publicados</li>}
            {eventosFinalizados > 0 && <li className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500 rounded-full" />{eventosFinalizados} eventos realizados</li>}
            {totalConteudos === 0 && totalEventos === 0 && <li className="text-muted-foreground">Ainda não há dados suficientes</li>}
          </ul>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-600" />Pontos de Atenção</h3>
          <ul className="space-y-2 text-sm">
            {totalConteudos > 0 && conteudosPublicados === 0 && <li className="flex items-center gap-2"><span className="w-2 h-2 bg-yellow-500 rounded-full" />Nenhum conteúdo publicado ainda</li>}
            {totalConteudos === 0 && <li className="text-muted-foreground">Comece criando conteúdos para ver métricas</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
