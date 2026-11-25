// Prévia no celular (25/11/2026, Raul: "bota um mockup de celular para cada pessoa ver na tela"). Pergunta: "o que
// cada pessoa recebe, e quando?". Monta a conversa com as regras salvas (prazos, sequência de avisos, Coordenação e
// Outras regras) para um exame de exemplo, com o texto dos modelos aprovados pela Meta (sem nome de paciente).
// Muda sozinha quando as regras mudam. É só ilustração: nada é enviado daqui.
import { useMemo, useState } from "react";
import { Mail, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegras } from "./RegrasAvisos";
import { useRegrasExtras } from "./RegrasExtras";
import { PAPEL_CONTATO, usePassos } from "./usePassos";

type Pessoa = "plantonista" | "assumiu" | "coordenacao" | "estacao";
const PESSOAS: { k: Pessoa; nome: string }[] = [
  { k: "plantonista", nome: "Médico de plantão" },
  { k: "assumiu", nome: "Quem assumiu" },
  { k: "coordenacao", nome: "Coordenação" },
  { k: "estacao", nome: "Estação parada" },
];

type Msg = {
  min: number; // minutos desde a chegada do exame (ordena e dá a hora)
  tipo: "whatsapp" | "texto" | "ligacao" | "email" | "eu";
  texto: string;
  botao?: string;
  rotulo?: string; // quem recebe, quando não é a pessoa do celular
};

