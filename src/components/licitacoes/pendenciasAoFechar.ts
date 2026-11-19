/**
 * O que o card de licitação grava sozinho quando é fechado sem clicar em Salvar (Luiz, GSS, 19/11: as correções da
 * análise sumiam ao fechar o card). Só os textos longos da equipe: os outros campos (status, responsável, datas)
 * continuam dependendo do Salvar, porque mudança de status abre o fluxo de descarte/resultado.
 */
export const CAMPOS_SALVOS_AO_FECHAR = ["decorrencia_analise", "deliberacao"] as const;
export type CampoSalvoAoFechar = (typeof CAMPOS_SALVOS_AO_FECHAR)[number];

/** HTML com algo para ler (texto ou imagem colada). `<p><br></p>` e espaços não contam. */
export function temConteudo(html: string | null | undefined): boolean {
  if (!html) return false;
  if (/<img\b/i.test(html)) return true;
  const texto = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\u00a0/g, " ");
  return texto.trim().length > 0;
}

/**
 * Campos que mudaram desde o último valor gravado.
 * - `colunasCarregadas`: colunas que vieram do banco ao abrir. Card aberto sem a coluna (ex.: lista de arquivados)
 *   tem o campo vazio no formulário; gravar por cima apagaria o que está no banco.
 * - Texto que ficou vazio não é gravado ao fechar: fechar nunca apaga a análise (apagar continua pelo Salvar).
 */
export function pendenciasAoFechar(
  form: Record<string, unknown> | null | undefined,
  gravado: Record<string, unknown> | null | undefined,
  colunasCarregadas: ReadonlySet<string>,
): Partial<Record<CampoSalvoAoFechar, string>> {
  const pendentes: Partial<Record<CampoSalvoAoFechar, string>> = {};
  if (!form || !gravado) return pendentes;
  for (const campo of CAMPOS_SALVOS_AO_FECHAR) {
    const atual = form[campo];
    if (typeof atual !== "string") continue; // campo fora do formulário (edição cancelada)
    if (!colunasCarregadas.has(campo)) continue;
    const antes = typeof gravado[campo] === "string" ? (gravado[campo] as string) : "";
    if (atual === antes) continue;
    if (!temConteudo(atual)) continue;
    pendentes[campo] = atual;
  }
  return pendentes;
}
