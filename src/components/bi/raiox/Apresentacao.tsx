import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BarrasObjecoes, Frase, OBJECAO, UNIDADE, brl, frasesDestrava, gargalo, medicos, pctTxt } from "./Blocos";
import { NOME_UF, POPULACAO_BRASIL, POPULACAO_UF, por100mil } from "./populacao";
import { mil, type Destrava, type Esforco, type Funil, type Objecoes } from "./useRaioX";

// Modo apresentação do Raio-X, para o diretor do hospital (protótipo docs/redesenho-2027/prototipos/
// t-bi-apresentacao.html; fonte de cada número em docs/redesenho-2027/raio-x-apresentacao-dados.md).
// Cada bloco tem uma frase-conclusão à esquerda e a prova à direita. Bloco sem dado some, e a numeração anda junto:
// é melhor um PDF com 4 blocos verdadeiros que um com 6 e dois vazios.
// Ficaram de fora (sem dado confiável hoje): região por raio em km e o preço pago em licitações.

// Cores dos canais validadas com o validador da skill dataviz (contraste, daltonismo e separação: PASS).
const CANAIS = [
  { chave: "whatsapp_medicos", rotulo: "WhatsApp", cor: "#2e7d32" },
  { chave: "email", rotulo: "E-mail", cor: "#3b6fb0" },
  { chave: "linkedin", rotulo: "LinkedIn", cor: "#b0457a" },
  { chave: "instagram", rotulo: "Instagram", cor: "#a87a00" },
] as const;

// Nome curto do motivo para caber na frase-título ("Agenda cheia e distância explicam 19 de 23 recusas").
const CURTA: Record<string, string> = { distancia: "Distância", modelo_trabalho: "Modelo de contratação", estrutura: "Estrutura do hospital" };
const curta = (k: string) => CURTA[k] || OBJECAO[k] || k;
const decimal = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// "2026-06-01" vira meia-noite UTC e cai em maio no fuso de Brasília: data sem hora é lida ao meio-dia.
export const data = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d);
const mesAno = (d: string) => format(data(d), "MMM/yyyy", { locale: ptBR });

type Props = {
  f?: Funil; o?: Objecoes; d?: Destrava; e?: Esforco; carregando: boolean;
  esp: string; uf: string | null; periodo: string; hospital: string;
  onHospital: (v: string) => void; onSair: () => void;
};

