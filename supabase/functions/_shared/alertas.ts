// Regras puras dos avisos no WhatsApp (alertas-equipe) e da escolha na criação da campanha (PassoConversa.tsx, que
// importa este arquivo). Testes: alertas_test.ts (deno test).

export type Destino = { nome: string; fone: string };

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** (48) 99999-9999, 48999999999 ou +55 48 99999-9999 → 5548999999999. Outro formato volta só com os dígitos. */
export function normalizarFone(v: unknown) {
  const d = soDigitos(v);
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

/** Celular (9 + 8 dígitos) ou fixo (2-5 + 7 dígitos) brasileiro, com 55 e DDD de 11 a 99. Número de fora do Brasil
 * digitado sem o + (ex.: 1 202 555 0100) não pode virar um "celular" brasileiro inventado. */
export const foneValido = (v: unknown) => /^55[1-9][1-9](9\d{8}|[2-5]\d{7})$/.test(normalizarFone(v));

export function mostrarFone(v: unknown) {
  const n = normalizarFone(v).replace(/^55/, "");
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return String(v ?? "");
}

/** campanhas.alerta_destinos → só quem tem número válido, já normalizado, sem repetir número. */
export function destinosValidos(lista: unknown): Destino[] {
  const vistos = new Set<string>();
  const out: Destino[] = [];
  for (const d of Array.isArray(lista) ? lista : []) {
    const fone = normalizarFone((d as any)?.fone);
    if (!foneValido(fone) || vistos.has(fone)) continue;
    vistos.add(fone);
    out.push({ nome: String((d as any)?.nome || "").trim(), fone });
  }
  return out;
}

/** Config alertas_equipe_destinos ("Nome:55...; Nome:55...") → destinos. */
export function destinosDaConfig(valor: string | null | undefined): Destino[] {
  return destinosValidos(String(valor || "").split(/[;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.lastIndexOf(":");
    return { nome: i > 0 ? x.slice(0, i).trim() : "", fone: i > 0 ? x.slice(i + 1) : x };
  }));
}

/** Parâmetro de modelo da Meta: sem quebra de linha nem espaços seguidos, até 180 caracteres. */
export const trechoAviso = (texto: string | null | undefined, padrao: string) =>
  (String(texto || "").trim() || padrao).replace(/\s+/g, " ").trim().slice(0, 180);
