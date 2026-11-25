// SLA ao vivo (redesenho 22/11/2026). Pergunta da tela: "algum exame vai estourar o prazo, e o médico já sabe?".
// Quem usa: Ramone, Wagner e Brenda (coordenação). Decisão: ligar para alguém agora ou não.
// Topo: a situação numa frase (vencidos sem dono / perto do prazo / tudo no prazo) e a fila por origem.
// Meio: a fila pela urgência, e ao lado quem está de plantão agora e como foram os avisos de hoje.
// A estação só aparece grande quando quebra (aí vira o destaque, com o que fazer).
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { BellOff, CheckCircle2, Clock, MonitorX, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ORIGEM, type Alerta, type Exame, type Origem, diaHora, duracao, ehHoje, horaCurta, situacaoPrazo, useAlertas, useAvisosHoje,
  type UnidadeId, useColetor, useEscala, useEstacoes, useFila, usePrazos, useUnidade,
} from "./useSla";
import { ExameSlaDialog } from "./ExameSlaDialog";

const TIPO_ALERTA: Record<Alerta["tipo"], string> = { prazo: "Perto do prazo", vencido: "Prazo vencido", sem_escala: "Sem escala", assumido_vencido: "Assumido, prazo vencido" };
// Cor da faixa da origem igual à do Vue PACS (vermelho PS, laranja internado, azul externo).
const FAIXA: Record<Origem, string> = { ps: "bg-red-600", internado: "bg-orange-500", externo: "bg-sky-500" };
const ORDEM_ORIGEM: Origem[] = ["ps", "internado", "externo"];

function situacao(e: Exame, alertas: Alerta[]) {
  if (e.silenciado_em) return { texto: "Não precisa de laudo", tom: "bg-muted text-muted-foreground" };
  if (e.assumido_em) {
    // Assumiu e o prazo venceu sem laudo: o robô avisou quem assumiu e a Coordenação (25/11).
    const venceu = alertas.find((a) => a.exame_id === e.id && a.tipo === "assumido_vencido");
    if (venceu) return { texto: `Assumido${e.assumido_por ? ` por ${e.assumido_por}` : ""} · prazo venceu sem laudo`, tom: "bg-amber-50 text-amber-900" };
    return { texto: `Assumido${e.assumido_por ? ` por ${e.assumido_por}` : ""} às ${horaCurta(e.assumido_em)}`, tom: "bg-emerald-50 text-emerald-800" };
  }
  const ultimo = alertas.find((a) => a.exame_id === e.id);
  if (!ultimo) return { texto: "Sem aviso ainda", tom: "bg-muted text-muted-foreground" };
  if (ultimo.status === "falhou") return { texto: `Aviso falhou às ${horaCurta(ultimo.criado_em)}`, tom: "bg-red-50 text-red-800" };
  if (ultimo.tipo === "sem_escala" || ultimo.papel === "sem_escala") return { texto: `Ninguém na escala · e-mail às ${horaCurta(ultimo.criado_em)}`, tom: "bg-amber-50 text-amber-900" };
  return { texto: `Avisado às ${horaCurta(ultimo.criado_em)}${ultimo.destino_nome ? ` · ${ultimo.destino_nome}` : ""}`, tom: "bg-sky-50 text-sky-900" };
}

