import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GraduationCap, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ResidentesFilters } from "@/components/residentes/ResidentesFilters";
import { ResidentesMetrics } from "@/components/residentes/ResidentesMetrics";
import { ResidentesCharts } from "@/components/residentes/ResidentesCharts";
import { ResidentesTable } from "@/components/residentes/ResidentesTable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ResidentesDashboardData } from "@/components/residentes/constants";

export default function DisparosResidentes() {
  const [periodoTipo, setPeriodoTipo] = useState("ultimo");
  const [periodoValor, setPeriodoValor] = useState("1");
  const [uf, setUf] = useState("todos");
  const [especialidade, setEspecialidade] = useState("todas");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ResidentesDashboardData | null>(null);

  const clearFilters = useCallback(() => {
    setPeriodoTipo("ultimo");
    setPeriodoValor("1");
    setUf("todos");
    setEspecialidade("todas");
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: configData } = await supabase
        .from("config_lista_items")
        .select("valor")
        .eq("campo_nome", "residentes_webhook_url")
        .maybeSingle();

      if (!configData?.valor) {
        toast.error("URL do webhook de Residentes não configurada. Vá em Configurações > Webhooks.");
        setLoading(false);
        return;
      }

      const referencia = 2; // sempre meses
      const campos = periodoValor;

      const response = await fetch(configData.valor, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer sigma_b36271a572044f5cb2fb2005ae3e7f79",
        },
        body: JSON.stringify({
          campos,
          referencia,
          especialidade: especialidade === "todas" ? "" : especialidade,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      toast.success("Dados carregados com sucesso!");
    } catch (err: any) {
      console.error("Erro ao buscar dados de residentes:", err);
      toast.error("Erro ao buscar dados: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }, [periodoTipo, periodoValor, especialidade]);

  const metrics = {
    certificadosEmitidos: data?.certificados_emitidos ?? 0,
    emAndamento: data?.em_andamento ?? 0,
    profissionais: data?.total_profissionais ?? 0,
    especialidades: data?.total_especialidades ?? 0,
    instituicoes: data?.total_instituicoes ?? 0,
  };

  return (
    <AppLayout
      headerActions={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Residentes</h1>
              <p className="text-xs text-muted-foreground">
                Dashboard de médicos residentes
              </p>
            </div>
          </div>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        <ResidentesFilters
          periodoTipo={periodoTipo}
          periodoValor={periodoValor}
          uf={uf}
          especialidade={especialidade}
          loading={loading}
          onPeriodoTipoChange={setPeriodoTipo}
          onPeriodoValorChange={setPeriodoValor}
          onUfChange={setUf}
          onEspecialidadeChange={setEspecialidade}
          onClearFilters={clearFilters}
          onSearch={fetchData}
        />

        <ResidentesMetrics {...metrics} />

        <ResidentesCharts
          porUf={data?.por_uf ?? []}
          porEspecialidade={data?.por_especialidade ?? []}
          porPeriodo={data?.por_periodo ?? []}
          evolucaoAno={data?.evolucao_ano ?? []}
          porInstituicao={data?.por_instituicao ?? []}
        />

        <ResidentesTable residentes={data?.residentes ?? []} />
      </div>
    </AppLayout>
  );
}
