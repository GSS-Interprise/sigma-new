// Textos de máquina em português de dono, usados no Resumo da campanha, em Conversas e no assistente.

// Erros da Meta (os que mais aparecem nas campanhas). O que não casar vira "Outros motivos".
export function motivoLegivel(m: string) {
  if (/account locked|141006|payment/i.test(m)) return "Conta da Meta bloqueada (pagamento)";
  if (/healthy ecosystem|131049/i.test(m)) return "Meta segurou o envio para proteger o número";
  if (/undeliverable|131026|not a valid whatsapp/i.test(m)) return "Número sem WhatsApp ou inválido";
  if (/re-engagement|131047|24 hours/i.test(m)) return "Fora da janela de 24 h";
  if (/experiment|130472/i.test(m)) return "Médico num teste da Meta que bloqueia marketing";
  return "Outros motivos";
}

// Nomes chegam em caixa alta do CRM ("MARIA DA SILVA"); leem melhor como nome próprio.
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
export const nomeProprio = (s: string) =>
  s.trim().toLowerCase().split(/\s+/).map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");

// Modelo da Meta tem nome técnico ("gss_oportunidade_sair_20261026"); vira "Oportunidade sair · 26/10".
// Não usa a 1ª frase do texto: quase todos começam com a mesma saudação ("Olá, Dr(a). {{1}}").
export function nomeModelo(tecnico: string) {
  const m = tecnico.match(/^(?:gss_)?(.*?)(?:_v\d+)?(?:_(\d{4})(\d{2})(\d{2}))?(?:_v\d+)?$/i);
  const base = (m?.[1] || tecnico).replace(/_/g, " ").trim();
  const nome = base.charAt(0).toUpperCase() + base.slice(1);
  return m?.[2] ? `${nome} · ${m[4]}/${m[3]}` : nome;
}

// Começo do texto do modelo sem a saudação, para diferenciar modelos parecidos.
export function trechoModelo(body: string | null | undefined) {
  const t = (body || "").replace(/\{\{\d+\}\}/g, "…").replace(/^\s*(ol[aá]|oi|bom dia|boa tarde|boa noite)[^\n]*\n+/i, "").replace(/\s+/g, " ").trim();
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}