export function AbaSlaAoVivo() {
  const unidade = useUnidade();
  const fila = useFila();
  const coletor = useColetor();
  const prazos = usePrazos();
  const escala = useEscala(2);
  const hoje = useAvisosHoje();
  const ids = useMemo(() => (fila.data ?? []).map((e) => e.id), [fila.data]);
  const alertasFila = useAlertas(ids);
  const recentes = useAlertas();
  const [agora, setAgora] = useState(Date.now());
  const [filtro, setFiltro] = useState<"atencao" | "todos">("atencao");
  const [aberto, setAberto] = useState<Exame | null>(null);
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const linhas = useMemo(() => {
    const ordem = { vencido: 0, perto: 1, ok: 2 } as const;
    return (fila.data ?? []).map((e) => ({ e, s: situacaoPrazo(e, agora) }))
      .sort((a, b) => ordem[a.s.estado] - ordem[b.s.estado] || a.s.faltaMin - b.s.faltaMin);
  }, [fila.data, agora]);
  const semDono = (l: (typeof linhas)[number]) => !l.e.assumido_em && !l.e.silenciado_em;
  const vencidosSemDono = linhas.filter((l) => l.s.estado === "vencido" && semDono(l));
  const pertoSemDono = linhas.filter((l) => l.s.estado === "perto" && semDono(l));
  const atencao = linhas.filter((l) => l.s.estado !== "ok" && semDono(l));
  const visiveis = filtro === "atencao" ? atencao : linhas;
  const alertas = alertasFila.data ?? [];
  const queda = coletor.data?.queda ?? null;
  const proximo = linhas.find((l) => l.s.estado !== "vencido" && semDono(l));
  const dePlantao = (escala.data ?? []).filter((p) => p.papel === "plantonista" && new Date(p.inicio).getTime() <= agora && new Date(p.fim).getTime() > agora);
  const proximoPlantao = (escala.data ?? []).filter((p) => p.papel === "plantonista" && new Date(p.inicio).getTime() > agora)[0];

  // A frase do topo: o que pede ação primeiro.
  const tom = queda ? "parada" : vencidosSemDono.length ? "vencido" : pertoSemDono.length ? "perto" : "ok";
  const cartao = {
    parada: "border-slate-300 bg-slate-50",
    vencido: "border-red-200 bg-red-50",
    perto: "border-amber-200 bg-amber-50",
    ok: "border-emerald-200 bg-emerald-50/70",
  }[tom];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <FaixaEstacoes atual={unidade.id} trocar={unidade.trocar} />
        {coletor.data && (!coletor.data.alertasAtivos
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-amber-900"><BellOff className="h-3.5 w-3.5" />Avisos ao médico desligados</span>
          : coletor.data.testeDestino
            ? <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">Avisos em modo teste: vão para o número de teste, não para o médico</span>
            : <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Avisos ao médico ligados</span>)}
      </div>

      {queda && <EstacaoParada queda={queda} unidade={unidade.nome} unidadeId={unidade.id} />}

      <div className="grid gap-4 xl:grid-cols-12">
        <section className={cn("rounded-xl border p-5 xl:col-span-5", cartao)}>
          {fila.isLoading ? <Skeleton className="h-24 w-full" /> : (
            <>
              <p className="text-sm font-medium text-muted-foreground">{unidade.nome} agora</p>
              {tom === "parada" ? (
                <Frase grande="Fila desatualizada" linha="Enquanto a estação estiver parada, o Sigma não sabe o que está esperando laudo." />
              ) : tom === "vencido" ? (
                <Frase grande={`${vencidosSemDono.length} ${vencidosSemDono.length === 1 ? "exame vencido" : "exames vencidos"} sem ninguém`}
                  linha={<>O mais atrasado venceu há <strong className="whitespace-nowrap">{duracao(-vencidosSemDono[0].s.faltaMin)}</strong>. Confira se o plantonista viu.</>} />
              ) : tom === "perto" ? (
                <Frase grande={`${pertoSemDono.length} perto do prazo`}
                  linha={<>O próximo vence em <strong className="whitespace-nowrap">{duracao(pertoSemDono[0].s.faltaMin)}</strong>. O aviso ao plantonista já sai sozinho.</>} />
              ) : linhas.length ? (
                <Frase grande="Tudo no prazo" linha={<>{linhas.length} {linhas.length === 1 ? "exame" : "exames"} na fila{proximo ? <>; o próximo vence em <strong className="whitespace-nowrap">{duracao(proximo.s.faltaMin)}</strong></> : null}.</>} />
              ) : (
                <Frase grande="Fila vazia" linha="Nenhum exame esperando laudo agora." />
              )}
              <BarraFila vencido={linhas.filter((l) => l.s.estado === "vencido").length} perto={linhas.filter((l) => l.s.estado === "perto").length}
                ok={linhas.filter((l) => l.s.estado === "ok").length} />
            </>
          )}
        </section>
        <div className="grid gap-4 sm:grid-cols-3 xl:col-span-7">
          {ORDEM_ORIGEM.map((o) => {
            const da = linhas.filter((l) => l.e.origem === o);
            const venc = da.filter((l) => l.s.estado === "vencido" && semDono(l)).length;
            const prox = da.find((l) => l.s.estado !== "vencido" && semDono(l));
            return (
              <div key={o} className="relative overflow-hidden rounded-xl border bg-card p-4 pl-5">
                <span className={cn("absolute inset-y-0 left-0 w-1.5", FAIXA[o])} aria-hidden />
                <p className="truncate text-sm font-semibold" title={ORIGEM[o].nome}>{ORIGEM[o].nome}</p>
                <p className="text-xs text-muted-foreground">prazo de {prazoDaFila(da.map((l) => l.e), prazos.data?.[o])}</p>
                <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{fila.isLoading ? "–" : da.length}</p>
                <p className="text-xs text-muted-foreground">na fila</p>
                <div className="mt-3 space-y-0.5 text-xs">
                  <p className={venc ? "font-semibold text-red-700" : "text-muted-foreground"}>{venc ? `${venc} ${venc === 1 ? "vencido" : "vencidos"} sem dono` : "nenhum vencido"}</p>
                  <p className="text-muted-foreground">{prox ? <>próximo vence em <span className="whitespace-nowrap">{duracao(prox.s.faltaMin)}</span></> : "nada a vencer"}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-xl border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold">Fila de laudos</h2>
              {queda && <p className="text-xs text-red-700">Desatualizada: é a fila da última leitura ({queda.ultima_ok_em ? diaHora(queda.ultima_ok_em) : "antes da queda"}).</p>}
            </div>
            <div className="inline-flex rounded-lg border p-0.5" role="radiogroup" aria-label="Filtro da fila">
              {([["atencao", `Precisam de atenção · ${atencao.length}`], ["todos", `Fila inteira · ${linhas.length}`]] as const).map(([id, r]) => (
                <button key={id} type="button" role="radio" aria-checked={filtro === id} onClick={() => setFiltro(id)}
                  className={cn("h-8 whitespace-nowrap rounded-md px-3 text-sm font-medium", filtro === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{r}</button>
              ))}
            </div>
          </header>
          {fila.isLoading && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}
          {fila.error && <p className="p-5 text-sm text-red-700">Não deu para carregar a fila: {(fila.error as Error).message}</p>}
          {!fila.isLoading && !fila.error && visiveis.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span>
              <p className="font-medium">{linhas.length === 0 ? "Nenhum exame esperando laudo" : "Nada pedindo atenção agora"}</p>
              <p className="text-sm text-muted-foreground">
                {queda ? "A estação está parada: a fila volta a aparecer quando ela voltar a ler o PACS."
                  : linhas.length === 0 ? "Quando entrar exame no PACS, ele aparece aqui em até 3 minutos." : `${linhas.length} na fila, todos no prazo ou já assumidos.`}
              </p>
              {filtro === "atencao" && linhas.length > 0 && <Button size="sm" variant="outline" className="mt-1" onClick={() => setFiltro("todos")}>Ver a fila inteira</Button>}
            </div>
          )}
          <ul className="divide-y">
            {visiveis.map(({ e, s }) => {
              const sit = situacao(e, alertas);
              const cor = s.estado === "vencido" ? "text-red-700" : s.estado === "perto" ? "text-amber-700" : "text-foreground";
              return (
                <li key={e.id} className="relative flex items-center gap-4 py-3 pl-5 pr-4">
                  <span className={cn("absolute inset-y-2 left-0 w-1 rounded-r", FAIXA[e.origem])} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="truncate font-semibold" title={e.paciente ?? undefined}>{e.paciente || "Paciente não lido"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{ORIGEM[e.origem].curto}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={e.estudo ?? undefined}>
                      {e.estudo ? `${e.estudo} · ` : ""}exame {ehHoje(e.inicio_em) ? `das ${horaCurta(e.inicio_em)}` : `de ${diaHora(e.inicio_em)}`}
                    </p>
                  </div>
                  <span className={cn("hidden max-w-[220px] shrink-0 truncate rounded-full px-2.5 py-1 text-xs lg:inline-block", sit.tom)} title={sit.texto}>{sit.texto}</span>
                  {/* 144 px: "venceu há 10 h 59 min" (o texto mais longo) cabe sem passar da coluna */}
                  <div className="w-[144px] shrink-0 text-right">
                    <p className={cn("whitespace-nowrap text-sm font-semibold tabular-nums", cor)}>
                      {s.faltaMin <= 0 ? `venceu há ${duracao(-s.faltaMin)}` : `vence em ${duracao(s.faltaMin)}`}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className={cn("h-full rounded-full", s.estado === "vencido" ? "bg-red-600" : s.estado === "perto" ? "bg-amber-500" : "bg-emerald-500")}
                        style={{ width: `${Math.min(100, s.pct * 100)}%` }} />
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setAberto(e)}>Abrir</Button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-display text-base font-semibold">De plantão agora</h2>
            {escala.isLoading ? <Skeleton className="mt-3 h-10 w-full" /> : dePlantao.length ? (
              <ul className="mt-3 space-y-3">
                {dePlantao.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{p.modalidade ? `${p.modalidade} · ` : ""}até {horaCurta(p.fim)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-amber-900">Ninguém na escala agora: os avisos vão só por e-mail para a coordenação.</p>
            )}
            {proximoPlantao && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Próximo: {proximoPlantao.nome}, {ehHoje(proximoPlantao.inicio) ? `às ${horaCurta(proximoPlantao.inicio)}` : diaHora(proximoPlantao.inicio)}</p>}
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-display text-base font-semibold">Avisos de hoje</h2>
            {hoje.isLoading ? <Skeleton className="mt-3 h-16 w-full" /> : (
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <Numero valor={hoje.data?.enviados ?? 0} rotulo={`enviados · ${hoje.data?.exames ?? 0} exames`} />
                <Numero valor={hoje.data?.assumidos ?? 0} rotulo="assumidos pelo médico" tom={hoje.data?.assumidos ? "text-emerald-700" : undefined} />
                <Numero valor={hoje.data?.medianaMin == null ? "—" : duracao(hoje.data.medianaMin)} rotulo="até assumir (mediana)" />
                <Numero valor={hoje.data?.falhas ?? 0} rotulo="falharam" tom={hoje.data?.falhas ? "text-red-700" : undefined} />
              </dl>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-display text-base font-semibold">Últimos avisos</h2>
            {recentes.isLoading && <Skeleton className="mt-3 h-8 w-full" />}
            {!recentes.isLoading && !(recentes.data ?? []).length && <p className="mt-3 text-sm text-muted-foreground">Nenhum aviso enviado ainda.</p>}
            <ul className="mt-3 space-y-2.5">
              {(recentes.data ?? []).slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-start gap-2.5 text-sm">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.status === "falhou" ? "bg-red-600" : a.status === "respondido" ? "bg-emerald-600" : "bg-sky-500")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate"><span className="font-medium">{TIPO_ALERTA[a.tipo]}</span> · {a.destino_nome ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {diaHora(a.criado_em)} · {a.canal === "whatsapp" ? "WhatsApp" : a.canal === "email" ? "e-mail" : <><Phone className="inline h-3 w-3" /> ligação</>}
                      {" · "}{a.status === "falhou" ? <span className="text-red-700">falhou</span> : a.status === "respondido" ? <span className="text-emerald-700">assumiu às {horaCurta(a.respondido_em!)}</span> : "enviado"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <ExameSlaDialog exame={aberto} alertas={alertas.filter((a) => a.exame_id === aberto?.id)} onClose={() => setAberto(null)} agora={agora} />
    </div>
  );
}

// Prazo do laudo em horas ("48 h", não "2 d"): é como a equipe fala.
const emHoras = (min: number) => (min % 60 === 0 ? `${min / 60} h` : duracao(min));

// O prazo do externo muda por unidade (CEPON 72 h, Marieta 48 h, Mobilemed por cidade, de 24 a 72 h): o card lê o
// prazo dos exames que estão na fila (vence_em - inicio_em). Fila vazia cai no prazo padrão da origem (sla_prazos).
function prazoDaFila(exames: Pick<Exame, "inicio_em" | "vence_em">[], padraoMin?: number) {
  const horas = exames.map((e) => Math.round((new Date(e.vence_em).getTime() - new Date(e.inicio_em).getTime()) / 3_600_000))
    .filter((h) => h > 0);
  if (!horas.length) return padraoMin ? emHoras(padraoMin) : "—";
  const min = Math.min(...horas), max = Math.max(...horas);
  return min === max ? `${min} h` : `${min} a ${max} h`;
}

function Frase({ grande, linha }: { grande: string; linha: ReactNode }) {
  return (
    <>
      <p className="mt-1 font-display text-3xl font-bold leading-tight">{grande}</p>
      <p className="mt-2 text-sm">{linha}</p>
    </>
  );
}

function BarraFila({ vencido, perto, ok }: { vencido: number; perto: number; ok: number }) {
  const total = vencido + perto + ok;
  const itens = [
    { n: vencido, cor: "bg-red-600", r: "Vencidos" },
    { n: perto, cor: "bg-amber-500", r: "Perto do prazo" },
    { n: ok, cor: "bg-emerald-500", r: "No prazo" },
  ];
  return (
    <div className="mt-5">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-black/5" role="img" aria-label={itens.map((i) => `${i.r} ${i.n}`).join(", ")}>
        {total > 0 && itens.map((i) => i.n > 0 && <div key={i.r} className={i.cor} style={{ flexGrow: i.n }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {itens.map((i) => (
          <li key={i.r} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", i.cor)} />{i.r} <strong className="tabular-nums text-foreground">{i.n}</strong></li>
        ))}
      </ul>
    </div>
  );
}

function Numero({ valor, rotulo, tom }: { valor: number | string; rotulo: string; tom?: string }) {
  return (
    <div className="min-w-0">
      <dd className={cn("font-display text-2xl font-semibold tabular-nums", tom)}>{valor}</dd>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
    </div>
  );
}

// As 4 estações numa linha: verde lendo, vermelho parada (com o motivo no título). Clique troca a unidade da tela.
function FaixaEstacoes({ atual, trocar }: { atual: UnidadeId; trocar: (u: UnidadeId) => void }) {
  const estacoes = useEstacoes();
  if (estacoes.isLoading || !estacoes.data) return <span className="text-muted-foreground">Verificando as estações…</span>;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Estações do SLA">
      {estacoes.data.map((e) => {
        const parada = !!e.queda;
        const semEstacao = !parada && !e.ultimaOk;
        const quando = (iso: string) => (ehHoje(iso) ? horaCurta(iso) : diaHora(iso));
        const texto = parada ? `parada desde ${quando(e.queda!.aberta_em)}` : semEstacao ? "sem estação" : `lendo · ${quando(e.ultimaOk!)}`;
        return (
          <button key={e.id} type="button" onClick={() => trocar(e.id)} title={parada ? e.queda!.motivo ?? undefined : undefined}
            aria-current={e.id === atual ? "true" : undefined}
            className={cn("inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
              parada ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100" : "border-border bg-background text-muted-foreground hover:bg-muted",
              e.id === atual && "ring-2 ring-primary/40")}>
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", parada ? "bg-red-600" : semEstacao ? "bg-slate-400" : "bg-emerald-600")} />
            <span className={cn("font-medium", !parada && "text-foreground")}>{e.nome}</span>
            <span className="whitespace-nowrap">{texto}</span>
          </button>
        );
      })}
    </div>
  );
}

// O que fazer para a estação voltar, por unidade: Marieta e CEPON leem o Vue PACS na tela; Tijucas e Mobilemed leem
// o portal web pelo Chrome do robô no PC da baia do Wagner.
const PASSOS_ESTACAO: Record<UnidadeId, string[]> = {
  marieta: ["Ligue o PC do robô (sem suspender) e entre no Windows.", "Conecte a VPN do Sophos.", "Abra o Vue PACS na pasta \"Não lido\", maximizado."],
  cepon: ["Ligue o PC da baia do Wagner e entre no Windows.", "Abra o Vue PACS do CEPON e entre com o usuário da GSS.", "Deixe na pasta \"Hoje\", maximizado."],
  tijucas: ["Ligue o PC da baia do Wagner e entre no Windows.", "No Chrome do robô (atalho Tijucas), entre no portal com o usuário da GSS.", "Deixe a aba do portal aberta; não feche o Chrome."],
  mobilemed: ["Ligue o PC da baia do Wagner e entre no Windows.", "No Chrome do robô, abra o portal da Mobilemed e entre com o usuário da GSS.", "Deixe a aba do portal aberta; não feche o Chrome."],
};

function EstacaoParada({ queda, unidade, unidadeId }: { queda: { aberta_em: string; motivo: string | null; ultima_ok_em: string | null }; unidade: string; unidadeId: UnidadeId }) {
  return (
    <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-950">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700"><MonitorX className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold">A estação do {unidade} parou de ler a fila</p>
          <p className="text-sm">
            Desde {queda.ultima_ok_em ? diaHora(queda.ultima_ok_em) : diaHora(queda.aberta_em)}. Enquanto não voltar, os avisos ao médico não saem.
          </p>
          {queda.motivo && <p className="mt-1 text-sm font-medium">{queda.motivo}</p>}
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            {PASSOS_ESTACAO[unidadeId].map((t, i) => (
              <li key={t} className="flex gap-2 rounded-lg bg-white/70 p-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">{i + 1}</span>{t}
              </li>
            ))}
          </ol>
          <p className="mt-2 flex items-center gap-1.5 text-xs"><Clock className="h-3.5 w-3.5" />Em até 3 minutos depois disso a fila volta a aparecer aqui.</p>
        </div>
      </div>
    </section>
  );
}

