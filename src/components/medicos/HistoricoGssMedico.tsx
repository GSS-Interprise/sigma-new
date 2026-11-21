// Aba "Na GSS" do prontuário do médico (21/11/2026, tabela da Ramone, item "Gestão do corpo clínico", parte 1).
// Pergunta da tela: "O que esse médico já fez com a GSS?" Quem usa: contratos, escalas e diretoria, antes de chamar
// o médico para um plantão ou de renovar com ele.
// Dados da RPC medico_historico_gss: escalas do Dr. Escala (casadas pelo nome, que o Dr. Escala não manda CRM),
// produção paga pelo financeiro (plantões e horas, sem valor) e campanhas de prospecção. CNES e currículo: parte 2 e 3.
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora dos tipos gerados
const db = supabase as any;
const TZ = "America/Sao_Paulo";

type Historico = {
  casado_pelo_nome: boolean;
  motivo_sem_casar: "sem_nome" | "nome_repetido" | null;
  resumo: { plantoes: number; horas: number; hospitais: number; primeiro: string | null; ultimo: string | null; proximos: number };
  por_hospital: { hospital: string; plantoes: number; horas: number; primeiro: string; ultimo: string; setores: string[] | null }[];
  proximos: { hospital: string; setor: string | null; inicio: string; fim: string | null }[];
  producao: { ano: number; mes: number; unidade: string; plantoes: number; horas: number; status: string | null }[];
  campanhas: { nome: string; status: string | null; data_primeiro_contato: string | null; resultado_final: string | null; created_at: string }[];
  fontes: { escalas_antigas_de: string | null; escalas_antigas_ate: string | null; dr_escala_desde: string | null; dr_escala_lido_em: string | null };
};

