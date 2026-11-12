import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { mil, pct, type Destrava, type Funil, type Objecoes } from "./useRaioX";

// Os 5 blocos do modo apresentação (spec docs/arquitetura/bi-raio-x-mercado-medico.md §4).
// Sem nome de médico em nenhum bloco: este modo vai para o hospital e para o PDF.

const OBJECAO: Record<string, string> = {
  distancia: "Mora longe / não muda de cidade",
  agenda: "Agenda cheia",
  valor: "Valor abaixo do esperado",
  modelo_trabalho: "Modelo de contratação ou carga",
  so_remoto: "Só telemedicina",
  estrutura: "Estrutura ou volume do hospital",
  outro: "Outros motivos",
};
const UNIDADE: Record<string, string> = {
  plantao_12h: "plantão de 12 h", plantao_24h: "plantão de 24 h", hora: "hora", exame: "exame", mes: "mês",
};
// Abaixo disso o % engana na frente do hospital ("50%" de 20 médicos): mostra a contagem.
export const AMOSTRA_MINIMA = 30;
const medicos = (n: number) => `${mil(n)} ${n === 1 ? "médico" : "médicos"}`;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Bloco({ n, titulo, children, className }: { n: number; titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5 break-inside-avoid", className)}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{n}. {titulo}</h3>
      {children}
    </Card>
  );
}

function Numero({ valor, rotulo, destaque }: { valor: string; rotulo: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn("font-semibold tabular-nums leading-none", destaque ? "text-4xl" : "text-2xl")}>{valor}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{rotulo}</p>
    </div>
  );
}

export function BlocoMercado({ f, esp, uf }: { f?: Funil; esp: string; uf: string | null }) {
  if (!f) return <Skeleton className="h-36 w-full" />;
  return (
    <Bloco n={1} titulo="O mercado">
      <div className={cn("grid gap-6", uf ? "grid-cols-3" : "grid-cols-2")}>
        <Numero destaque valor={mil(f.mercado_brasil)} rotulo={`especialistas em ${esp} no Brasil`} />
        {uf && <Numero destaque valor={mil(f.mercado_regiao)} rotulo={`em ${uf}`} />}
        {/* A base passa do CFM quando inclui quem atua na área sem título (RQE); o rótulo evita a pergunta. */}
        <Numero valor={mil(f.base_crm)} rotulo={`na base da GSS${uf ? ` em ${uf}` : ""}, com ou sem título`} />
      </div>
      {f.cfm_atualizado_em && (
        <p className="mt-4 text-xs text-muted-foreground">
          Fonte: Conselho Federal de Medicina, registros ativos com título de especialista (base de {format(new Date(f.cfm_atualizado_em), "MMM/yyyy", { locale: ptBR })}).
        </p>
      )}
    </Bloco>
  );
}

export function BlocoEsforco({ f }: { f: Funil }) {
  return (
    <Bloco n={2} titulo="O que já fizemos">
      <Numero destaque valor={mil(f.alcancados)} rotulo="médicos alcançados" />
      <ul className="mt-4 space-y-1 text-sm">
        <li className="flex justify-between gap-3"><span>WhatsApp</span><span className="tabular-nums font-medium">{mil(f.alcancados_whatsapp)}</span></li>
        <li className="flex justify-between gap-3"><span>E-mail</span><span className="tabular-nums font-medium">{mil(f.alcancados_email)}</span></li>
      </ul>
      {f.desde && (
        <p className="mt-3 text-xs text-muted-foreground">
          Desde {format(new Date(f.desde), "MMM/yyyy", { locale: ptBR })}, em {f.campanhas} {f.campanhas === 1 ? "campanha" : "campanhas"}
        </p>
      )}
    </Bloco>
  );
}

