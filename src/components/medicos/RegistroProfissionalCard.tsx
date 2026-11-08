import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Building2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Bloco "Registro profissional" da ficha: o que o CFM e o CNES dizem do médico.
 * CFM vem da base importada (sem consulta nova); a foto do CFM exige captcha, então fica o link.
 * CNES é consultado sob demanda pela edge medico-cnes e guardado em medico_cnes.
 */

type Vinculo = {
  estabelecimento: string; cnes: string; municipio: string; uf: string; cbo: string; sus: boolean;
  vinculacao: string; ch_amb: number; ch_hosp: number; ch_outros: number;
};
type Registro = {
  crm: string | null;
  uf: string | null;
  cfm: null | {
    nome: string; situacao: string | null; tipo_inscricao: string | null; dt_inscricao: string | null;
    especialidades: { nome: string; rqe: string | null }[];
    outras_inscricoes: { uf: string; crm: string; situacao: string | null }[];
  };
  cnes: null | {
    status: "ok" | "ambiguo" | "nao_encontrado" | "erro"; competencia: string | null; vinculos: Vinculo[];
    candidatos: { cns: string; nome: string; locais: string[] }[]; consultado_em: string;
  };
};

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
const titulo = (s: string) => s.toLowerCase().split(" ")
  .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.replace(/(^|[/(])\S/g, (c) => c.toUpperCase())))
  .join(" ");

export function RegistroProfissionalCard({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["lead-registro-profissional", leadId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("lead_registro_profissional", { p_lead_id: leadId });
      if (error) throw error;
      return data as Registro;
    },
  });

  const buscar = useMutation({
    mutationFn: async (cns?: string) => {
      const { data: r, error } = await supabase.functions.invoke("medico-cnes", { body: { lead_id: leadId, cns } });
      if (error) throw error;
      if (!r?.ok) throw new Error(r?.error || "falhou");
      return r as { status: string; vinculos?: number; candidatos?: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["lead-registro-profissional", leadId] });
      if (r.status === "ok") toast.success(r.vinculos ? `${r.vinculos} vínculos encontrados no CNES.` : "Está no CNES, sem vínculo ativo.");
      else if (r.status === "ambiguo") toast.message("Há mais de um profissional com esse nome. Escolha qual é.");
      else toast.message("Não achei esse nome no CNES.");
    },
    onError: (e: any) => toast.error(`O CNES não respondeu: ${e?.message || e}. Tente de novo em instantes.`),
  });

  if (isLoading) return <Card className="p-4"><Skeleton className="h-24 w-full" /></Card>;
  if (!data) return null;
  const { cfm, cnes } = data;
  const regular = (cfm?.situacao || "").toLowerCase().startsWith("regular");
  const chTotal = (v: Vinculo) => v.ch_amb + v.ch_hosp + v.ch_outros;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BadgeCheck className="h-4 w-4 text-muted-foreground" />
          Registro profissional
        </h3>
        <a href="https://portal.cfm.org.br/busca-medicos" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Ver foto no CFM <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* CFM */}
      {!data.crm ? (
        <p className="text-sm text-muted-foreground">Sem CRM no cadastro.</p>
      ) : !cfm ? (
        <p className="text-sm text-muted-foreground">CRM {data.crm}/{data.uf} não está na base do CFM importada.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">CRM {data.crm}/{data.uf}</span>
            {" · "}
            <span className={cn("font-medium", regular ? "text-emerald-700" : "text-red-600")}>{cfm.situacao || "situação desconhecida"}</span>
            {cfm.tipo_inscricao && <span className="text-muted-foreground"> · {cfm.tipo_inscricao}</span>}
            {cfm.dt_inscricao && <span className="text-muted-foreground"> · desde {cfm.dt_inscricao}</span>}
          </p>
          {cfm.especialidades.length > 0 ? (
            <ul className="space-y-0.5">
              {cfm.especialidades.map((e) => (
                <li key={e.nome + e.rqe}>{titulo(e.nome)}{e.rqe && <span className="text-muted-foreground"> · RQE {e.rqe}</span>}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Sem especialidade registrada (RQE) no CFM.</p>
          )}
          {cfm.outras_inscricoes.length > 0 && (
            <p className="text-muted-foreground">
              Também inscrito em {cfm.outras_inscricoes.map((o) => `${o.uf} (${o.crm})`).join(", ")}
            </p>
          )}
        </div>
      )}

      {/* CNES */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Onde trabalha (CNES)
            {cnes?.status === "ok" && cnes.competencia && <span className="font-normal text-muted-foreground">· {cnes.competencia}</span>}
          </p>
          {cnes && cnes.status !== "ambiguo" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={buscar.isPending} onClick={() => buscar.mutate(undefined)}>
              {buscar.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              Atualizar
            </Button>
          )}
        </div>

        {!cnes && (
          <Button variant="outline" size="sm" disabled={buscar.isPending} onClick={() => buscar.mutate(undefined)}>
            {buscar.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {buscar.isPending ? "Consultando o CNES" : "Buscar no CNES"}
          </Button>
        )}

        {cnes?.status === "nao_encontrado" && <p className="text-sm text-muted-foreground">Não achei esse nome no CNES.</p>}
        {cnes?.status === "erro" && <p className="text-sm text-red-600">O CNES não respondeu na última tentativa.</p>}

        {cnes?.status === "ambiguo" && (
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">Mais de um profissional com esse nome. Qual é?</p>
            <ul className="divide-y rounded-md border">
              {cnes.candidatos.map((c) => (
                <li key={c.cns} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{c.locais.join(", ") || "Sem vínculo ativo"}</span>
                  <Button variant="outline" size="sm" className="h-7 shrink-0" disabled={buscar.isPending} onClick={() => buscar.mutate(c.cns)}>É este</Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {cnes?.status === "ok" && (cnes.vinculos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Está no CNES, sem vínculo ativo nesta competência.</p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-[44%] pb-1 font-medium">Estabelecimento</th>
                <th className="w-[34%] pb-1 font-medium">Função</th>
                <th className="w-[22%] pb-1 text-right font-medium">Horas/semana</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cnes.vinculos.map((v, i) => (
                <tr key={v.cnes + v.cbo + i} className="align-top">
                  <td className="py-1.5 pr-3">
                    <p className="truncate">{titulo(v.estabelecimento || "")}</p>
                    <p className="truncate text-xs text-muted-foreground">{titulo(v.municipio || "")}-{v.uf}{v.sus ? " · SUS" : ""}</p>
                  </td>
                  <td className="py-1.5 pr-3"><p className="truncate">{titulo((v.cbo || "").replace(/^MEDICO\s+/i, ""))}</p>
                    <p className="truncate text-xs text-muted-foreground">{titulo(v.vinculacao || "")}</p></td>
                  <td className="py-1.5 text-right tabular-nums">
                    {chTotal(v)}
                    <p className="text-xs text-muted-foreground">{v.ch_amb} amb · {v.ch_hosp} hosp</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </Card>
  );
}