const n = (v: number) => Number(v || 0).toLocaleString("pt-BR");
const dataCurta = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const mesAno = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", month: "short", year: "numeric" }).replace(".", "") : "—";
const quandoPlantao = (ini: string, fim: string | null) => {
  const d = new Date(ini).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" });
  const h = (x: string) => new Date(x).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${d} · ${h(ini)}${fim ? `–${h(fim)}` : ""}`;
};
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const STATUS_CAMPANHA: Record<string, string> = {
  frio: "Na fila", contatado: "Contatado", em_conversa: "Em conversa", aquecido: "Aquecido", quente: "Quente",
  convertido: "Convertido", perdido: "Perdido", descartado: "Descartado",
};

export function HistoricoGssMedico({ medicoId }: { medicoId: string | null | undefined }) {
  const q = useQuery({
    queryKey: ["medico-historico-gss", medicoId],
    enabled: !!medicoId,
    queryFn: async () => {
      const { data, error } = await db.rpc("medico_historico_gss", { p_medico_id: medicoId });
      if (error) throw error;
      return data as Historico;
    },
    staleTime: 5 * 60_000,
  });

  if (!medicoId) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Este contato ainda não está no corpo clínico. O histórico aparece quando ele virar médico da GSS.</p>;
  }
  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (q.error) {
    const m = (q.error as Error).message;
    return <p className="py-8 text-center text-sm text-red-700">{m.includes("sem_permissao") ? "Você não tem acesso ao histórico dos médicos." : `Não deu para carregar o histórico: ${m}`}</p>;
  }
  const h = q.data!;
  const f = h.fontes;
  const periodo = [
    f.escalas_antigas_de && f.escalas_antigas_ate ? `${mesAno(f.escalas_antigas_de)} a ${mesAno(f.escalas_antigas_ate)}` : null,
    f.dr_escala_desde ? `desde ${dataCurta(f.dr_escala_desde)}` : null,
  ].filter(Boolean).join(" e ");

  return (
    <div className="space-y-5 text-sm">
      {!h.casado_pelo_nome && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {h.motivo_sem_casar === "nome_repetido"
            ? "Há outro médico com o mesmo nome no cadastro: as escalas do Dr. Escala não aparecem aqui para não misturar os dois."
            : "Médico sem nome no cadastro: as escalas do Dr. Escala não têm como ser ligadas a ele."}
        </p>
      )}

      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero rotulo="Plantões feitos" valor={n(h.resumo.plantoes)} apoio={h.resumo.plantoes ? `${n(h.resumo.horas)} h` : undefined} />
          <Numero rotulo="Hospitais" valor={n(h.resumo.hospitais)} />
          <Numero rotulo="Com a GSS" valor={h.resumo.primeiro ? `desde ${mesAno(h.resumo.primeiro)}` : "—"}
            apoio={h.resumo.ultimo ? `último ${dataCurta(h.resumo.ultimo)}` : undefined} />
          <Numero rotulo="Próximos plantões" valor={n(h.resumo.proximos)} />
        </div>
        {periodo && <p className="mt-2 text-xs text-muted-foreground">Escalas do Dr. Escala de {periodo}.</p>}
      </section>

      <section>
        <h4 className="mb-2 font-semibold">Onde trabalhou</h4>
        {h.por_hospital.length === 0 ? (
          <p className="text-muted-foreground">Nenhum plantão encontrado nas escalas do Dr. Escala.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {h.por_hospital.map((x) => (
              <li key={x.hospital} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium" title={x.hospital}>{x.hospital}</span>
                  <span className="block truncate text-xs text-muted-foreground" title={(x.setores ?? []).join(", ")}>
                    {[(x.setores ?? []).join(", "), `${dataCurta(x.primeiro)} a ${dataCurta(x.ultimo)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="whitespace-nowrap text-right tabular-nums">
                  {n(x.plantoes)} {x.plantoes === 1 ? "plantão" : "plantões"}
                  <span className="block text-xs text-muted-foreground">{n(x.horas)} h</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {h.proximos.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 font-semibold"><CalendarClock className="h-4 w-4" />Próximos plantões</h4>
          <ul className="divide-y rounded-md border">
            {h.proximos.map((p, i) => (
              <li key={`${p.inicio}-${i}`} className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3 px-3 py-2">
                <span className="tabular-nums text-muted-foreground">{quandoPlantao(p.inicio, p.fim)}</span>
                <span className="truncate" title={[p.hospital, p.setor].filter(Boolean).join(" · ")}>{[p.hospital, p.setor].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
          {h.resumo.proximos > h.proximos.length && (
            <p className="mt-1 text-xs text-muted-foreground">Mostrando os {h.proximos.length} primeiros de {n(h.resumo.proximos)}.</p>
          )}
        </section>
      )}

      <section>
        <h4 className="mb-2 font-semibold">Produção paga pelo financeiro</h4>
        {h.producao.length === 0 ? (
          <p className="text-muted-foreground">Nenhum fechamento do financeiro com este médico.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {h.producao.map((p) => (
              <li key={`${p.ano}-${p.mes}-${p.unidade}`} className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                <span className="tabular-nums text-muted-foreground">{MES[p.mes - 1]}/{String(p.ano).slice(2)}</span>
                <span className="truncate" title={p.unidade}>{p.unidade}</span>
                <span className="whitespace-nowrap tabular-nums">{p.plantoes ? `${n(p.plantoes)} plantões` : `${n(p.horas)} h`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 font-semibold"><Megaphone className="h-4 w-4" />Campanhas de prospecção</h4>
        {h.campanhas.length === 0 ? (
          <p className="text-muted-foreground">Não entrou em nenhuma campanha.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {h.campanhas.map((c, i) => (
              <li key={`${c.nome}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium" title={c.nome}>{c.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.data_primeiro_contato ? `1º contato em ${dataCurta(c.data_primeiro_contato)}` : "Ainda sem 1º contato"}
                  </span>
                </span>
                <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs">{STATUS_CAMPANHA[c.status ?? ""] ?? c.status ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Numero({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums" title={valor}>{valor}</p>
      {apoio && <p className="text-xs text-muted-foreground">{apoio}</p>}
    </div>
  );
}
