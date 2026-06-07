import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, PhoneOff, Flame } from "lucide-react";

interface Props {
  tempoMedioQuente: number | null; // horas
  quentesAtrasados: Array<{ nome: string; quentes?: number | null; quente_mais_antigo_h?: number | null }>;
  descartadosPhone: number;
  totalQuentes: number;
  contatado: number;
}

/**
 * Dashboard Fase 3 — Saúde operacional (onde agir).
 * Junta os sinais de atenção num bloco e os traduz em AÇÃO pra gestão
 * (não só repete números): tempo médio quente, quentes esfriando, base sem WhatsApp.
 * Snapshot/relatório já é coberto pelo Exportar (PDF). Tendência de conversão
 * espera mais volume de convertidos pra valer um gráfico.
 */
export function DashboardSaudeFase3({ tempoMedioQuente, quentesAtrasados, descartadosPhone, totalQuentes, contatado }: Props) {
  // tempo médio quente → cor + tradução
  const h = tempoMedioQuente ?? 0;
  const tempoLabel = tempoMedioQuente == null ? "—" : h >= 48 ? `${Math.round(h / 24)} dias` : `${Math.round(h)}h`;
  const tempoTone = h >= 24 ? "red" : h >= 12 ? "amber" : "emerald";
  const tempoMsg =
    tempoMedioQuente == null
      ? "Sem leads quentes no período."
      : h >= 24
      ? "Leads quentes esfriando — priorizar o atendimento."
      : h >= 12
      ? "Atenção ao tempo de resposta."
      : "Tempo de atendimento saudável.";

  const qtdQuentesAtrasados = quentesAtrasados.reduce((a, c) => a + (c.quentes ?? 0), 0);
  const semWppPct = contatado > 0 ? Math.round((descartadosPhone / (contatado + descartadosPhone)) * 100) : 0;

  const TONE: Record<string, string> = {
    red: "text-red-700 border-red-200 bg-red-50",
    amber: "text-amber-700 border-amber-200 bg-amber-50",
    emerald: "text-emerald-700 border-emerald-200 bg-emerald-50",
  };

  return (
    <div className="border rounded-lg p-4 bg-card">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 text-amber-600" /> Saúde operacional — onde agir
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Tempo médio quente */}
        <div className={cn("rounded-md border p-3", TONE[tempoTone])}>
          <div className="text-xs flex items-center gap-1.5 opacity-80"><Clock className="h-3.5 w-3.5" /> Tempo médio do quente</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{tempoLabel}</div>
          <div className="text-xs mt-1 opacity-90">{tempoMsg}</div>
        </div>

        {/* Quentes esperando */}
        <div className={cn("rounded-md border p-3", qtdQuentesAtrasados > 0 ? TONE.red : "bg-muted/30")}>
          <div className="text-xs flex items-center gap-1.5 opacity-80"><Flame className="h-3.5 w-3.5" /> Quentes esperando &gt;24h</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{qtdQuentesAtrasados}</div>
          <div className="text-xs mt-1 opacity-90">
            {quentesAtrasados.length === 0
              ? "Nenhum quente atrasado ✓"
              : `em ${quentesAtrasados.length} campanha(s): ${quentesAtrasados.slice(0, 2).map((c) => c.nome.trim()).join(", ")}${quentesAtrasados.length > 2 ? "…" : ""}`}
          </div>
        </div>

        {/* Sem WhatsApp */}
        <div className="rounded-md border p-3 bg-muted/30">
          <div className="text-xs flex items-center gap-1.5 text-muted-foreground"><PhoneOff className="h-3.5 w-3.5" /> Médicos sem WhatsApp</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{descartadosPhone.toLocaleString("pt-BR")}</div>
          <div className="text-xs mt-1 text-muted-foreground">{semWppPct}% da base contatada — qualidade da fonte</div>
        </div>
      </div>
    </div>
  );
}
