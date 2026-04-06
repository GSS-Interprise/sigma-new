import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChartsProps {
  porUf: { uf: string; quantidade: number }[];
  porEspecialidade: { programa: string; quantidade: number }[];
  porPeriodo: { periodo: string; quantidade: number }[];
  evolucaoAno: { ano: number; quantidade: number }[];
  porInstituicao: { instituicao: string; certificados: number }[];
  selectedUf?: string | null;
  onUfClick?: (uf: string | null) => void;
}

const PIE_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#10b981", "#f97316"];

const CustomTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">{payload[0].value.toLocaleString("pt-BR")}</p>
    </div>
  );
};

export function ResidentesCharts({ porUf, porEspecialidade, porPeriodo }: ChartsProps) {
  const totalCerts = porEspecialidade.reduce((s, e) => s + e.quantidade, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Certificados por UF */}
      <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30">
          <h3 className="text-xs font-semibold text-foreground tracking-wide">Certificados por UF</h3>
        </div>
        <div className="p-3 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porUf.slice(0, 15)} margin={{ bottom: 24, left: -10 }}>
              <XAxis
                dataKey="uf"
                fontSize={9}
                angle={-45}
                textAnchor="end"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                fontSize={9}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltipContent />} cursor={{ fill: "hsl(var(--muted)/0.2)" }} />
              <Bar dataKey="quantidade" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Certificados por Especialidade */}
      <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30">
          <h3 className="text-xs font-semibold text-foreground tracking-wide">Certificados por Especialidade</h3>
        </div>
        <ScrollArea className="h-[220px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border/30">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Programa</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Qtd</th>
              </tr>
            </thead>
            <tbody>
              {porEspecialidade.slice(0, 20).map((e, i) => (
                <tr key={i} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 truncate max-w-[200px]">{e.programa}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{e.quantidade.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-bold">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right tabular-nums">{totalCerts.toLocaleString("pt-BR")}</td>
              </tr>
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {/* Períodos Pie */}
      <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30">
          <h3 className="text-xs font-semibold text-foreground tracking-wide">Distribuição por Período</h3>
        </div>
        <div className="p-3 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={porPeriodo}
                dataKey="quantidade"
                nameKey="periodo"
                cx="50%"
                cy="45%"
                innerRadius={40}
                outerRadius={75}
                paddingAngle={3}
                label={({ periodo, percent }) => `${periodo} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                fontSize={9}
                strokeWidth={0}
              >
                {porPeriodo.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => v.toLocaleString("pt-BR")}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border)/0.5)",
                  fontSize: "11px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                }}
              />
              <Legend
                iconSize={6}
                iconType="circle"
                wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
