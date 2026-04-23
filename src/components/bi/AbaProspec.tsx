import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, MessageCircle, Trophy, TrendingUp, Megaphone, Users, Target, Radio, MousePointer, BarChart3, Mail, Instagram, Stethoscope, UserCheck, XCircle, MessageSquare, HelpCircle, RotateCcw, Lock, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// Paleta neon (cyan, magenta, amarelo, verde, laranja, roxo)
const NEON = {
  cyan: "#22d3ee",
  magenta: "#ec4899",
  yellow: "#facc15",
  green: "#22c55e",
  orange: "#fb923c",
  purple: "#a855f7",
  blue: "#3b82f6",
};
const COLORS = [NEON.cyan, NEON.green, NEON.yellow, NEON.magenta, NEON.purple, NEON.orange];

const tooltipStyle = {
  backgroundColor: "rgba(15, 23, 42, 0.95)",
  border: "1px solid rgba(34, 211, 238, 0.4)",
  borderRadius: 8,
  color: "#e2e8f0",
  boxShadow: "0 0 20px rgba(34,211,238,0.15)",
};
const tooltipItemStyle = { color: "#e2e8f0" };
const tooltipLabelStyle = { color: "#94a3b8", fontSize: 11, marginBottom: 4 };

function startOfMonthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// Busca paginada em chunks de 1000 (limite default do Supabase)
async function fetchAllChunks<T = any>(
  table: string,
  select: string,
  applyFilters: (q: any) => any,
  chunkSize = 1000,
  maxRows = 50000,
  orderColumn = "created_at"
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const to = from + chunkSize - 1;
    let q: any = (supabase as any)
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true, nullsFirst: false })
      .range(from, to);
    q = applyFilters(q);
    const { data, error } = await q;
    if (error) {
      // Fallback: tenta sem order (caso a coluna não exista no select/view)
      const q2: any = applyFilters(
        (supabase as any).from(table).select(select).range(from, to)
      );
      const r2 = await q2;
      if (r2.error) throw r2.error;
      const rows2 = (r2.data ?? []) as T[];
      all.push(...rows2);
      if (rows2.length < chunkSize) break;
      from += chunkSize;
      continue;
    }
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < chunkSize) break;
    from += chunkSize;
  }
  return all;
}

function KPI({ icon: Icon, label, value, sub, color = NEON.cyan }: any) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-4 backdrop-blur-sm transition-transform hover:scale-[1.02]"
      style={{
        background: "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(2,6,23,0.95))",
        borderColor: `${color}55`,
        boxShadow: `0 0 24px ${color}22, inset 0 0 12px ${color}11`,
      }}
    >
      <div
        aria-hidden
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-30 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between mb-2 relative">
        <div className="p-1.5 rounded-md" style={{ background: `${color}22`, border: `1px solid ${color}55` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        {sub && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: `${color}22`, color }}>
            {sub}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold relative tracking-tight" style={{ color: "#f1f5f9", textShadow: `0 0 8px ${color}66` }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider mt-1 relative" style={{ color: "#94a3b8" }}>
        {label}
      </div>
    </div>
  );
}

