// Utilitário central para normalizar telefones no SigZap (deduplicação, chaves, etc.)
// Objetivo: tratar variações como espaços, +, @s.whatsapp.net, @lid, etc.

export function sigzapNormalizePhoneKey(raw: string | null | undefined): string {
  if (!raw) return "";

  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";

  // Remove DDI 55 quando houver (mantém apenas DDD+numero)
  const withoutCountry = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;

  // Brasil: tratar variações com/sem o dígito 9 (celular)
  // Ex:
  // - 47992182993 (11) -> 4792182993 (10)
  // - 4792182993 (10)  -> 4792182993 (10)
  const last11 = withoutCountry.length >= 11 ? withoutCountry.slice(-11) : withoutCountry;
  const last10 = withoutCountry.length >= 10 ? withoutCountry.slice(-10) : withoutCountry;

  // Se for 11 dígitos e o 3º dígito for '9', remove para deduplicar com o formato antigo (10 dígitos)
  if (last11.length === 11 && last11[2] === "9") {
    return last11.slice(0, 2) + last11.slice(3);
  }

  if (last10.length >= 10) return last10;

  return withoutCountry;
}
