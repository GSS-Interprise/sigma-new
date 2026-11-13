// Regras puras de LinkedIn e Instagram (Fase 9 do plano do Maikon), usadas pelas edges e pela tela.
// Sem import nenhum de propósito: o front (src/components/campanhas/redes/FilaRedes.tsx) importa este mesmo arquivo,
// então o convite que a pessoa copia na fila e o que o motor automático envia são sempre o mesmo texto.
// Testes: redes_test.ts (deno test).

export type Canal = "linkedin" | "instagram";
export type ItemConvite = { nome: string; especialidade: string | null; cidade_vaga: string | null };

export const primeiroNome = (nome: string) => {
  const p = String(nome || "").trim().toLowerCase().split(/\s+/)[0] || "";
  return p.charAt(0).toUpperCase() + p.slice(1);
};

// "&ANESTESIOLOGIA - RQE Nº: 63668& MEDICINA..." → "anestesiologia"
export const especialidadeCurta = (e: string | null) =>
  String(e || "").replace(/^&/, "").split(/ - RQE|\(/)[0].trim().toLowerCase();

/** LinkedIn: nota do convite até 300 caracteres (limite do LinkedIn). Instagram: mensagem curta de pessoa para pessoa. */
export function textoConvite(i: ItemConvite, canal: Canal = "linkedin") {
  const esp = especialidadeCurta(i.especialidade);
  const onde = String(i.cidade_vaga || "").trim() || "Santa Catarina";
  if (canal === "instagram") {
    return `Oi, Dr(a). ${primeiroNome(i.nome)}! Aqui é o Maikon Madeira, cirurgião cardiovascular e sócio da GSS Saúde. `
      + `Estamos com plantões ${esp ? `de ${esp} ` : ""}em ${onde}. Posso te passar os detalhes por aqui?`;
  }
  const t = `Olá, Dr(a). ${primeiroNome(i.nome)}! Sou o Dr. Maikon Madeira, cirurgião cardiovascular e sócio da GSS Saúde. `
    + `Temos plantões ${esp ? `de ${esp} ` : ""}em ${onde} e gostaria de me conectar para te passar os detalhes. Faz sentido para você?`;
  return t.length > 300 ? t.slice(0, 297) + "..." : t;
}

// ---- LinkedIn (motor automático, unipile-motor) ------------------------------------------------------------

export const RAMPA = { base: 5, sobePorSemana: 3, tetoPadrao: 20, confiancaMin: 85 };

/** Convites permitidos hoje: 5 na 1ª semana, +3 por semana desde que o motor foi ligado, até o teto da conta. */
export function limiteDiaLinkedin(rampaInicio: string | null | undefined, teto: number | null | undefined, agora = new Date()) {
  const semanas = rampaInicio ? Math.max(0, Math.floor((agora.getTime() - new Date(rampaInicio).getTime()) / (7 * 86_400_000))) : 0;
  return Math.min(RAMPA.base + RAMPA.sobePorSemana * semanas, teto ?? RAMPA.tetoPadrao);
}

/** linkedin.com/in/<id>/ → <id> (o que a Unipile aceita no lugar do id de membro). */
export const identificadorLinkedin = (url: string | null | undefined) =>
  String(url || "").match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] || null;

/** Perfil cadastrado à mão (sem nota) ou achado com confiança alta: convite para a pessoa errada queima a conta. */
export const podeConvidarSozinho = (confianca: number | null | undefined) => confianca == null || confianca >= RAMPA.confiancaMin;

/** Ids de membro (ACo...) que aparecem num evento da Unipile, sem depender do formato (que a doc não publica). */
export const idsDeMembro = (texto: string) => [...new Set(String(texto).match(/ACo[A-Za-z0-9_-]{10,}/g) || [])].slice(0, 20);

/** O evento é do médico? relation.new (aceitou) sempre; message.new só se ele for o remetente (a nota é nossa). */
export function eventoDoMedico(tipo: string, texto: string, destinoId: string) {
  if (tipo === "relation.new") return true;
  return texto.includes(`"sender_id":"${destinoId}"`) || texto.includes(`"sender":{"id":"${destinoId}"`);
}

// ---- Instagram (Zernio, instagram-zernio) -------------------------------------------------------------------

export const JANELA_META_MS = 24 * 3_600_000;

export const handleInstagram = (h: unknown) => String(h || "").trim().replace(/^@+/, "").toLowerCase();

/** Mensagem saiu da conta da GSS/Maikon (e não do médico)? O Zernio usa nomes diferentes conforme a rota. */
export function mensagemDaEmpresa(m: Record<string, unknown>, accountId: string) {
  return m.fromMe === true || m.direction === "outbound" || m.direction === "outgoing" || String(m.senderId || "") === String(accountId);
}

/** A Meta só deixa responder até 24 h depois da última mensagem do médico. */
export function janelaAberta(ultimaDoMedicoEm: string | null | undefined, agora = Date.now()) {
  return !!ultimaDoMedicoEm && agora - new Date(ultimaDoMedicoEm).getTime() <= JANELA_META_MS;
}