function PanelCard({ title, description, icon: Icon, accent = NEON.cyan, children, className = "" }: any) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border backdrop-blur-sm ${className}`}
      style={{
        background: "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(2,6,23,0.95))",
        borderColor: `${accent}44`,
        boxShadow: `0 0 18px ${accent}15`,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <div className="p-4 border-b" style={{ borderColor: `${accent}22` }}>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4" style={{ color: accent }} />}
          <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: "#e2e8f0" }}>{title}</h3>
        </div>
        {description && <p className="text-xs mt-1" style={{ color: "#64748b" }}>{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function AbaProspec() {
  const [dataInicio, setDataInicio] = useState(startOfMonthsAgo(5));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
  const [tabAtiva, setTabAtiva] = useState<string>("visao");
  const [pergunta, setPergunta] = useState<string>("");

  const PERIODO_INICIO_DEFAULT = startOfMonthsAgo(5);
  const PERIODO_FIM_DEFAULT = new Date().toISOString().slice(0, 10);

  // Mapa de pergunta → aba destino
  const perguntaParaTab: Record<string, string> = {
    "geral-disparos": "visao",
    "geral-disparos-respostas": "visao",
    "geral-disparos-respostas-conv": "visao",
    "esp-disparos": "especialidade",
    "esp-disparos-respostas": "especialidade",
    "esp-disparos-respostas-conv": "especialidade",
    "esp-motivos-nao-conv": "conversao",
    "esp-conv-colaborador": "conversao",
    "origem-email": "canais",
    "origem-sigzap": "canais",
    "origem-trafego": "trafego",
    "origem-instagram": "canais",
    "origem-ocorrencias": "canais",
  };

  const handlePerguntaChange = (value: string) => {
    setPergunta(value);
    const tab = perguntaParaTab[value];
    if (tab) setTabAtiva(tab);
  };

  const handleLimparFiltros = () => {
    setDataInicio(PERIODO_INICIO_DEFAULT);
    setDataFim(PERIODO_FIM_DEFAULT);
    setPergunta("");
    setTabAtiva("visao");
  };

  // === Dashboard agregado via RPC (1 chamada) ===
  const { data: dashboard, isLoading, error: dashboardError } = useQuery({
    queryKey: ["bi-prospec-dashboard", dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_bi_prospec_dashboard", {
        p_inicio: `${dataInicio}T00:00:00`,
        p_fim: `${dataFim}T23:59:59`,
      });
      if (error) {
        if (error.code === "42501" || (error.message || "").toLowerCase().includes("permiss")) {
          toast.error("Sem permissão para visualizar o BI Prospec. Peça acesso (captacao.view) ao admin.");
        } else {
          toast.error(`Erro ao carregar BI: ${error.message}`);
        }
        throw error;
      }
      return data as any;
    },
    staleTime: 60_000,
    retry: false,
  });

  const semPermissao = (dashboardError as any)?.code === "42501";

  // Chips de tráfego pago (consulta separada, leve)
  const { data: chips } = useQuery({
    queryKey: ["bi-prospec-chips"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("chips")
        .select("id,nome,is_trafego_pago,tipo_instancia");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5 * 60_000,
  });

  // Desestrutura RPC com defaults seguros
  const totais = (dashboard?.totais ?? {}) as any;
  const porCanal = (dashboard?.por_canal ?? {}) as any;
  const trafegoPago: any[] = dashboard?.propostas_trafego ?? [];
  const campanhasMetricas: any[] = dashboard?.top_campanhas ?? [];

  const totaisTrafego = {
    enviados: Number(totais.trafego_enviados) || 0,
    responderam: Number(totais.trafego_responderam) || 0,
    emConversa: Number(totais.trafego_em_conversa) || 0,
    aceitaram: Number(totais.trafego_aceitaram) || 0,
    convertidos: Number(totais.trafego_convertidos) || 0,
  };

  const evolucaoMensal = useMemo(
    () => (dashboard?.evolucao_mensal ?? []).map((r: any) => ({
      mes: r.mes,
      manual: Number(r.manual) || 0,
      massa: Number(r.massa) || 0,
      trafego: Number(r.trafego) || 0,
      respostas: Number(r.respostas) || 0,
      convertidos: Number(r.convertidos) || 0,
    })),
    [dashboard]
  );

  const resumoTipos = useMemo(() => ([
    { tipo: "Manual", total: Number(totais.manuais) || 0, cor: COLORS[0] },
    { tipo: "Em Massa", total: Number(totais.massa_enviados) || 0, cor: COLORS[1] },
    { tipo: "Tráfego Pago", total: Number(totais.trafego_enviados) || 0, cor: COLORS[2] },
    { tipo: "Email", total: Number(totais.emails_enviados) || 0, cor: COLORS[3] },
    { tipo: "Instagram", total: Number(totais.instagram_enviados) || 0, cor: COLORS[4] },
  ]), [totais]);

  const totalGeralDisparos = resumoTipos.reduce((s, r) => s + r.total, 0);

  const topCampanhas = useMemo(
    () => [...campanhasMetricas].slice(0, 8),
    [campanhasMetricas]
  );

  const topPropostas: any[] = dashboard?.top_propostas ?? [];
  }, [trafegoPago]);

  const chipsTrafego = (chips ?? []).filter((c) => c.is_trafego_pago);

  // ===== NOVAS AGREGAÇÕES =====

  // Mapas auxiliares
  const leadEspecialidadeMap = useMemo(() => {
    const m = new Map<string, string>();
    (leadsAll ?? []).forEach((l: any) => {
      m.set(l.id, (l.especialidade || "Sem especialidade").trim() || "Sem especialidade");
    });
    (leadsConvertidos ?? []).forEach((l: any) => {
      if (!m.has(l.id)) m.set(l.id, (l.especialidade || "Sem especialidade").trim() || "Sem especialidade");
    });
    return m;
  }, [leadsAll, leadsConvertidos]);

  const profilesMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => m.set(p.id, p.nome_completo || "—"));
    return m;
  }, [profiles]);

  // Lead → respondeu? (qualquer canal)
  const leadsResponderam = useMemo(() => {
    const set = new Set<string>();
    // email inbound
    (emails ?? []).forEach((e: any) => {
      if (e.direcao === "recebido" && e.lead_id) set.add(e.lead_id);
    });
    // canais com saiu_em (algum movimento) ou status respondeu/aceitou/convertido
    (canaisAll ?? []).forEach((c: any) => {
      if (!c.lead_id) return;
      if (
        c.status_final === "respondeu" ||
        c.status_final === "aceitou" ||
        c.status_final === "convertido" ||
        c.status_final === "em_conversa"
      ) set.add(c.lead_id);
    });
    return set;
  }, [emails, canaisAll]);

  // Lead → convertido (todas as fontes)
  const leadsConvertidosSet = useMemo(() => {
    const set = new Set<string>();
    (leadsConvertidos ?? []).forEach((l: any) => set.add(l.id));
    (canaisAll ?? []).forEach((c: any) => {
      if (c.status_final === "convertido" && c.lead_id) set.add(c.lead_id);
    });
    return set;
  }, [leadsConvertidos, canaisAll]);

  // === Por especialidade ===
  const porEspecialidade = useMemo(() => {
    const map = new Map<string, { especialidade: string; disparos: number; responderam: Set<string>; convertidos: Set<string> }>();
    const ensure = (esp: string) => {
      if (!map.has(esp)) map.set(esp, { especialidade: esp, disparos: 0, responderam: new Set(), convertidos: new Set() });
      return map.get(esp)!;
    };
    const addDisparoForLead = (leadId?: string | null) => {
      if (!leadId) return;
      const esp = leadEspecialidadeMap.get(leadId) || "Sem especialidade";
      const e = ensure(esp);
      e.disparos += 1;
      if (leadsResponderam.has(leadId)) e.responderam.add(leadId);
      if (leadsConvertidosSet.has(leadId)) e.convertidos.add(leadId);
    };
    (disparosMassa ?? []).forEach((d: any) => addDisparoForLead(d.lead_id));
    (disparosManuais ?? []).forEach((d: any) => addDisparoForLead(d.lead_id));
    (emails ?? []).forEach((e: any) => { if (e.direcao === "enviado") addDisparoForLead(e.lead_id); });
    (canaisAll ?? []).forEach((c: any) => addDisparoForLead(c.lead_id));

    return Array.from(map.values())
      .map((r) => ({
        especialidade: r.especialidade,
        disparos: r.disparos,
        responderam: r.responderam.size,
        convertidos: r.convertidos.size,
      }))
      .sort((a, b) => b.disparos - a.disparos)
      .slice(0, 15);
  }, [disparosMassa, disparosManuais, emails, canaisAll, leadEspecialidadeMap, leadsResponderam, leadsConvertidosSet]);

  // === Convertidos por colaborador ===
  const convPorColaborador = useMemo(() => {
    const map = new Map<string, number>();
    (leadsConvertidos ?? []).forEach((l: any) => {
      const k = l.convertido_por || "sem_responsavel";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([id, total]) => ({
        id,
        nome: id === "sem_responsavel" ? "— Sem responsável" : (profilesMap.get(id) || "Usuário desconhecido"),
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [leadsConvertidos, profilesMap]);

  // === Motivos de não conversão ===
  const motivosNaoConversao = useMemo(() => {
    const map = new Map<string, number>();
    (canaisAll ?? []).forEach((c: any) => {
      const isNaoConv =
        c.status_final === "descartado" ||
        c.status_final === "fechado" ||
        c.status_final === "proposta_encerrada" ||
        c.status_final === "nao_respondeu";
      if (!isNaoConv) return;
      const motivo = (c.motivo_saida || "Sem motivo informado").trim() || "Sem motivo informado";
      map.set(motivo, (map.get(motivo) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total);
  }, [canaisAll]);

  // === Métricas por canal de origem ===
  const metricasPorCanal = useMemo(() => {
    const calc = (leadIds: Set<string>, totalEnv: number) => {
      let resp = 0, conv = 0;
      leadIds.forEach((id) => {
        if (leadsResponderam.has(id)) resp += 1;
        if (leadsConvertidosSet.has(id)) conv += 1;
      });
      return { enviados: totalEnv, responderam: resp, convertidos: conv };
    };

    // WhatsApp / SigZap = massa + manual
    const wppLeads = new Set<string>();
    let wppTotal = 0;
    (disparosMassa ?? []).forEach((d: any) => { wppTotal += 1; if (d.lead_id) wppLeads.add(d.lead_id); });
    (disparosManuais ?? []).forEach((d: any) => { wppTotal += 1; if (d.lead_id) wppLeads.add(d.lead_id); });

    // Email
    const emailLeads = new Set<string>();
    let emailTotal = 0;
    (emails ?? []).forEach((e: any) => {
      if (e.direcao === "enviado") { emailTotal += 1; if (e.lead_id) emailLeads.add(e.lead_id); }
    });

    // Instagram
    const igLeads = new Set<string>();
    let igTotal = 0;
    (canaisAll ?? []).forEach((c: any) => {
      if (c.canal === "instagram") { igTotal += 1; if (c.lead_id) igLeads.add(c.lead_id); }
    });

    return {
      whatsapp: calc(wppLeads, wppTotal),
      email: calc(emailLeads, emailTotal),
      trafego: { enviados: totaisTrafego.enviados, responderam: totaisTrafego.responderam, convertidos: totaisTrafego.convertidos },
      instagram: calc(igLeads, igTotal),
    };
  }, [disparosMassa, disparosManuais, emails, canaisAll, leadsResponderam, leadsConvertidosSet, totaisTrafego]);

  // === Total geral de respondidos / convertidos (todos os canais) ===
  const totaisGerais = useMemo(() => ({
    responderam: leadsResponderam.size,
    convertidos: leadsConvertidosSet.size,
  }), [leadsResponderam, leadsConvertidosSet]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const taxaResp = totalGeralDisparos > 0 ? ((totaisGerais.responderam / totalGeralDisparos) * 100).toFixed(1) : "0";
  const taxaConv = totalGeralDisparos > 0 ? ((totaisGerais.convertidos / totalGeralDisparos) * 100).toFixed(1) : "0";

  return (
    <div
      className="space-y-6 -m-4 p-4 md:p-6 min-h-[calc(100vh-8rem)] rounded-lg"
      style={{
        background:
          "radial-gradient(circle at 20% 0%, rgba(34,211,238,0.08), transparent 50%), radial-gradient(circle at 80% 100%, rgba(236,72,153,0.08), transparent 50%), #020617",
      }}
    >
      {/* Filtro */}
      <FiltroPeriodo
        dataInicio={dataInicio}
        dataFim={dataFim}
        onDataInicioChange={setDataInicio}
        onDataFimChange={setDataFim}
        theme="dark-neon"
      >
        {/* Select: O que você quer saber? */}
        <div className="flex-1 min-w-[280px]">
          <Label className="mb-2 flex items-center gap-2 text-[hsl(var(--fp-muted))]">
            <HelpCircle className="h-4 w-4" />
            O que você quer saber?
          </Label>
          <Select value={pergunta} onValueChange={handlePerguntaChange}>
            <SelectTrigger className="border-[hsl(var(--fp-border)/0.22)] bg-[hsl(var(--fp-surface-elevated)/0.96)] text-[hsl(var(--fp-foreground))] hover:border-[hsl(var(--fp-border)/0.5)] focus:ring-[hsl(var(--fp-accent)/0.35)]">
              <SelectValue placeholder="Selecione uma pergunta…" />
            </SelectTrigger>
            <SelectContent className="z-[220] border border-cyan-500/40 bg-slate-950 text-slate-100 shadow-[0_0_28px_rgba(34,211,238,0.25)] max-h-[400px]">
              <SelectGroup>
                <SelectLabel className="text-cyan-300 text-[11px] uppercase tracking-wider">Geral</SelectLabel>
                <SelectItem value="geral-disparos" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Nº de disparos</SelectItem>
                <SelectItem value="geral-disparos-respostas" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Disparos × Médicos que responderam</SelectItem>
                <SelectItem value="geral-disparos-respostas-conv" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Disparos × Responderam × Convertidos</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-cyan-300 text-[11px] uppercase tracking-wider">Por especialidade</SelectLabel>
                <SelectItem value="esp-disparos" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Nº de disparos por especialidade</SelectItem>
                <SelectItem value="esp-disparos-respostas" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Disparos × Responderam por especialidade</SelectItem>
                <SelectItem value="esp-disparos-respostas-conv" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Disparos × Responderam × Convertidos por especialidade</SelectItem>
                <SelectItem value="esp-motivos-nao-conv" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Motivos da não conversão</SelectItem>
                <SelectItem value="esp-conv-colaborador" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Convertidos por colaborador</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-cyan-300 text-[11px] uppercase tracking-wider">Origem</SelectLabel>
                <SelectItem value="origem-email" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Nº de disparos por email</SelectItem>
                <SelectItem value="origem-sigzap" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Nº de disparos SigZap</SelectItem>
                <SelectItem value="origem-trafego" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Nº de retorno pelo tráfego pago</SelectItem>
                <SelectItem value="origem-instagram" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Nº de prospecção por Instagram</SelectItem>
                <SelectItem value="origem-ocorrencias" className="text-slate-100 focus:bg-cyan-500/20 focus:text-white">Nº de ocorrências</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Limpar filtros */}
        <div className="flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleLimparFiltros}
            className="border-[hsl(var(--fp-border)/0.34)] bg-[hsl(var(--fp-surface-elevated)/0.96)] text-[hsl(var(--fp-foreground))] hover:bg-[hsl(var(--fp-accent)/0.12)] hover:text-[hsl(var(--fp-foreground))]"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Limpar filtros
          </Button>
        </div>
      </FiltroPeriodo>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI icon={Send} label="Total disparos" value={totalGeralDisparos.toLocaleString()} color={NEON.cyan} />
        <KPI icon={MessageCircle} label="Responderam (todos canais)" value={totaisGerais.responderam.toLocaleString()} sub={`${taxaResp}%`} color={NEON.magenta} />
        <KPI icon={Trophy} label="Convertidos (todos canais)" value={totaisGerais.convertidos.toLocaleString()} sub={`${taxaConv}%`} color={NEON.green} />
        <KPI icon={Megaphone} label="Tráfego pago — enviados" value={totaisTrafego.enviados.toLocaleString()} color={NEON.yellow} />
        <KPI icon={Mail} label="Emails enviados" value={metricasPorCanal.email.enviados.toLocaleString()} color={NEON.blue} />
        <KPI icon={Instagram} label="Instagram" value={metricasPorCanal.instagram.enviados.toLocaleString()} color={NEON.purple} />
      </div>

      <Tabs value={tabAtiva} onValueChange={setTabAtiva} className="space-y-4">
        <TabsList
          className="bg-transparent border p-1 gap-1"
          style={{ borderColor: `${NEON.cyan}33`, background: "rgba(15,23,42,0.6)" }}
        >
          {[
            ["visao", "Visão geral"],
            ["especialidade", "Por especialidade"],
            ["conversao", "Conversão"],
            ["trafego", "Tráfego pago"],
            ["campanhas", "Campanhas"],
            ["propostas", "Propostas"],
            ["canais", "Canais"],
          ].map(([v, l]) => (
            <TabsTrigger
              key={v}
              value={v}
              className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300 data-[state=active]:shadow-[0_0_12px_rgba(34,211,238,0.4)] text-slate-400"
            >
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* === Visão geral === */}
        <TabsContent value="visao" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PanelCard title="Evolução mensal por tipo" description="Manual, em massa e tráfego pago" icon={BarChart3} accent={NEON.cyan} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={evolucaoMensal}>
                  <defs>
                    <linearGradient id="gManual" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.cyan} stopOpacity={0.95} /><stop offset="100%" stopColor={NEON.cyan} stopOpacity={0.4} /></linearGradient>
                    <linearGradient id="gMassa" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.green} stopOpacity={0.95} /><stop offset="100%" stopColor={NEON.green} stopOpacity={0.4} /></linearGradient>
                    <linearGradient id="gTraf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.yellow} stopOpacity={0.95} /><stop offset="100%" stopColor={NEON.yellow} stopOpacity={0.4} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="mes" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(34,211,238,0.05)" }} />
                  <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                  <Bar dataKey="manual" stackId="a" fill="url(#gManual)" name="Manual" radius={[0,0,0,0]} />
                  <Bar dataKey="massa" stackId="a" fill="url(#gMassa)" name="Em massa" />
                  <Bar dataKey="trafego" stackId="a" fill="url(#gTraf)" name="Tráfego pago" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </PanelCard>

            <PanelCard title="Mix por tipo" description="Distribuição no período" accent={NEON.magenta}>
              <div className="relative">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={resumoTipos}
                      dataKey="total"
                      nameKey="tipo"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      stroke="#020617"
                      strokeWidth={2}
                    >
                      {resumoTipos.map((_r, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={tooltipStyle}
                      itemStyle={tooltipItemStyle}
                      labelStyle={tooltipLabelStyle}
                      formatter={(v: any, n: any) => [Number(v).toLocaleString(), n]}
                    />
                    <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  className="absolute inset-x-0 top-1/2 -translate-y-[60%] text-center pointer-events-none"
                >
                  <div
                    className="text-3xl font-bold"
                    style={{ color: "#f1f5f9", textShadow: `0 0 10px ${NEON.magenta}66` }}
                  >
                    {totalGeralDisparos.toLocaleString()}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: "#94a3b8" }}>total</div>
                </div>
              </div>
            </PanelCard>
          </div>

          <PanelCard title="Respostas e conversões — Tráfego pago" icon={TrendingUp} accent={NEON.green}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={evolucaoMensal}>
                <defs>
                  <linearGradient id="aEnv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.yellow} stopOpacity={0.6} /><stop offset="100%" stopColor={NEON.yellow} stopOpacity={0} /></linearGradient>
                  <linearGradient id="aResp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.magenta} stopOpacity={0.6} /><stop offset="100%" stopColor={NEON.magenta} stopOpacity={0} /></linearGradient>
                  <linearGradient id="aConv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.green} stopOpacity={0.6} /><stop offset="100%" stopColor={NEON.green} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="mes" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                <Area type="monotone" dataKey="trafego" stroke={NEON.yellow} fill="url(#aEnv)" name="Enviados" strokeWidth={2} />
                <Area type="monotone" dataKey="respostas" stroke={NEON.magenta} fill="url(#aResp)" name="Respostas" strokeWidth={2} />
                <Area type="monotone" dataKey="convertidos" stroke={NEON.green} fill="url(#aConv)" name="Convertidos" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </PanelCard>
        </TabsContent>

        {/* === Por Especialidade === */}
        <TabsContent value="especialidade" className="space-y-4">
          <PanelCard title="Disparos × Responderam × Convertidos por especialidade" description="Top 15 especialidades no período" icon={Stethoscope} accent={NEON.cyan}>
            <ResponsiveContainer width="100%" height={Math.max(320, porEspecialidade.length * 36)}>
              <BarChart data={porEspecialidade} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis dataKey="especialidade" type="category" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} width={140} />
                <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(34,211,238,0.05)" }} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                <Bar dataKey="disparos" fill={NEON.cyan} name="Disparos" radius={[0,4,4,0]} />
                <Bar dataKey="responderam" fill={NEON.magenta} name="Responderam" radius={[0,4,4,0]} />
                <Bar dataKey="convertidos" fill={NEON.green} name="Convertidos" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </PanelCard>

          <PanelCard title="Detalhamento por especialidade" accent={NEON.magenta}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: `${NEON.magenta}33` }}>
                    {["Especialidade","Disparos","Responderam","Convertidos","Taxa resp.","Taxa conv."].map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-[11px] uppercase tracking-wider font-semibold ${i>=1?"text-right":""}`} style={{ color: NEON.magenta }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porEspecialidade.map((r) => {
                    const tr = r.disparos > 0 ? ((r.responderam / r.disparos) * 100).toFixed(1) : "0";
                    const tc = r.disparos > 0 ? ((r.convertidos / r.disparos) * 100).toFixed(1) : "0";
                    return (
                      <tr key={r.especialidade} className="border-b hover:bg-magenta-500/5 transition-colors" style={{ borderColor: "#1e293b" }}>
                        <td className="py-2 px-2 font-medium" style={{ color: "#e2e8f0" }}>{r.especialidade}</td>
                        <td className="py-2 px-2 text-right" style={{ color: NEON.cyan }}>{r.disparos.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: NEON.magenta }}>{r.responderam.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: NEON.green, textShadow: `0 0 6px ${NEON.green}55` }}>{r.convertidos.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: "#cbd5e1" }}>{tr}%</td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: NEON.yellow }}>{tc}%</td>
                      </tr>
                    );
                  })}
                  {porEspecialidade.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center" style={{ color: "#64748b" }}>Sem dados de especialidade no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Conversão === */}
        <TabsContent value="conversao" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelCard title="Convertidos por colaborador" description="Leads com data_conversao no período" icon={UserCheck} accent={NEON.green}>
              <ResponsiveContainer width="100%" height={Math.max(280, convPorColaborador.length * 36)}>
                <BarChart data={convPorColaborador} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis dataKey="nome" type="category" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} width={120} />
                  <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(34,197,94,0.05)" }} />
                  <Bar dataKey="total" fill={NEON.green} name="Convertidos" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
              {convPorColaborador.length === 0 && (
                <p className="text-sm py-4 text-center" style={{ color: "#64748b" }}>Sem conversões no período.</p>
              )}
            </PanelCard>

            <PanelCard title="Motivos de não conversão" description="Status: descartado, fechado, encerrado, não respondeu" icon={XCircle} accent={NEON.orange}>
              {motivosNaoConversao.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: "#64748b" }}>Sem registros de não conversão no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={motivosNaoConversao}
                      dataKey="total"
                      nameKey="motivo"
                      innerRadius={50}
                      outerRadius={100}
                      paddingAngle={3}
                      stroke="#020617"
                      strokeWidth={2}
                    >
                      {motivosNaoConversao.map((_r, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [Number(v).toLocaleString(), n]} />
                    <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </PanelCard>
          </div>

          <PanelCard title="Detalhamento dos motivos" accent={NEON.orange}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: `${NEON.orange}33` }}>
                    <th className="py-2 px-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: NEON.orange }}>Motivo</th>
                    <th className="py-2 px-2 text-right text-[11px] uppercase tracking-wider font-semibold" style={{ color: NEON.orange }}>Total</th>
                    <th className="py-2 px-2 text-right text-[11px] uppercase tracking-wider font-semibold" style={{ color: NEON.orange }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const total = motivosNaoConversao.reduce((s, r) => s + r.total, 0);
                    return motivosNaoConversao.map((r) => (
                      <tr key={r.motivo} className="border-b hover:bg-orange-500/5 transition-colors" style={{ borderColor: "#1e293b" }}>
                        <td className="py-2 px-2 font-medium" style={{ color: "#e2e8f0" }}>{r.motivo}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: NEON.orange }}>{r.total.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: "#cbd5e1" }}>{total > 0 ? ((r.total / total) * 100).toFixed(1) : "0"}%</td>
                      </tr>
                    ));
                  })()}
                  {motivosNaoConversao.length === 0 && (
                    <tr><td colSpan={3} className="py-6 text-center" style={{ color: "#64748b" }}>Sem motivos registrados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Tráfego pago === */}
        <TabsContent value="trafego" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI icon={Send} label="Enviados" value={totaisTrafego.enviados.toLocaleString()} color={NEON.blue} />
            <KPI icon={MessageCircle} label="Responderam" value={totaisTrafego.responderam.toLocaleString()} color={NEON.magenta} />
            <KPI icon={Radio} label="Em conversa" value={totaisTrafego.emConversa.toLocaleString()} color={NEON.yellow} />
            <KPI icon={MousePointer} label="Aceitaram" value={totaisTrafego.aceitaram.toLocaleString()} color={NEON.cyan} />
            <KPI icon={Trophy} label="Convertidos" value={totaisTrafego.convertidos.toLocaleString()} color={NEON.green} />
          </div>

          <PanelCard title="Funil de conversão por proposta" description="Top 8 propostas com tráfego pago" accent={NEON.yellow}>
            <ResponsiveContainer width="100%" height={Math.max(280, topPropostas.length * 40)}>
              <BarChart data={topPropostas} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis dataKey="proposta_codigo" type="category" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} width={100} />
                <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(250,204,21,0.05)" }} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                <Bar dataKey="total_enviados" fill={NEON.cyan} name="Enviados" radius={[0,4,4,0]} />
                <Bar dataKey="total_responderam" fill={NEON.magenta} name="Responderam" radius={[0,4,4,0]} />
                <Bar dataKey="total_convertidos" fill={NEON.green} name="Convertidos" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </PanelCard>
        </TabsContent>

        {/* === Campanhas === */}
        <TabsContent value="campanhas" className="space-y-4">
          <PanelCard title="Top campanhas por conversão" accent={NEON.cyan}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: `${NEON.cyan}33` }}>
                    {["Campanha","Status","Leads","Contatados","Em conversa","Convertidos","Taxa conv."].map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-[11px] uppercase tracking-wider font-semibold ${i>=2?"text-right":""}`} style={{ color: NEON.cyan }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topCampanhas.map((c) => (
                    <tr key={c.campanha_id} className="border-b transition-colors hover:bg-cyan-500/5" style={{ borderColor: "#1e293b" }}>
                      <td className="py-2 px-2 font-medium" style={{ color: "#e2e8f0" }}>{c.campanha_nome}</td>
                      <td className="py-2 px-2"><Badge variant="outline" className="border-cyan-500/40 text-cyan-300">{c.campanha_status}</Badge></td>
                      <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{Number(c.total_leads).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{Number(c.contatados).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{Number(c.em_conversa).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-bold" style={{ color: NEON.green, textShadow: `0 0 6px ${NEON.green}55` }}>{Number(c.convertidos).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: NEON.magenta }}>{Number(c.taxa_conversao_pct ?? 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {topCampanhas.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center" style={{ color: "#64748b" }}>Sem campanhas no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Propostas === */}
        <TabsContent value="propostas" className="space-y-4">
          <PanelCard title="Conversões por proposta — Tráfego pago" description="Quais propostas e campanhas estão convertendo" accent={NEON.green}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: `${NEON.green}33` }}>
                    {["Proposta","Campanha","Enviados","Responderam","Em conversa","Aceitaram","Convertidos","Conv. %"].map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-[11px] uppercase tracking-wider font-semibold ${i>=2?"text-right":""}`} style={{ color: NEON.green }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(trafegoPago ?? []).map((r: any) => {
                    const env = Number(r.total_enviados) || 0;
                    const conv = Number(r.total_convertidos) || 0;
                    const pct = env > 0 ? ((conv / env) * 100).toFixed(1) : "0";
                    return (
                      <tr key={r.campanha_proposta_id} className="border-b hover:bg-green-500/5 transition-colors" style={{ borderColor: "#1e293b" }}>
                        <td className="py-2 px-2 font-medium" style={{ color: "#e2e8f0" }}>{r.proposta_codigo}</td>
                        <td className="py-2 px-2" style={{ color: "#94a3b8" }}>{r.campanha_nome}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{env.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: NEON.magenta }}>{Number(r.total_responderam).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{Number(r.total_em_conversa).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: NEON.cyan }}>{Number(r.total_aceitaram).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: NEON.green, textShadow: `0 0 6px ${NEON.green}55` }}>{conv.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: NEON.yellow }}>{pct}%</td>
                      </tr>
                    );
                  })}
                  {(trafegoPago ?? []).length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center" style={{ color: "#64748b" }}>Sem propostas com tráfego pago no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Canais & instâncias === */}
        <TabsContent value="canais" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { tipo: "WhatsApp / SigZap", icon: MessageSquare, cor: NEON.green, m: metricasPorCanal.whatsapp },
              { tipo: "Email", icon: Mail, cor: NEON.blue, m: metricasPorCanal.email },
              { tipo: "Tráfego Pago", icon: Megaphone, cor: NEON.yellow, m: metricasPorCanal.trafego },
              { tipo: "Instagram", icon: Instagram, cor: NEON.purple, m: metricasPorCanal.instagram },
            ].map(({ tipo, icon: Icon, cor, m }) => {
              const tr = m.enviados > 0 ? ((m.responderam / m.enviados) * 100).toFixed(1) : "0";
              const tc = m.enviados > 0 ? ((m.convertidos / m.enviados) * 100).toFixed(1) : "0";
              return (
                <div key={tipo} className="relative overflow-hidden rounded-xl border p-5 backdrop-blur-sm"
                  style={{ background: "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(2,6,23,0.95))", borderColor: `${cor}55`, boxShadow: `0 0 24px ${cor}22` }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-md" style={{ background: `${cor}22`, border: `1px solid ${cor}55` }}>
                      <Icon className="h-4 w-4" style={{ color: cor }} />
                    </div>
                    <span className="text-sm uppercase tracking-wider font-semibold" style={{ color: "#e2e8f0" }}>{tipo}</span>
                  </div>
                  <div className="text-3xl font-bold" style={{ color: "#f1f5f9", textShadow: `0 0 10px ${cor}66` }}>{m.enviados.toLocaleString()}</div>
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: "#64748b" }}>enviados</div>

                  <div className="mt-4 space-y-2 pt-3 border-t" style={{ borderColor: `${cor}22` }}>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: "#94a3b8" }}>Responderam</span>
                      <span className="font-mono" style={{ color: NEON.magenta }}>{m.responderam.toLocaleString()} <span className="text-xs opacity-70">({tr}%)</span></span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: "#94a3b8" }}>Convertidos</span>
                      <span className="font-mono font-bold" style={{ color: NEON.green }}>{m.convertidos.toLocaleString()} <span className="text-xs opacity-70">({tc}%)</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <PanelCard title="Instâncias de tráfego pago" description="Chips marcados como tráfego pago" icon={Radio} accent={NEON.yellow}>
            {chipsTrafego.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "#64748b" }}>
                Nenhuma instância marcada como tráfego pago. Marque instâncias em Configurações → Instâncias.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {chipsTrafego.map((c) => (
                  <div key={c.id} className="border rounded-lg p-3 flex items-center justify-between"
                    style={{ borderColor: `${NEON.yellow}33`, background: "rgba(15,23,42,0.5)" }}>
                    <div>
                      <div className="font-medium" style={{ color: "#e2e8f0" }}>{c.nome}</div>
                      <div className="text-xs" style={{ color: "#64748b" }}>{c.tipo_instancia ?? "—"}</div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: `${NEON.yellow}22`, color: NEON.yellow, border: `1px solid ${NEON.yellow}55` }}>TRÁFEGO</span>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
