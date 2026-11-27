import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { mil, pct, type Destrava, type Funil, type Objecoes } from "./useRaioX";

// Visão do dia a dia do Raio-X (protótipo docs/redesenho-2027/prototipos/t-bi.html): a frase do gargalo com o
// funil numa faixa, os motivos de recusa e o que os médicos disseram. O modo apresentação, com os blocos
// numerados para o hospital, fica em Apresentacao.tsx e reaproveita as regras daqui.
// Sem nome de médico em nenhum lugar: estas telas vão para o hospital e para o PDF.

export const OBJECAO: Record<string, string> = {
  distancia: "Mora longe, não muda de cidade",
  agenda: "Agenda cheia",
  valor: "Valor abaixo do esperado",
  modelo_trabalho: "Modelo de contratação ou carga",
  so_remoto: "Só telemedicina",
  estrutura: "Estrutura ou volume do hospital",
  outro: "Outros motivos",
};
export const UNIDADE: Record<string, string> = {
  plantao_12h: "plantão de 12 h", plantao_24h: "plantão de 24 h", hora: "hora", exame: "exame", mes: "mês",
};
// Abaixo disso o % engana na frente do hospital ("50%" de 20 médicos): mostra a contagem.
export const AMOSTRA_MINIMA = 30;
// Data sem hora ("2026-06-01") é lida ao meio-dia: à meia-noite UTC ela cai no mês anterior em Brasília.
const dataDia = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d);
export const medicos = (n: number) => `${mil(n)} ${n === 1 ? "médico" : "médicos"}`;
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
// Abaixo de 1% mostra uma casa ("0,1%"): arredondar para 0% esconde o contratado.
export const pctTxt = (a: number, b: number) => {
  if (b <= 0) return "0%";
  const v = (a / b) * 100;
  return `${v > 0 && v < 1 ? v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : Math.round(v)}%`;
};

export type Gargalo = { etapa: "resposta" | "interesse" | "contrato"; partes: [string, string, string] };

/**
 * Onde o funil trava, em uma frase. A taxa de resposta ao primeiro contato é sempre baixa em prospecção fria,
 * então ela só vira o gargalo quando ninguém respondeu; entre "interesse" e "contrato" vence a menor taxa.
 * partes = [antes do destaque, destaque em âmbar, depois].
 */
export function gargalo(f: Funil): Gargalo {
  const base = f.alcancados_whatsapp;
  if (f.responderam === 0) {
    return { etapa: "resposta", partes: ["Nenhum dos ", mil(base), " médicos alcançados no WhatsApp respondeu ainda."] };
  }
  if (f.interessados === 0) {
    return { etapa: "interesse", partes: ["", `${mil(f.responderam)} médicos responderam`, " e nenhum se interessou ainda. O funil trava na conversa."] };
  }
  const tInteresse = f.interessados / f.responderam;
  const tContrato = f.contratados / f.interessados;
  if (tContrato <= tInteresse) {
    return f.contratados === 0
      ? { etapa: "contrato", partes: ["", `${mil(f.interessados)} médicos se interessaram`, " e nenhum fechou ainda. O funil trava depois do interesse, não no alcance."] }
      : { etapa: "contrato", partes: ["Só ", `${mil(f.contratados)} de ${mil(f.interessados)}`, " médicos interessados viraram contrato. O funil trava depois do interesse, não no alcance."] };
  }
  return { etapa: "interesse", partes: ["Só ", `${mil(f.interessados)} de ${mil(f.responderam)}`, " médicos que responderam se interessaram. O funil trava na conversa, não no alcance."] };
}

export function Frase({ g, className }: { g: Gargalo; className?: string }) {
  return (
    <h2 className={cn("font-display font-semibold leading-tight tracking-tight", className)}>
      {g.partes[0]}<span className="text-amber-700">{g.partes[1]}</span>{g.partes[2]}
    </h2>
  );
}