export function BlocoFunil({ f }: { f: Funil }) {
  const base = f.alcancados_whatsapp;
  const etapas = [
    { rotulo: "Alcançados no WhatsApp", n: base },
    { rotulo: "Responderam", n: f.responderam },
    { rotulo: "Interessados", n: f.interessados },
    { rotulo: "Contratados", n: f.contratados },
  ];
  return (
    <Bloco n={3} titulo="Como o mercado responde">
      <ul className="space-y-3">
        {etapas.map((e, i) => (
          <li key={e.rotulo}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span>{e.rotulo}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{mil(e.n)}</span>
                {i > 0 && <span className="ml-2 text-xs text-muted-foreground">{pct(e.n, base)}%</span>}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted">
              <div className="h-2.5 rounded-full bg-primary" style={{ width: `${Math.max(base ? (e.n / base) * 100 : 0, e.n > 0 ? 1 : 0)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

export function BlocoObjecoes({ o }: { o?: Objecoes }) {
  if (!o) return <Skeleton className="h-40 w-full" />;
  if (o.classificadas === 0) {
    // Aviso interno: não vai para o PDF do hospital.
    return (
      <Bloco n={4} titulo="Por que dizem não" className="print:hidden">
        <p className="text-sm text-muted-foreground">
          As respostas dos médicos ainda não foram lidas. A leitura por IA roda sozinha a cada 2 horas assim que o crédito de IA for recarregado.
        </p>
      </Bloco>
    );
  }
  const o2 = o.outros;
  const poucos = o.com_motivo < AMOSTRA_MINIMA;
  return (
    <Bloco n={4} titulo="Por que dizem não">
      {o.objecoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum médico deu um motivo para recusar até agora.</p>
      ) : (
        <ul className="space-y-3">
          {o.objecoes.map((x) => (
            <li key={x.objecao} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
              <div className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{OBJECAO[x.objecao] || x.objecao}</span>
                  <span className="shrink-0 tabular-nums">
                    {poucos ? <span className="font-semibold">{medicos(x.n)}</span> : <><span className="font-semibold">{x.pct}%</span><span className="ml-1.5 text-xs text-muted-foreground">{mil(x.n)}</span></>}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted"><div className="h-2.5 rounded-full bg-primary" style={{ width: `${x.pct}%` }} /></div>
              </div>
              <p className="line-clamp-2 text-sm italic text-muted-foreground">{x.trecho ? `"${x.trecho}"` : ""}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        {medicos(o.com_motivo)} deram motivo · {mil(o2.sem_interesse)} recusaram sem motivo · secretária filtrou {mil(o2.filtro_secretaria)} · {mil(o2.indicacao)} indicações · {mil(o2.contato_errado)} números errados
      </p>
    </Bloco>
  );
}

export function BlocoDestrava({ d, o, esp, uf }: { d?: Destrava; o?: Objecoes; esp: string; uf: string | null }) {
  if (!d) return <Skeleton className="h-28 w-full" />;
  // As regras de % só valem com amostra mínima; abaixo disso viram contagem ("10 de 20 médicos").
  const base = o?.com_motivo ?? 0;
  const parte = (pctRegra: number) => (base >= AMOSTRA_MINIMA ? `${pctRegra}%` : `${Math.round((pctRegra * base) / 100)} de ${medicos(base)} que deram motivo`);
  const frases: string[] = [];
  for (const r of d.regras) {
    if (r.regra === "distancia") frases.push(`${parte(r.pct)} não se mudam de cidade: plantão concentrado (ex.: 4 plantões de 24 h por mês) com moradia resolve parte disso.`);
    if (r.regra === "valor") frases.push(`${r.n} médicos citaram valor. A mediana pedida é ${brl(r.mediana)} por ${UNIDADE[r.unidade] || r.unidade}${r.oferta_atual ? `, contra ${brl(r.oferta_atual)} oferecidos hoje` : ""}.`);
    if (r.regra === "agenda") frases.push(`${parte(r.pct)} estão com a agenda cheia: escala flexível ou sobreaviso abre espaço.`);
    if (r.regra === "indicacao") frases.push(`${r.n} médicos indicaram colegas, que viram novos contatos.`);
  }
  if (d.nao_abordados_na_regiao > 0) {
    frases.push(`${mil(d.nao_abordados_na_regiao)} especialistas em ${esp}${uf ? ` em ${uf}` : ""} da base da GSS ainda não foram abordados.`);
  }
  return (
    <Bloco n={5} titulo="O que destrava">
      {frases.length === 0 ? (
        <p className="text-sm text-muted-foreground">As sugestões aparecem quando houver respostas suficientes lidas.</p>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 text-sm">{frases.map((t) => <li key={t}>{t}</li>)}</ul>
      )}
    </Bloco>
  );
}
