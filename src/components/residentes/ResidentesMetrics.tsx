import { Award, Clock, Users, Stethoscope, Building2 } from "lucide-react";

interface ResidentesMetricsProps {
  certificadosEmitidos: number;
  emAndamento: number;
  profissionais: number;
  especialidades: number;
  instituicoes: number;
}

export function ResidentesMetrics({ certificadosEmitidos, emAndamento, profissionais, especialidades, instituicoes }: ResidentesMetricsProps) {
  const metrics = [
    { label: "Certificados Emitidos", value: certificadosEmitidos, icon: Award, accent: "from-blue-500/20 to-blue-600/5", iconColor: "text-blue-500" },
    { label: "Em Andamento", value: emAndamento, icon: Clock, accent: "from-amber-500/20 to-amber-600/5", iconColor: "text-amber-500" },
    { label: "Profissionais", value: profissionais, icon: Users, accent: "from-emerald-500/20 to-emerald-600/5", iconColor: "text-emerald-500" },
    { label: "Especialidades", value: especialidades, icon: Stethoscope, accent: "from-violet-500/20 to-violet-600/5", iconColor: "text-violet-500" },
    { label: "Instituições", value: instituicoes, icon: Building2, accent: "from-rose-500/20 to-rose-600/5", iconColor: "text-rose-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.label}
            className="group relative overflow-hidden rounded-xl border border-border/40 bg-card p-3 transition-all hover:shadow-md hover:border-border/80"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${m.accent} opacity-60`} />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <Icon className={`h-4 w-4 ${m.iconColor}`} />
              </div>
              <p className="text-xl font-bold tracking-tight">{m.value.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{m.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