/** Faixa do funil: a frase do gargalo e os 5 números, com a etapa que trava em âmbar. */
export function BlocoGargalo({ f, esp, uf, kicker }: { f?: Funil; esp: string; uf: string | null; kicker: string }) {
  if (!f) return <Skeleton className="h-56 w-full" />;
  const g = gargalo(f);
  const base = f.alcancados_whatsapp;
  const etapas = [
    { rotulo: `${esp || "Especialistas"} ${uf ? `em ${uf}` : "no Brasil"}`, valor: mil(uf ? f.mercado_regiao ?? 0 : f.mercado_brasil) },
    { rotulo: "Alcançados no WhatsApp", valor: mil(base) },
    { rotulo: "Responderam", valor: `${mil(f.responderam)} · ${pctTxt(f.responderam, base)}` },
    { rotulo: "Interessados", valor: `${mil(f.interessados)} · ${pctTxt(f.interessados, base)}` },
    { rotulo: "Contratados", valor: `${mil(f.contratados)} · ${pctTxt(f.contratados, base)}` },
  ];
  // A barra âmbar marca o número que ficou baixo: Responderam, Interessados ou Contratados, conforme o gargalo.
  const trava = g.etapa === "resposta" ? 2 : g.etapa === "interesse" ? 3 : 4;
  return (
    <Card className="p-6">
      <p className="text-sm text-muted-foreground">{kicker}</p>
      <Frase g={g} className="mt-2 max-w-4xl text-2xl xl:text-3xl" />
      <ol className="mt-6 grid grid-cols-5 gap-3">
        {etapas.map((e, i) => (
          <li key={e.rotulo} className="min-w-0">
            <div className={cn("h-1.5 rounded-full", i === 0 ? "bg-muted" : i === trava ? "bg-amber-600" : "bg-primary/40")} />
            <p className={cn("mt-3 truncate text-2xl font-semibold tabular-nums xl:text-3xl", i === trava && "text-amber-700")}>{e.valor}</p>
            <p className="mt-1 truncate text-sm text-muted-foreground" title={e.rotulo}>{e.rotulo}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Barras dos motivos de recusa. Com menos de 30 médicos com motivo, mostra a contagem em vez do %. */
export function BarrasObjecoes({ o }: { o: Objecoes }) {
  const poucos = o.com_motivo < AMOSTRA_MINIMA;
  const max = Math.max(...o.objecoes.map((x) => x.n), 1);
  return (
    <ul className="space-y-3">
      {o.objecoes.map((x, i) => (
        <li key={x.objecao}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{OBJECAO[x.objecao] || x.objecao}</span>
            <span className="shrink-0 font-semibold tabular-nums">{poucos ? mil(x.n) : `${x.pct}%`}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className={cn("h-2 rounded-full", i === 0 ? "bg-primary" : "bg-primary/50")} style={{ width: `${Math.max((x.n / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function BlocoObjecoes({ o }: { o?: Objecoes }) {
  if (!o) return <Skeleton className="h-72 w-full" />;
  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">Por que dizem não</h3>
      {o.classificadas === 0 ? (
        // Aviso interno: não vai para o PDF do hospital.
        <p className="mt-2 text-sm text-muted-foreground print:hidden">
          As respostas dos médicos ainda não foram lidas. A leitura por IA roda sozinha a cada 2 horas.
        </p>
      ) : o.objecoes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum médico deu um motivo para recusar até agora.</p>
      ) : (
        <>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            {medicos(o.com_motivo)} deram o motivo · {mil(o.outros.sem_interesse ?? 0)} recusaram sem motivo
          </p>
          <BarrasObjecoes o={o} />
        </>
      )}
    </Card>
  );
}

/** Regras do "O que destrava" em frases curtas; também viram os cartões do "O que propomos" na apresentação. */
export function frasesDestrava(d: Destrava, o: Objecoes | undefined, esp: string, uf: string | null) {
  const base = o?.com_motivo ?? 0;
  const parte = (pctRegra: number) => (base >= AMOSTRA_MINIMA ? `${pctRegra}%` : `${Math.round((pctRegra * base) / 100)} dos ${mil(base)}`);
  const frases: { regra: string; titulo: string; texto: string }[] = [];
  for (const r of d.regras) {
    if (r.regra === "distancia") frases.push({ regra: r.regra, titulo: "Plantão concentrado", texto: `Plantões de 24 h agrupados no mês, com moradia, resolvem "mora longe": ${parte(r.pct)} que deram motivo.` });
    if (r.regra === "agenda") frases.push({ regra: r.regra, titulo: "Escala flexível", texto: `Escala fixa ou sobreaviso abre espaço para "agenda cheia": ${parte(r.pct)} que deram motivo.` });
    if (r.regra === "valor") frases.push({ regra: r.regra, titulo: "Valor de mercado", texto: `${medicos(r.n)} citaram valor. A mediana pedida é ${brl(r.mediana)} por ${UNIDADE[r.unidade] || r.unidade}${r.oferta_atual ? `, contra ${brl(r.oferta_atual)} oferecidos hoje` : ""}.` });
    if (r.regra === "indicacao") frases.push({ regra: r.regra, titulo: "Indicação de colegas", texto: `${medicos(r.n)} ${r.n === 1 ? "indicou" : "indicaram"} colegas, que viram novos contatos.` });
  }
  if (d.nao_abordados_na_regiao > 0) {
    frases.push({ regra: "nao_abordados", titulo: "Base ainda não abordada", texto: `${mil(d.nao_abordados_na_regiao)} especialistas em ${esp}${uf ? ` em ${uf}` : ""} da base da GSS ainda não foram abordados.` });
  }
  return frases;
}

/** Falas dos médicos (só o trecho, sem nome) e o que destrava. */
export function BlocoFalas({ o, d, esp, uf }: { o?: Objecoes; d?: Destrava; esp: string; uf: string | null }) {
  if (!o || !d) return <Skeleton className="h-72 w-full" />;
  const falas = o.objecoes.filter((x) => x.trecho).slice(0, 3);
  const frases = frasesDestrava(d, o, esp, uf);
  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">O que eles disseram</h3>
      {falas.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">As falas aparecem quando os médicos derem um motivo.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {falas.map((x) => (
            <li key={x.objecao} className="py-3">
              <p className="line-clamp-2">"{x.trecho}"</p>
              <p className="mt-1 text-xs text-muted-foreground">{OBJECAO[x.objecao] || x.objecao}</p>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-5 font-display text-lg font-semibold">O que destrava</h3>
      {frases.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">As sugestões aparecem quando houver respostas suficientes lidas.</p>
      ) : (
        <ul className="mt-1 divide-y">{frases.map((t) => <li key={t.regra} className="py-2.5 text-sm">{t.texto}</li>)}</ul>
      )}
    </Card>
  );
}

export function Fonte({ f, esp, uf }: { f: Funil; esp: string; uf: string | null }) {
  const partes = [`${mil(f.base_crm)} especialistas em ${esp} na base da GSS${uf ? ` em ${uf}` : ""}, com ou sem título`];
  if (f.cfm_atualizado_em) partes.push(`fonte CFM, base de ${format(dataDia(f.cfm_atualizado_em), "MMM/yyyy", { locale: ptBR })}`);
  if (f.desde) partes.push(`desde ${format(dataDia(f.desde), "MMM/yyyy", { locale: ptBR })}, em ${f.campanhas} ${f.campanhas === 1 ? "campanha" : "campanhas"}`);
  return <p className="text-xs text-muted-foreground">{partes.join(" · ")}</p>;
}

export { pct };
