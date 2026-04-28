import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, FileText, TrendingUp, Wallet, Search } from "lucide-react";
import { useSigFincResumo } from "@/hooks/useSigFincResumo";

interface Props {
  mesReferencia?: number;
  anoReferencia?: number;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export function FinanceiroSigFinc({ mesReferencia, anoReferencia }: Props) {
  const { data, isLoading } = useSigFincResumo({ mesReferencia, anoReferencia });
  const [busca, setBusca] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(
      (r) =>
        r.nome_completo?.toLowerCase().includes(q) ||
        r.crm?.toLowerCase().includes(q) ||
        (r.especialidade ?? []).some((e) => e?.toLowerCase().includes(q)),
    );
  }, [data, busca]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totals = data?.totals ?? {
    medicos: 0,
    propostas: 0,
    valor_previsto_medico: 0,
    valor_previsto_contrato: 0,
    valor_realizado: 0,
  };

  const margemPrevista = totals.valor_previsto_contrato - totals.valor_previsto_medico;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Médicos ativos com proposta"
          value={String(totals.medicos)}
          tone="primary"
        />
        <KpiCard
          icon={<FileText className="h-5 w-5" />}
          label="Propostas vinculadas"
          value={String(totals.propostas)}
          tone="muted"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Previsto (contrato)"
          value={fmt(totals.valor_previsto_contrato)}
          subtitle={`Médico: ${fmt(totals.valor_previsto_medico)} • Margem: ${fmt(margemPrevista)}`}
          tone="success"
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label="Realizado (pagamentos)"
          value={fmt(totals.valor_realizado)}
          subtitle={
            mesReferencia && anoReferencia
              ? `Período: ${String(mesReferencia).padStart(2, "0")}/${anoReferencia}`
              : "Todos os períodos"
          }
          tone="warning"
        />
      </div>

      {/* Busca */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CRM ou especialidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-md"
          />
          <Badge variant="secondary" className="ml-auto">
            {rows.length} médico{rows.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </Card>

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Médico</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead className="text-center">Propostas</TableHead>
                <TableHead className="text-right">Previsto Médico</TableHead>
                <TableHead className="text-right">Previsto Contrato</TableHead>
                <TableHead className="text-right">Realizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum médico ativo com propostas vinculadas
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.medico_id}>
                    <TableCell className="font-medium">{r.nome_completo}</TableCell>
                    <TableCell className="text-muted-foreground">{r.crm ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.especialidade ?? []).slice(0, 2).map((e, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {e}
                          </Badge>
                        ))}
                        {(r.especialidade ?? []).length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{(r.especialidade ?? []).length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{r.qtd_propostas}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.valor_previsto_medico)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {fmt(r.valor_previsto_contrato)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-primary">
                      {fmt(r.valor_realizado)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  subtitle,
  tone = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone?: "primary" | "success" | "warning" | "muted";
}) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-md ${toneMap[tone]}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold tabular-nums truncate">{value}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </Card>
  );
}