// Texto dos PDFs dos contratos (contrato_texto_trechos), onde a IA dos contratos busca as cláusulas. Comum a
// contratos-ler-anexos (texto direto e OCR pelo Gemini, motor 'api') e à entrega do Hermes pelo sigma-mcp (OCR pela
// assinatura do Claude, motor 'hermes', frente de 27/11): mesmo corte em trechos e mesma gravação.
// deno-lint-ignore-file no-explicit-any

export const PADRAO = "contratos-documentos";
// Mesma lista de localDoAnexoContrato (ContratoDialogWithClient.tsx): há anexo "uuid/arquivo" em outros buckets.
export const BUCKETS = [PADRAO, "licitacoes-anexos", "editais-pdfs", "contrato-rascunho-anexos", "ages-documentos"];
const TAM = 1500;
export const MIN_TEXTO = 200;

export const PROMPT_OCR = `Transcreva todo o texto deste PDF exatamente como está escrito, em português, sem resumir, corrigir ou comentar.
Antes do texto de cada página escreva uma linha "=== PÁGINA N ===" (N = número da página, a partir de 1).
Tabela: uma linha de texto por linha da tabela, colunas separadas por " | ".
Ignore carimbos, rubricas e assinaturas manuscritas que não tenham texto legível.`;

export function local(url: string): { bucket: string; key: string } {
  if (url.startsWith("http")) {
    for (const b of BUCKETS) {
      const m = `/${b}/`;
      const i = url.indexOf(m);
      if (i !== -1) return { bucket: b, key: url.substring(i + m.length).split("?")[0] };
    }
    return { bucket: PADRAO, key: "" };
  }
  for (const b of BUCKETS) if (url.startsWith(`${b}/`)) return { bucket: b, key: url.substring(b.length + 1) };
  return { bucket: /^[0-9a-f-]{36}\//i.test(url) ? "licitacoes-anexos" : PADRAO, key: url };
}

// Trechos de até ~1.500 caracteres, quebrando em parágrafo ou linha que começa título/cláusula. Mesmo corte do
// backfill de 27/11, para os trechos novos ficarem iguais aos antigos.
export function trechos(paginas: string[]): { pagina: number; texto: string }[] {
  const out: { pagina: number; texto: string }[] = [];
  let buf = "";
  let pagIni: number | null = null;
  paginas.forEach((bruto, i) => {
    const txt = bruto.replace(/[ \t]+/g, " ");
    for (let par of txt.split(/\n\s*\n|\n(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][^\n]{0,60}\n)/)) {
      par = par.replace(/\s*\n\s*/g, " ").trim();
      if (!par) continue;
      if (pagIni === null) pagIni = i + 1;
      if (buf && buf.length + par.length + 1 > TAM) { out.push({ pagina: pagIni, texto: buf }); buf = ""; pagIni = i + 1; }
      while (par.length > TAM) { out.push({ pagina: i + 1, texto: par.slice(0, TAM) }); par = par.slice(TAM); }
      buf = (buf + " " + par).trim();
    }
  });
  if (buf) out.push({ pagina: pagIni ?? 1, texto: buf });
  return out;
}

// Resposta do OCR em páginas, pelo marcador "=== PÁGINA N ===". Sem marcador: tudo na página 1.
export function paginasDoOcr(txt: string): string[] {
  const partes = txt.split(/^\s*=+\s*P[ÁA]GINA\s+\d+\s*=+\s*$/im).map((p) => p.trim());
  if (partes.length > 1 && !partes[0]) partes.shift();
  return partes.filter((p, i) => p || i < partes.length - 1);
}

/** Troca os trechos do anexo pelo texto novo e grava a leitura. Devolve o status gravado e quantos trechos. */
export async function gravarTexto(
  svc: any, a: { id: string; contrato_id: string }, paginas: string[], totalPages: number | null, metodo: "texto" | "ocr",
): Promise<{ status: "ok" | "sem_texto"; trechos: number; caracteres: number }> {
  const ts = trechos(paginas).map((t) => ({ ...t, texto: t.texto.replace(/\u0000/g, "") }));
  const total = ts.reduce((s, t) => s + t.texto.length, 0);
  const { error: eDel } = await svc.from("contrato_texto_trechos").delete().eq("anexo_id", a.id);
  if (eDel) throw new Error(eDel.message);
  const leitura = (campos: Record<string, unknown>) =>
    svc.from("contrato_anexo_leitura").upsert({
      anexo_id: a.id, contrato_id: a.contrato_id, lido_em: new Date().toISOString(), erro: null, metodo,
      paginas: totalPages ?? paginas.length, caracteres: total, ...campos,
    }, { onConflict: "anexo_id" });
  if (total < MIN_TEXTO) { await leitura({ status: "sem_texto" }); return { status: "sem_texto", trechos: 0, caracteres: total }; }
  const linhas = ts.map((t, i) => ({ anexo_id: a.id, contrato_id: a.contrato_id, ordem: i, pagina: t.pagina, texto: t.texto }));
  for (let j = 0; j < linhas.length; j += 200) {
    const { error } = await svc.from("contrato_texto_trechos").insert(linhas.slice(j, j + 200));
    if (error) throw new Error(error.message);
  }
  await leitura({ status: "ok" });
  return { status: "ok", trechos: linhas.length, caracteres: total };
}

/** Entrada do item de OCR para o Hermes. O PDF vai por link assinado gerado na reserva (não aqui: o item pode esperar). */
export const entradaOcr = (a: { id: string; contrato_id: string; arquivo_nome?: string | null }, bucket: string, key: string, bytes: number) => ({
  instrucao: PROMPT_OCR,
  formato_resposta: "texto puro, com a linha \"=== PÁGINA N ===\" antes de cada página",
  arquivo: { bucket, key, nome: a.arquivo_nome ?? null, bytes },
  ref: { anexo_id: a.id, contrato_id: a.contrato_id },
});