// Exame de exemplo: PS do CEPON que chegou às 14:00.
const CHEGOU = 14 * 60;
const hora = (min: number) => {
  const t = ((CHEGOU + Math.round(min)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
// Mesmo formato do robô (duracao em sla-alertas): mínimo 1 min, "2 h 5 min".
const tempo = (min: number) => {
  const a = Math.max(1, Math.abs(Math.round(min)));
  return a < 60 ? `${a} min` : `${Math.floor(a / 60)} h${a % 60 ? ` ${a % 60} min` : ""}`;
};

export function PreviaCelular() {
  const [pessoa, setPessoa] = useState<Pessoa>("plantonista");
  const passos = usePassos();
  const regras = useRegras();
  const extras = useRegrasExtras();
  const prazo = regras.data?.prazos?.ps ?? 120;

  const msgs = useMemo<Msg[]>(() => {
    const ex = extras.data;
    if (!passos.data || !ex) return [];
    const vence = prazo;
    const ativos = passos.data.filter((p) => p.ativo).filter((p) => p.minutos <= ex.max_atraso_min);
    const plant = ativos.filter((p) => p.destino === "plantonista").sort((a, b) => a.minutos - b.minutos);
    const contato = ativos.filter((p) => p.destino === "contato").sort((a, b) => a.minutos - b.minutos);
    const base = "Pronto Socorro, CEPON";

    const doPlantao = (p: { minutos: number; canal: string }): Msg => {
      const m = vence + p.minutos;
      if (p.canal === "ligacao") {
        return { min: m, tipo: "ligacao", texto: `"Alerta de prazo de laudo da GSS, CEPON. Exame do Pronto Socorro, das ${hora(0)}, ${p.minutos > 0 ? `passou do prazo há ${p.minutos} minutos` : "está perto de vencer"}. Confira o PACS. Aperte 1 para assumir o laudo."` };
      }
      return p.minutos < 0
        ? { min: m, tipo: "whatsapp", texto: `Alerta de SLA de laudo - ${base}: o exame das ${hora(0)} vence em ${tempo(-p.minutos)}. Confira o PACS e toque em Assumir laudo para parar os avisos.`, botao: "Assumir laudo" }
        : { min: m, tipo: "whatsapp", texto: `SLA de laudo vencido - ${base}: o exame das ${hora(0)} passou do prazo ha ${tempo(Math.max(p.minutos, 1))} e ninguem assumiu o laudo. Confira o PACS e toque em Assumir laudo.`, botao: "Assumir laudo" };
    };

    if (pessoa === "plantonista") {
      const lista = plant.map(doPlantao);
      if (!lista.length) return [{ min: 0, tipo: "texto", texto: "Nenhum aviso ligado para o plantão." }];
      return lista;
    }

    if (pessoa === "assumiu") {
      const primeiro = plant[0];
      const m0 = primeiro ? vence + primeiro.minutos : vence;
      const lista: Msg[] = primeiro ? [doPlantao(primeiro)] : [];
      lista.push({ min: m0 + 1, tipo: "eu", texto: "Assumir laudo" });
      lista.push({ min: m0 + 1, tipo: "texto", texto: `Laudo assumido: ${base}, exame das ${hora(0)}. Os avisos deste exame pararam. Obrigado!` });
      lista.push({ min: vence + ex.assumido_folga_min, tipo: "texto",
        texto: `SLA de laudo: CEPON, Pronto Socorro, exame das ${hora(0)}. Você assumiu este laudo, mas o prazo venceu há ${tempo(ex.assumido_folga_min)} e o exame ainda está sem laudo no PACS. Confira, por favor.` });
      return lista;
    }

    if (pessoa === "coordenacao") {
      const lista: Msg[] = contato.map((p) => {
        const quem = `${p.contato_nome ?? "Contato"}${p.contato_papel ? ` (${PAPEL_CONTATO[p.contato_papel]})` : ""}`;
        if (p.canal === "email") return { min: vence + p.minutos, tipo: "email", rotulo: quem, texto: `SLA de laudo sem dono: ${base}, exame das ${hora(0)}. Ninguém assumiu o laudo.` };
        return { ...doPlantao({ minutos: p.minutos, canal: p.canal }), rotulo: quem };
      });
      lista.push({ min: vence + ex.assumido_folga_min, tipo: "email", rotulo: "Se alguém assumiu e não laudou",
        texto: `CEPON, Pronto Socorro, exame das ${hora(0)}: assumido por Dra. Exemplo, mas o prazo venceu há ${tempo(ex.assumido_folga_min)} e o laudo ainda não saiu.` });
      lista.push({ min: (ex.resumo_hora * 60 - CHEGOU + 1440) % 1440, tipo: "email", rotulo: "Todo dia",
        texto: `SLA de laudos: indicadores das ${ex.resumo_hora}h às ${ex.resumo_hora}h, por unidade (no prazo, vencidos, tempo médio).` });
      return lista;
    }

    // Estação parada: quem está em Coordenação › "Se a estação parar" (WhatsApp e e-mail).
    const lim = ex.estacao_limite_min;
    return [
      { min: lim, tipo: "whatsapp", texto: `Estacao do SLA de laudos - CEPON: CEPON parou ${hora(lim)}. Veja a situacao e o passo a passo no Sigma pelo botao.`, botao: "Ver o SLA" },
      { min: lim + ex.estacao_lembrete_h * 60, tipo: "whatsapp", texto: `Estacao do SLA de laudos - CEPON: CEPON continua parada desde ${hora(lim)}. Veja a situacao e o passo a passo no Sigma pelo botao.`, botao: "Ver o SLA" },
      { min: lim + ex.estacao_lembrete_h * 60 + 20, tipo: "whatsapp", texto: `Estacao do SLA de laudos - CEPON: CEPON voltou ${hora(lim + ex.estacao_lembrete_h * 60 + 20)}. Veja a situacao e o passo a passo no Sigma pelo botao.`, botao: "Ver o SLA" },
    ];
  }, [pessoa, passos.data, extras.data, prazo]);

  const carregando = passos.isLoading || regras.isLoading || extras.isLoading;
  const ordenadas = [...msgs].sort((a, b) => a.min - b.min);
  const legenda = pessoa === "estacao"
    ? `Exemplo: a leitura do CEPON para às ${hora(0)}.`
    : `Exemplo: exame do PS do CEPON chegou às ${hora(0)} e vence às ${hora(prazo)} (prazo de ${tempo(prazo)}).`;

  return (
    <section aria-labelledby="previa-titulo" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="previa-titulo" className="text-base font-semibold">Como chega no celular</h3>
        <p className="text-xs text-muted-foreground">Segue as regras salvas. Nada é enviado daqui.</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Quem recebe">
        {PESSOAS.map((p) => (
          <button key={p.k} type="button" role="tab" aria-selected={pessoa === p.k} onClick={() => setPessoa(p.k)}
            className={`h-8 rounded-full px-3 text-xs font-medium ring-1 transition-colors ${pessoa === p.k ? "bg-primary text-primary-foreground ring-primary" : "bg-background text-muted-foreground ring-border hover:text-foreground"}`}>
            {p.nome}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{legenda}</p>

      {/* Moldura de celular: largura fixa de aparelho, conversa rola por dentro. */}
      <div className="mx-auto mt-3 w-[300px] max-w-full rounded-[2rem] border-[6px] border-slate-800 bg-slate-800 shadow-lg">
        <div className="overflow-hidden rounded-[1.6rem]">
          <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2.5 text-white">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">GSS</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">GSS · SLA de laudos</p>
              <p className="text-[11px] leading-tight text-white/75">conta comercial</p>
            </div>
          </div>
          <div className="h-[420px] space-y-2 overflow-y-auto bg-[#ece5dd] px-2.5 py-3">
            {carregando && <Skeleton className="h-24 w-full" />}
            {!carregando && ordenadas.map((m, i) => <Bolha key={i} m={m} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function Bolha({ m }: { m: Msg }) {
  if (m.tipo === "eu") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-2.5 py-1.5 text-[13px] text-slate-900 shadow-sm">
          {m.texto} <span className="ml-1 text-[11px] text-slate-500">{hora(m.min)}</span>
        </div>
      </div>
    );
  }
  const icone = m.tipo === "ligacao" ? <Phone className="h-3.5 w-3.5" /> : m.tipo === "email" ? <Mail className="h-3.5 w-3.5" /> : null;
  const titulo = m.tipo === "ligacao" ? "Ligação" : m.tipo === "email" ? "E-mail" : null;
  return (
    <div className="flex justify-start">
      <div className={`max-w-[88%] rounded-lg rounded-tl-none px-2.5 py-1.5 text-[13px] text-slate-900 shadow-sm ${m.tipo === "email" ? "bg-slate-50 ring-1 ring-slate-200" : "bg-white"}`}>
        {(titulo || m.rotulo) && (
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            {icone}{titulo}{titulo && m.rotulo ? " · " : ""}{m.rotulo}
          </p>
        )}
        <p className="whitespace-pre-line leading-snug">{m.texto}</p>
        <p className="mt-0.5 text-right text-[11px] text-slate-500">{hora(m.min)}</p>
        {m.botao && <div className="-mx-2.5 mt-1 border-t border-slate-200 pt-1.5 text-center text-[13px] font-medium text-[#1a8cd8]">{m.botao}</div>}
      </div>
    </div>
  );
}
