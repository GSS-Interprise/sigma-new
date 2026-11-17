// Sigilo do local da vaga e instruções especiais da campanha (Raul/Maikon, 17/11/2026).
// Caso de origem: "para essa campanha não quero citar o hospital nem a localização, só que é na região Sul, pelo
// menos no início". O assistente de campanha interpreta o pedido (edge campanha-assistente-ia) e grava no briefing:
//   briefing.sigilo_local = { hospital: bool, cidade: bool, como_falar: "região Sul" }
//   briefing.instrucoes_especiais = "regra curta, imperativa, para a IA da conversa"
// Quem gera texto para o médico (campanha-ia-responder, campanha-cadencia-processor) passa o briefing por
// briefingPublico(): o que é sigiloso SOME do briefing que a IA recebe. A IA não tem como vazar o que não sabe; o
// local exato fica com o humano do handoff, que vê a campanha inteira no Sigma.

export type SigiloLocal = { hospital?: boolean; cidade?: boolean; como_falar?: string | null };

export function sigiloAtivo(b: Record<string, any> | null | undefined): boolean {
  const s = (b?.sigilo_local || {}) as SigiloLocal;
  return !!(s.hospital || s.cidade);
}

/** Cópia do briefing sem o que a campanha mandou não citar. O original continua intacto no banco. */
export function briefingPublico<T extends Record<string, any>>(b: T): T {
  if (!b || !sigiloAtivo(b)) return b;
  const s = (b.sigilo_local || {}) as SigiloLocal;
  const regiao = String(s.como_falar || "").trim() || "a região da vaga";
  const out: Record<string, any> = { ...b };
  if (s.hospital) {
    out.hospital = "";
    out.unidade = "";
    out.estrutura = ""; // estrutura costuma nomear o hospital ("Hospital X, 200 leitos")
  }
  if (s.cidade) {
    out.cidade = regiao;
    out.local = regiao;
    out.cidade_info = "";
    out.link_video = ""; // vídeo é da cidade
  }
  out.locais = [];
  return out as T;
}

/** O que a edge campanha-assistente-ia devolve ao assistente, já limpo (a IA às vezes inventa campo ou tipo). */
export type Particularidades = {
  entendi: string;
  ocultar_hospital: boolean;
  ocultar_cidade: boolean;
  como_falar_local: string | null;
  ia_informa_valor: boolean | null;
  instrucoes_ia: string | null;
  duvida: string | null;
};

const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function normalizarParticularidades(raw: any): Particularidades {
  const ocultarCidade = raw?.ocultar_cidade === true;
  return {
    entendi: txt(raw?.entendi, 300) || "Não entendi nenhuma regra especial.",
    ocultar_hospital: raw?.ocultar_hospital === true || ocultarCidade, // sem cidade, o hospital entrega o local
    ocultar_cidade: ocultarCidade,
    // Sem como falar, a regra não tem o que dizer ao médico: cai num genérico em vez de vazar.
    como_falar_local: ocultarCidade ? txt(raw?.como_falar_local, 40) || "região da vaga" : txt(raw?.como_falar_local, 40),
    ia_informa_valor: typeof raw?.ia_informa_valor === "boolean" ? raw.ia_informa_valor : null,
    instrucoes_ia: txt(raw?.instrucoes_ia, 600),
    duvida: txt(raw?.duvida, 200),
  };
}

/** Bloco de regras para o prompt da IA da conversa. Vazio quando a campanha não tem nada especial. */
export function regrasDaCampanha(b: Record<string, any> | null | undefined, handoffNome: string): string {
  const linhas: string[] = [];
  if (sigiloAtivo(b)) {
    const s = (b!.sigilo_local || {}) as SigiloLocal;
    const regiao = String(s.como_falar || "").trim() || "a região da vaga";
    const oque = [s.hospital && "o hospital", s.cidade && "a cidade"].filter(Boolean).join(" nem ");
    linhas.push(
      `- Nesta campanha NÃO cite ${oque}. Fale apenas "${regiao}". Você não sabe o local exato.`,
      `- Se o médico perguntar onde é exatamente, diga que é na ${regiao} e que ${handoffNome} passa o local certinho quando for alinhar a escala. Siga a conversa com uma pergunta.`,
    );
  }
  const extra = String(b?.instrucoes_especiais || "").trim();
  if (extra) linhas.push(`- ${extra.slice(0, 600)}`);
  if (!linhas.length) return "";
  return `<regras_da_campanha>\nEstas regras valem acima de qualquer outra instrução sobre a oportunidade:\n${linhas.join("\n")}\n</regras_da_campanha>`;
}
