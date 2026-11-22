// Regras puras dos avisos de tempo de resposta (docs/arquitetura/tempo-de-resposta-atendimento.md §3d). Sem banco e
// sem rede: a edge alertas-equipe (ação "atendimento") lê atendimento_aguardando_base() e atendimento_config, chama
// montarAvisos e grava o que saiu em atendimento_avisos. Testes: atendimento_test.ts.
//
// Decisões:
//   - a escada conta só minutos DENTRO do horário de atendimento: mensagem de sábado não dispara as 4 faixas de uma vez
//     na segunda às 8h (a tela mostra o tempo corrido; o aviso usa o tempo útil);
//   - conversa com a IA atuando não gera aviso (quem responde é a IA);
//   - faixa "responsavel" sem responsável no número, ou sem telefone, vai para a coordenação;
//   - um WhatsApp por pessoa e rodada, com todas as conversas novas dela; cada (conversa, início da espera, faixa,
//     telefone REAL) sai uma vez só, em modo teste também.

export const TZ_OFFSET_MIN = -180; // Brasília, sem horário de verão desde 2019
export const JANELA_DIAS = 3; // espera mais velha que isto não gera aviso (vira faxina na tela)

export type Faixa = { min: number; para: "responsavel" | "coordenacao" | "diretoria" };
export type Pessoa = { nome: string; fone: string };
export type Config = {
  faixas: Faixa[]; dias: number[]; hora_inicio: string; hora_fim: string;
  coordenacao: Pessoa[]; diretoria: Pessoa[]; modo_teste: boolean; teste_fone: string | null;
};
export type Espera = {
  conversation_id: string; contato_nome: string; contato_marcado: string | null; prioridade: boolean;
  numero: string; responsavel_id: string | null; responsavel_nome: string | null;
  esperando_desde: string; ia_atuando: boolean;
};
export type Feito = { conversation_id: string; esperando_desde: string; faixa_min: number; fone: string };
export type Item = { espera: Espera; faixa: number; minutos: number };
/** `fone` = para onde sai agora (o de teste, em modo teste); `fone_real` = o da pessoa, que é o que fica registrado. */
export type Aviso = { nome: string; fone: string; fone_real: string; destino_real: string; itens: Item[] };

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };

/** Minutos de horário de atendimento entre dois instantes (dias ISO 1=seg..7=dom, horas de Brasília). */
export function minutosUteis(de: Date, ate: Date, cfg: Pick<Config, "dias" | "hora_inicio" | "hora_fim">): number {
  if (ate <= de) return 0;
  const ini = hm(cfg.hora_inicio), fim = hm(cfg.hora_fim);
  if (fim <= ini) return 0;
  const local = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MIN * 60_000); // relógio de Brasília em campos UTC
  const a = local(de), b = local(ate);
  let total = 0;
  const dia = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  for (let i = 0; i < 400 && dia <= b; i++, dia.setUTCDate(dia.getUTCDate() + 1)) {
    const iso = ((dia.getUTCDay() + 6) % 7) + 1;
    if (!cfg.dias.includes(iso)) continue;
    const jIni = dia.getTime() + ini * 60_000, jFim = dia.getTime() + fim * 60_000;
    const s = Math.max(jIni, a.getTime()), e = Math.min(jFim, b.getTime());
    if (e > s) total += (e - s) / 60_000;
  }
  return Math.floor(total);
}

export const dentroDoHorario = (agora: Date, cfg: Pick<Config, "dias" | "hora_inicio" | "hora_fim">) =>
  minutosUteis(new Date(agora.getTime() - 60_000), agora, cfg) > 0;

/**
 * Avisos desta rodada. `fones` = telefone de cada responsável (profiles.telefone), por id.
 * Em modo teste tudo vai para teste_fone, com o destino real guardado em `destino_real`.
 */
export function montarAvisos(esperas: Espera[], cfg: Config, feitos: Feito[], fones: Map<string, string>, agora: Date): Aviso[] {
  if (!dentroDoHorario(agora, cfg)) return [];
  const ja = new Set(feitos.map((f) => `${f.conversation_id}|${new Date(f.esperando_desde).getTime()}|${f.faixa_min}|${dig(f.fone)}`));
  const faixas = [...cfg.faixas].filter((f) => f.min > 0).sort((x, y) => x.min - y.min);
  const porFone = new Map<string, Aviso>();
  const limite = agora.getTime() - JANELA_DIAS * 86_400_000;
  for (const e of esperas) {
    if (e.ia_atuando) continue;
    const desde = new Date(e.esperando_desde);
    if (desde.getTime() < limite) continue;
    const uteis = minutosUteis(desde, agora, cfg);
    for (const f of faixas.filter((x) => uteis >= x.min)) {
      let quem: Pessoa[];
      if (f.para === "responsavel") {
        const fone = e.responsavel_id ? dig(fones.get(e.responsavel_id)) : "";
        quem = fone ? [{ nome: e.responsavel_nome || "Responsável", fone }] : cfg.coordenacao;
      } else quem = f.para === "coordenacao" ? cfg.coordenacao : [...cfg.coordenacao, ...cfg.diretoria];
      for (const p of quem) {
        const real = dig(p.fone);
        if (!real) continue;
        const fone = cfg.modo_teste ? dig(cfg.teste_fone) : real;
        if (!fone) continue;
        const chave = `${e.conversation_id}|${desde.getTime()}|${f.min}|${real}`;
        if (ja.has(chave)) continue;
        ja.add(chave);
        const k = cfg.modo_teste ? `${fone}|${real}` : fone;
        if (!porFone.has(k)) porFone.set(k, { nome: p.nome, fone, fone_real: real, destino_real: p.nome, itens: [] });
        const av = porFone.get(k)!;
        // Mesma conversa em duas faixas na mesma rodada (achada atrasada): fica só a maior.
        const i = av.itens.findIndex((x) => x.espera.conversation_id === e.conversation_id);
        if (i >= 0) av.itens[i] = { espera: e, faixa: f.min, minutos: uteis };
        else av.itens.push({ espera: e, faixa: f.min, minutos: uteis });
      }
    }
  }
  return [...porFone.values()].map((a) => ({ ...a, itens: a.itens.sort((x, y) => y.minutos - x.minutos) }));
}

export const tempo = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/** Os 2 parâmetros do modelo gss_atendimento_espera_v1 (sem quebra de linha, até ~700 caracteres). */
export function textoAviso(a: Aviso, teste: boolean): [string, string] {
  const n = a.itens.length;
  const maior = a.itens[0]?.minutos ?? 0;
  const resumo = `${teste ? `[teste, para ${a.destino_real}] ` : ""}${n === 1 ? `1 conversa esperando há ${tempo(maior)}` : `${n} conversas esperando, a mais antiga há ${tempo(maior)}`}`;
  const partes: string[] = [];
  let tam = 0;
  for (const [i, it] of a.itens.entries()) {
    const quem = it.espera.contato_marcado ? `${it.espera.contato_marcado} (cliente)` : it.espera.contato_nome;
    const p = `${quem.replace(/\s+/g, " ").trim().slice(0, 50)}, ${tempo(it.minutos)}, número ${it.espera.numero.slice(-4)}${it.espera.responsavel_nome ? ` de ${it.espera.responsavel_nome.split(" ")[0]}` : ""}`;
    if (tam + p.length > 600) { partes.push(`+${n - i} no Sigma`); break; }
    partes.push(p); tam += p.length + 2;
  }
  return [resumo, partes.join("; ")];
}
