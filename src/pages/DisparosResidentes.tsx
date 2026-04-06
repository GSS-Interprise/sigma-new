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
import type { ResidentesDashboardData, ResidenteData } from "@/components/residentes/constants";

interface WebhookResidente {
  instituicao: string;
  medico: string;
  uf: string;
  especialidade: string;
  inicio: string;
  termino: string;
  num_certificado: string | null;
  emissao_certificado: string | null;
  informacoes_adicionais: string | null;
  crm: number;
  periodo: string;
}

function transformWebhookData(raw: WebhookResidente[]): ResidentesDashboardData {
  const residentes: ResidenteData[] = raw.map(r => ({
    medico: r.medico,
    crm: String(r.crm || ""),
    especialidade: r.especialidade,
    periodo: r.periodo,
    inicio: r.inicio,
    termino: r.termino,
    emissao: r.emissao_certificado || "",
    numero_certificado: r.num_certificado || "",
    instituicao: r.instituicao,
    uf: r.uf,
    status: r.informacoes_adicionais === "CURSANDO" || r.periodo?.startsWith("R") ? "Em Andamento" : "Concluído",
  }));

  const certificados = residentes.filter(r => r.status === "Concluído").length;
  const emAndamento = residentes.filter(r => r.status === "Em Andamento").length;
  const profissionais = new Set(residentes.map(r => r.medico)).size;
  const especialidades = new Set(residentes.map(r => r.especialidade)).size;
  const instituicoes = new Set(residentes.map(r => r.instituicao)).size;

  // por UF
  const ufMap = new Map<string, number>();
  residentes.forEach(r => { if (r.uf) ufMap.set(r.uf, (ufMap.get(r.uf) || 0) + 1); });
  const porUf = Array.from(ufMap.entries())
    .map(([uf, quantidade]) => ({ uf, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  // por especialidade
  const espMap = new Map<string, number>();
  residentes.forEach(r => espMap.set(r.especialidade, (espMap.get(r.especialidade) || 0) + 1));
  const porEspecialidade = Array.from(espMap.entries())
    .map(([programa, quantidade]) => ({ programa, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  // por periodo
  const perMap = new Map<string, number>();
  residentes.forEach(r => { if (r.periodo) perMap.set(r.periodo, (perMap.get(r.periodo) || 0) + 1); });
  const porPeriodo = Array.from(perMap.entries())
    .map(([periodo, quantidade]) => ({ periodo, quantidade }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  // evolução por ano (baseado no ano de início)
  const anoMap = new Map<number, number>();
  residentes.forEach(r => {
    const match = r.inicio?.match(/(\d{4})/);
    if (match) {
      const ano = parseInt(match[1]);
      anoMap.set(ano, (anoMap.get(ano) || 0) + 1);
    }
  });
  const evolucaoAno = Array.from(anoMap.entries())
    .map(([ano, quantidade]) => ({ ano, quantidade }))
    .sort((a, b) => a.ano - b.ano);

  // por instituição
  const instMap = new Map<string, number>();
  residentes.forEach(r => instMap.set(r.instituicao, (instMap.get(r.instituicao) || 0) + 1));
  const porInstituicao = Array.from(instMap.entries())
    .map(([instituicao, certificados]) => ({ instituicao, certificados }))
    .sort((a, b) => b.certificados - a.certificados);

  return {
    certificados_emitidos: certificados,
    em_andamento: emAndamento,
    total_profissionais: profissionais,
    total_especialidades: especialidades,
    total_instituicoes: instituicoes,
    por_uf: porUf,
    por_especialidade: porEspecialidade,
    por_periodo: porPeriodo,
    evolucao_ano: evolucaoAno,
    por_instituicao: porInstituicao,
    residentes,
  };
}

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
      // O webhook retorna um array direto de residentes — transformar para o formato do dashboard
      const parsed = Array.isArray(result) ? transformWebhookData(result) : result;
      setData(parsed);
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
