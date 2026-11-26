// Motivo legível da estação do SLA parada, a partir da última leitura recebida (qualquer status). Usado pelo
// sla-alertas no WhatsApp/e-mail da queda e no texto que a tela de Radiologia mostra (sla_coletor_quedas.motivo).
// 25/11/2026: o motivo era gravado só quando a queda abria. Tijucas abriu à noite como "PC desligado" e de manhã,
// com o PC ligado e a sessão do portal expirada, a tela seguia dizendo "PC desligado". Agora o sla-alertas regrava o
// motivo a cada verificação enquanto a queda estiver aberta, e cada código dos coletores tem texto próprio.
// Códigos: estacao-gss/sla/coletor.ps1 e coletor_vue_uia.py (Vue PACS), tijucas/ e mobilemed/ (portais web no Chrome).

export type Leitura = { status: string; detalhe: { motivo?: string | null } | null; lida_em: string };

const SEM_LEITURA = "A estação parou de mandar leituras: PC desligado ou em suspensão, internet/túnel caído ou a tarefa do coletor parou.";

const PORTAL: Record<string, string> = { tijucas: "portal de Tijucas (Animati)", mobilemed: "portal da Mobilemed" };

const TEXTO: Record<string, (u: string) => string> = {
  pacs_fechado: () => "O Vue PACS está fechado na estação.",
  vue_fechado: () => "O Vue PACS está fechado na estação.",
  tela_indisponivel: () => "A tela da estação está bloqueada ou a sessão do usuário caiu.",
  tela_login: () => "O Vue PACS está na tela de login: alguém precisa entrar com o usuário da GSS.",
  fora_da_pasta: () => "O Vue PACS está aberto, mas fora da pasta da fila (outra pasta ou um exame aberto).",
  sem_tabela: () => "O Vue PACS está aberto, mas a lista de exames não aparece.",
  vpn_desconectada: () => "A VPN do hospital (Sophos) caiu: o PACS não alcança o servidor. Alguém precisa reconectar a VPN na estação.",
  sessao_expirada: (u) => `O login do ${PORTAL[u] ?? "portal"} expirou: alguém precisa entrar de novo no Chrome do robô, no PC da estação.`,
  chrome_fechado: () => "O Chrome do robô está fechado na estação (ele reabre sozinho em até 3 min; se não voltar, abra pelo atalho).",
  sem_aba_animati: () => "O Chrome do robô está aberto, mas sem a aba do portal de Tijucas.",
  sem_aba_mobilemed: () => "O Chrome do robô está aberto, mas sem a aba do portal da Mobilemed.",
  api: (u) => `O ${PORTAL[u] ?? "portal"} não respondeu à consulta da fila.`,
};

export function motivoQueda(unidade: string, ultima: Leitura | null, minutosSemNada: number | null, limiteMin: number): string {
  if (!ultima || (minutosSemNada !== null && minutosSemNada > limiteMin)) return SEM_LEITURA;
  const m = ultima.detalhe?.motivo ?? "";
  if (TEXTO[m]) return TEXTO[m](unidade);
  if (ultima.status === "sem_grade") {
    return PORTAL[unidade]
      ? `O ${PORTAL[unidade]} está aberto, mas a fila não veio.`
      : "O PACS está aberto, mas a lista não aparece: outra janela por cima, outra pasta ou a VPN caiu.";
  }
  return `Última leitura com status "${ultima.status}"${m ? ` (${m})` : ""}.`;
}

// Queda rápida (26/11/2026): o Wagner fechou o PACS da Marieta e o Sigma seguiu mostrando "lendo" com a fila velha
// por ~20 min (limite de 15 min sem leitura boa + cron de 5 min). Nos 7 dias anteriores, estes códigos em 2 leituras
// seguidas nunca voltaram sozinhos, e nenhum silêncio acima de 8 min foi falso. Os outros casos seguem o limite geral.
// chrome_fechado fica de fora: o Chrome do robô reabre sozinho em até 3 min.
const DEFINITIVOS = new Set(["pacs_fechado", "vue_fechado", "vpn_desconectada", "tela_login", "sessao_expirada"]);
export const SILENCIO_MIN = 8;

// ultimas: as 2 leituras mais recentes da unidade, da mais nova para a mais velha.
export function quedaRapida(ultimas: Leitura[], minutosSemNada: number | null): boolean {
  if (minutosSemNada !== null && minutosSemNada > SILENCIO_MIN) return true;
  if (ultimas.length < 2) return false;
  const m = ultimas.map((u) => u.detalhe?.motivo ?? "");
  return DEFINITIVOS.has(m[0]) && m[0] === m[1];
}