function Secao({ n, rotulo, titulo, texto, children }: { n: number; rotulo: string; titulo: React.ReactNode; texto?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-8 rounded-xl bg-card p-8 break-inside-avoid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">{n} · {rotulo}</p>
        <h3 className="mt-2 font-display text-2xl font-semibold leading-snug">{titulo}</h3>
        {texto && <div className="mt-3 text-muted-foreground">{texto}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function BarraH({ rotulo, valor, largura, destaque, sufixo }: { rotulo: string; valor: string; largura: number; destaque?: boolean; sufixo?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-4 py-1.5">
      <span className="truncate text-sm" title={rotulo}>{rotulo}</span>
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("h-7 shrink-0 rounded-md", destaque ? "bg-amber-600" : "bg-primary/45")} style={{ width: `${Math.max(largura, 1.5)}%` }} />
        <span className={cn("shrink-0 text-sm font-semibold tabular-nums", destaque && "text-amber-700")}>
          {valor}{sufixo && <span className="ml-1 text-xs font-normal text-muted-foreground">{sufixo}</span>}
        </span>
      </div>
    </div>
  );
}

export function Apresentacao({ f, o, d, e, carregando, esp, uf, periodo, hospital, onHospital, onSair }: Props) {
  // Esc sai da apresentação, como num projetor.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => ev.key === "Escape" && onSair();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onSair]);

  const lugar = uf ? NOME_UF[uf] : "no Brasil";
  const recorte = [esp, uf ? NOME_UF[uf] : "Brasil", periodo].join(" · ");

  const serie = useMemo(() => {
    // Acumulado por canal: o hospital lê "quanto já foi feito", não o vai e vem semanal.
    const acc: Record<string, number> = { whatsapp_medicos: 0, email: 0, linkedin: 0, instagram: 0 };
    return (e?.semanas ?? []).map((s) => {
      const linha: Record<string, number | string> = { semana: s.semana };
      for (const c of CANAIS) { acc[c.chave] += s[c.chave]; linha[c.chave] = acc[c.chave]; }
      return linha;
    });
  }, [e]);
  // Um rótulo por mês no eixo (a 1ª semana de cada mês); com rótulo por semana o eixo repetia "abr abr".
  const ticksMes = useMemo(() => serie.filter((l, i) => i === 0 || String(l.semana).slice(0, 7) !== String(serie[i - 1].semana).slice(0, 7)).map((l) => l.semana as string), [serie]);
  const canaisAtivos = CANAIS.filter((c) => (e?.totais[c.chave] ?? 0) > 0);
  const semanasAtivas = (e?.semanas ?? []).filter((s) => CANAIS.some((c) => s[c.chave] > 0)).length;

  const conteudo = () => {
    if (carregando || !f || !o || !d) return <Skeleton className="h-[70vh] w-full" />;
    if (f.alcancados === 0) {
      return <p className="rounded-xl bg-card p-8 text-lg">Ainda não prospectamos {esp} {uf ? `em ${NOME_UF[uf]}` : "neste recorte"}.</p>;
    }
    const g = gargalo(f);
    const blocos: { rotulo: string; titulo: React.ReactNode; texto?: React.ReactNode; prova: React.ReactNode }[] = [];

    // 1. O mercado: especialistas por 100 mil habitantes, Brasil x UF (Censo 2022).
    const taxaBr = por100mil(f.mercado_brasil, POPULACAO_BRASIL);
    const taxaUf = uf && f.mercado_regiao != null ? por100mil(f.mercado_regiao, POPULACAO_UF[uf] ?? 0) : null;
    if (f.mercado_brasil > 0) {
      const razao = taxaUf ? taxaBr / taxaUf : 1;
      const titulo = taxaUf == null
        ? <>O Brasil tem {decimal(taxaBr)} especialistas em {esp} por 100 mil habitantes</>
        : razao >= 1.2
          ? <>{NOME_UF[uf!]} tem {decimal(razao)} vezes menos especialistas em {esp} por habitante que a média do país</>
          : razao <= 1 / 1.2
            ? <>{NOME_UF[uf!]} tem mais especialistas em {esp} por habitante que a média do país</>
            : <>{NOME_UF[uf!]} tem a mesma proporção de especialistas em {esp} que a média do país</>;
      const max = Math.max(taxaBr, taxaUf ?? 0);
      blocos.push({
        rotulo: "O mercado",
        titulo,
        texto: <p>{uf ? <>Há <b className="text-foreground">{mil(f.mercado_regiao)}</b> com registro ativo em {NOME_UF[uf]}. </> : <>São <b className="text-foreground">{mil(f.mercado_brasil)}</b> com registro ativo. </>}A base da GSS tem {mil(f.base_crm)}, com ou sem título.</p>,
        // Sem UF não há com o que comparar: uma barra sozinha não prova nada, então mostra o tamanho do mercado.
        prova: taxaUf == null ? (
          <dl className="grid grid-cols-2 gap-6">
            <div><dd className="font-display text-4xl font-semibold tabular-nums">{mil(f.mercado_brasil)}</dd><dt className="mt-1 text-sm text-muted-foreground">com título de especialista no CFM</dt></div>
            <div><dd className="font-display text-4xl font-semibold tabular-nums">{mil(f.base_crm)}</dd><dt className="mt-1 text-sm text-muted-foreground">na base da GSS, com ou sem título</dt></div>
          </dl>
        ) : (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">Especialistas em {esp} por 100 mil habitantes</p>
            <BarraH rotulo="Brasil" valor={decimal(taxaBr)} largura={(taxaBr / max) * 85} />
            <BarraH rotulo={NOME_UF[uf!]} valor={decimal(taxaUf)} largura={(taxaUf / max) * 85} destaque={taxaUf < taxaBr / 1.2} />
          </div>
        ),
      });
    }

    // 2. O esforço da equipe: acumulado por semana e canal (bi_raiox_esforco).
    if (e && serie.length > 0) {
      const nomes = canaisAtivos.map((c) => c.rotulo);
      const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0];
      blocos.push({
        rotulo: "O esforço da equipe",
        titulo: <>{e.desde ? `Desde ${format(data(e.desde), "MMMM", { locale: ptBR })}, a` : "A"} equipe procurou especialistas em {esp} em {semanasAtivas} {semanasAtivas === 1 ? "semana" : "semanas"}, por {lista}</>,
        texto: (
          <dl className="mt-5 grid grid-cols-3 gap-4 border-t pt-4">
            <div><dt className="sr-only">WhatsApp</dt><dd className="text-2xl font-semibold tabular-nums text-foreground">{mil(f.alcancados_whatsapp)}</dd><p className="text-sm">no WhatsApp</p></div>
            <div><dt className="sr-only">E-mail</dt><dd className="text-2xl font-semibold tabular-nums text-foreground">{mil(f.alcancados_email)}</dd><p className="text-sm">por e-mail</p></div>
            <div><dt className="sr-only">Conversas</dt><dd className="text-2xl font-semibold tabular-nums text-foreground">{mil(f.responderam)}</dd><p className="text-sm">conversas atendidas</p></div>
          </dl>
        ),
        prova: (
          <div>
            <p className="text-sm text-muted-foreground">Médicos contatados, acumulado por canal</p>
            <ul className="mb-2 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {canaisAtivos.map((c) => (
                <li key={c.chave} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.cor }} />{c.rotulo}
                  <b className="tabular-nums">{mil(e.totais[c.chave])}</b>
                </li>
              ))}
            </ul>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="semana" ticks={ticksMes} interval={0} tickFormatter={(s) => format(new Date(`${s}T12:00:00`), "MMM", { locale: ptBR })} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => mil(v)} tick={{ fontSize: 12 }} width={56} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v: number, k: string) => [mil(v), CANAIS.find((c) => c.chave === k)?.rotulo ?? k]}
                    labelFormatter={(s) => `Semana de ${format(new Date(`${s}T12:00:00`), "dd/MM/yyyy")}`}
                  />
                  {canaisAtivos.map((c) => (
                    <Area key={c.chave} type="monotone" dataKey={c.chave} stackId="1" stroke={c.cor} strokeWidth={2} fill={c.cor} fillOpacity={0.75} isAnimationActive={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ),
      });
    }

    // 3. Do contato ao contrato.
    const base = f.alcancados_whatsapp;
    const porContrato = f.contratados > 0 ? Math.round(base / f.contratados) : null;
    const etapas = [
      { rotulo: "Alcançados no WhatsApp", n: base },
      { rotulo: "Responderam", n: f.responderam },
      { rotulo: "Demonstraram interesse", n: f.interessados },
      { rotulo: "Contratados", n: f.contratados },
    ];
    const iTrava = g.etapa === "resposta" ? 1 : g.etapa === "interesse" ? 2 : 3;
    blocos.push({
      rotulo: "Do contato ao contrato",
      titulo: porContrato ? <>Para cada especialista contratado, a equipe abordou <span className="text-amber-700">{mil(porContrato)}</span></> : <Frase g={g} className="text-2xl" />,
      texto: porContrato ? <p>{g.partes.join("")}</p> : undefined,
      prova: (
        <div>
          {etapas.map((x, i) => (
            <BarraH key={x.rotulo} rotulo={x.rotulo} valor={mil(x.n)} sufixo={i > 0 ? pctTxt(x.n, base) : undefined} largura={base ? (x.n / base) * 80 : 0} destaque={i === iTrava} />
          ))}
        </div>
      ),
    });

    // 4. Por que dizem não.
    if (o.objecoes.length > 0) {
      const [a, b] = o.objecoes;
      const soma = a.n + (b?.n ?? 0);
      const falas = o.objecoes.filter((x) => x.trecho).slice(0, 2);
      blocos.push({
        rotulo: "Por que dizem não",
        titulo: b
          ? <>{curta(a.objecao)} e {curta(b.objecao).toLowerCase()} explicam {mil(soma)} de {mil(o.com_motivo)} recusas</>
          : <>{curta(a.objecao)} explica {mil(a.n)} de {mil(o.com_motivo)} recusas</>,
        texto: falas.length > 0 && (
          <ul className="mt-4 space-y-3">
            {falas.map((x) => (
              <li key={x.objecao} className="border-l-2 pl-3">
                <p className="text-foreground">"{x.trecho}"</p>
                <p className="mt-0.5 text-xs">{OBJECAO[x.objecao] || x.objecao}</p>
              </li>
            ))}
          </ul>
        ),
        prova: (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">Motivos citados pelos {medicos(o.com_motivo)} que recusaram com motivo</p>
            <BarrasObjecoes o={o} />
          </div>
        ),
      });
    }

    // 5. Quanto o mercado paga: o que os médicos pedem (mediana) contra a oferta de hoje.
    const valor = d.regras.find((r) => r.regra === "valor") as Extract<Destrava["regras"][number], { regra: "valor" }> | undefined;
    if (o.valores.length > 0) {
      const principal = [...o.valores].sort((x, y) => y.n - x.n)[0];
      blocos.push({
        rotulo: "Quanto o mercado paga",
        titulo: <>Os médicos pedem {brl(principal.mediana)} por {UNIDADE[principal.unidade] || principal.unidade}{valor?.oferta_atual ? <>, contra {brl(valor.oferta_atual)} oferecidos hoje</> : null}</>,
        texto: <p>Mediana dos valores que os próprios médicos citaram nas conversas.</p>,
        prova: (
          <ul className="divide-y">
            {o.valores.map((v) => (
              <li key={v.unidade} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="text-sm">Por {UNIDADE[v.unidade] || v.unidade}</span>
                <span className="tabular-nums"><b className="text-lg">{brl(v.mediana)}</b> <span className="text-xs text-muted-foreground">{medicos(v.n)}</span></span>
              </li>
            ))}
          </ul>
        ),
      });
    }

    const propostas = frasesDestrava(d, o, esp, uf).filter((p) => p.regra !== "nao_abordados");

    return (
      <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { v: mil(f.alcancados), r: "médicos abordados" },
            { v: mil(semanasAtivas), r: "semanas de busca ativa" },
            { v: mil(f.campanhas), r: `campanhas em ${canaisAtivos.length || 1} ${canaisAtivos.length === 1 ? "canal" : "canais"}` },
            { v: mil(f.contratados), r: "contratados", destaque: true },
          ].map((k) => (
            <div key={k.r} className="rounded-xl bg-card px-6 py-5">
              <p className={cn("font-display text-4xl font-semibold tabular-nums", k.destaque && "text-amber-700")}>{k.v}</p>
              <p className="mt-1 text-sm text-muted-foreground">{k.r}</p>
            </div>
          ))}
        </div>

        {blocos.map((b, i) => (
          <Secao key={b.rotulo} n={i + 1} rotulo={b.rotulo} titulo={b.titulo} texto={b.texto}>{b.prova}</Secao>
        ))}

        {propostas.length > 0 && (
          <section className="break-inside-avoid">
            <h3 className="font-display text-2xl font-semibold">O que propomos</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              {propostas.slice(0, 3).map((p) => (
                <div key={p.regra} className="rounded-xl border-t-4 border-primary bg-card p-6">
                  <p className="font-display text-lg font-semibold">{p.titulo}</p>
                  <p className="mt-2 text-muted-foreground">{p.texto}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          Fontes: Conselho Federal de Medicina{f.cfm_atualizado_em ? ` (base de ${mesAno(f.cfm_atualizado_em)})` : ""}, população do Censo 2022 (IBGE)
          e os registros de prospecção do Sigma{f.desde ? ` desde ${mesAno(f.desde)}` : ""}. Nenhum médico é identificado.
        </p>
      </>
    );
  };

  // Portal no body: a página do BI tem animação com transform, e "fixed" dentro dela não cobre a tela inteira.
  return createPortal(
    <div id="raiox-apresentacao" role="dialog" aria-modal="true" aria-label="Raio-X do mercado, modo apresentação" className="fixed inset-0 z-50 overflow-auto bg-muted">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-[hsl(123_63%_13%)] px-6 py-3 text-white print:hidden">
        <p className="shrink-0 font-display font-semibold tracking-wide">SIGMA</p>
        <p className="hidden min-w-0 truncate text-sm text-white/70 xl:block">BI · Raio-X do mercado · modo apresentação</p>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <span className="hidden truncate rounded-md border border-white/25 px-3 py-1.5 text-sm lg:block" title={recorte}>{recorte}</span>
          <Input
            value={hospital}
            onChange={(ev) => onHospital(ev.target.value)}
            placeholder="Preparado para (hospital)"
            aria-label="Nome do hospital que recebe a apresentação"
            className="h-9 w-56 border-white/25 bg-transparent text-white placeholder:text-white/60"
          />
          <Button variant="outline" size="sm" className="h-9 border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => window.print()}>
            <BarChart3 className="mr-1.5 h-4 w-4" />Baixar PDF
          </Button>
          <Button size="sm" className="h-9 bg-white text-foreground hover:bg-white/90" onClick={onSair}>
            <X className="mr-1.5 h-4 w-4" />Sair da apresentação
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-8 py-10">
        <div>
          <p className="text-sm text-muted-foreground">
            GSS Gestão Serviço Saúde{hospital.trim() ? ` · preparado para ${hospital.trim()}` : ""} · {format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          <h2 className="mt-2 max-w-4xl font-display text-4xl font-semibold leading-tight tracking-tight">
            {esp} {uf ? `em ${lugar}` : lugar}: o que fizemos para completar a sua escala, e o que o mercado mostra
          </h2>
        </div>
        {conteudo()}
      </main>
    </div>,
    document.body,
  );
}
