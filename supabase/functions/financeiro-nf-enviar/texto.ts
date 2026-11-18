// Texto do pedido de NF (prévia e variáveis do template do WhatsApp), sem dependência de Deno: o teste do ajuste de
// horas (src/components/financeiro/ajusteHoras.test.ts) roda as mesmas funções que a edge.

// Colunas do pagamento que o pedido lê. As horas são total_horas_minutos, que o recálculo do banco já devolve com os
// ajustes de escala somados (20261118140000_financeiro_ajuste_horas.sql); minutos_produzidos é só a base.
export const COLUNAS_PAGAMENTO =
  "id, profissional_nome, medico_id, mes_referencia, ano_referencia, unidade, setor, total_plantoes, total_horas_minutos, valor_total, nf_lembretes, arquivo_origem";

export type Pag = {
  id: string; profissional_nome: string; medico_id: string | null;
  mes_referencia: number; ano_referencia: number; unidade: string | null; setor: string | null;
  total_plantoes: number | null; total_horas_minutos: number | null; valor_total: number | null;
  arquivo_origem: string | null;
  nf_lembretes: number | null;
};

// Resumo do que o médico fez no mês, para o pedido de nota (a Mavi pediu em 15/10 que a mensagem traga
// as horas ou a quantidade de consultas, no texto dela: "referente a xx horas ou xx consultas realizadas
// no local xx"). Plantão vem com horas; consulta e exame vêm como item com quantidade e sem data.
// Texto sem acento, como o resto do template.
export type Item = { pagamento_id: string; data_plantao: string | null; descricao: string | null; quantidade: number | null; carga_horaria_minutos: number | null };
export function resumoProducao(pag: Pag, itens: Item[]): string {
  const partes: string[] = [];
  const min = Number(pag.total_horas_minutos || 0);
  if (min > 0) {
    const h = Math.floor(min / 60), m = min % 60;
    partes.push(m ? `${h}h${String(m).padStart(2, "0")}` : `${h} hora${h === 1 ? "" : "s"}`);
  }
  // o relatório consolidado resume os plantões numa linha com quantidade ("18 plantão(ões)"): isso já está nas horas
  const qtd = itens.filter((i) => !i.data_plantao && i.descricao && Number(i.quantidade) > 0
    && !Number(i.carga_horaria_minutos) && !/plant/i.test(i.descricao));
  if (qtd.length) {
    const total = qtd.reduce((s, i) => s + Number(i.quantidade), 0);
    const consultas = qtd.every((i) => /consult/i.test(i.descricao || ""));
    // planilha separada por tipo (CIS Navegantes): a Mavi quer que o médico veja quantas consultas,
    // procedimentos e colonoscopias fez, cada um com seu número
    const TIPOS = /^(consultas|procedimentos|colonoscopias)$/i;
    if (qtd.every((i) => TIPOS.test(i.descricao || ""))) {
      const porTipo = new Map<string, number>();
      for (const i of qtd) porTipo.set(i.descricao!.toLowerCase(), (porTipo.get(i.descricao!.toLowerCase()) ?? 0) + Number(i.quantidade));
      const ordem = ["consultas", "procedimentos", "colonoscopias"];
      for (const [t, n] of [...porTipo].sort((x, y) => ordem.indexOf(x[0]) - ordem.indexOf(y[0])))
        partes.push(`${n} ${n === 1 ? t.replace(/s$/, "") : t}`);
    } else if (!consultas && qtd.every((i) => /^[A-Z0-9ÇÃÕÁÉÍÓÚÂÊÔ .\/-]{1,24}$/.test(i.descricao!.trim()))) {
      // colunas da matriz de radiologia vêm em maiúsculas (TC, RX, USG, DOPPLER); texto livre fica no total
      // Radiologia (Marieta, CEPON): a Mavi quer a produção separada por tipo de exame (13/11: "eles querem
      // ver a produção completa, não total geral"). Mantém a ordem das colunas da planilha.
      const porTipo = new Map<string, number>();
      for (const i of qtd) { const k = i.descricao!.trim().toUpperCase(); porTipo.set(k, (porTipo.get(k) ?? 0) + Number(i.quantidade)); }
      [...porTipo].forEach(([t, n], k) => partes.push(k === 0 ? `${n} ${n === 1 ? "exame" : "exames"} de ${t}` : `${n} de ${t}`));
    } else {
      // "realizadas" vem do texto da Mavi: exame de radiologia entra como "consultas/exames" para concordar
      partes.push(`${total} ${consultas ? (total === 1 ? "consulta" : "consultas") : "consultas/exames"}`);
    }
  }
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : partes[0];
  return semAcento(lista || "atividades");
}
// O local é o nome que a Mavi dá ao arquivo do Dr. Escala antes de importar ("Ibirama", "Nova Prata"):
// é a cidade, que o médico reconhece. Sem arquivo, usa a unidade da escala.
export function localDoServico(pag: Pag): string {
  const arquivo = String(pag.arquivo_origem || "").replace(/^\[cfg:[^\]]+\]\s*/, "").replace(/\.(xlsx|xls|csv)$/i, "").trim();
  // o nome do arquivo costuma levar o mês ("Ibirama - agosto"): o local é só a cidade
  const cidade = arquivo
    .replace(/[\s_\-–(]*(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|\d{1,2}[\/.\-]\d{2,4}|20\d{2})[a-z]*[)\s_\-–\/.]*/gi, " ")
    .replace(/[\s_\-–]+$/, "").trim();
  return semAcento(cidade || arquivo || pag.unidade || pag.setor || "indicado na escala");
}
export const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
