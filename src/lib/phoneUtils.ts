/**
 * Normaliza telefone brasileiro para formato E.164 completo
 * Adiciona DDI 55 e o dígito 9 quando necessário
 * @param brPhone - Telefone no formato brasileiro (qualquer formato)
 * @returns Telefone no formato E.164 (+55...) ou null se inválido
 * 
 * Exemplos:
 * - 4799758708 -> +5547999758708 (adiciona 55 e 9)
 * - 47999758708 -> +5547999758708 (adiciona 55)
 * - 5547999758708 -> +5547999758708 (adiciona +)
 * - +5547999758708 -> +5547999758708 (já está correto)
 */
export function normalizeToE164(brPhone: string): string | null {
  if (!brPhone) return null;
  
  // Remove todos os caracteres não numéricos
  let digits = brPhone.replace(/\D/g, '');
  
  // Se começa com 55 e tem mais de 11 dígitos, remove o 55
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  
  // Se tem 10 dígitos (DDD + 8 dígitos), adiciona o 9 após o DDD
  // Celulares brasileiros têm 9 dígitos após o DDD
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const numero = digits.slice(2);
    digits = `${ddd}9${numero}`;
  }
  
  // Valida comprimento final (deve ter 11 dígitos: DDD + 9 dígitos)
  if (digits.length !== 11) {
    return null;
  }
  
  // Retorna com código do país +55
  return `+55${digits}`;
}

/**
 * Normaliza telefone para formato sem + (apenas dígitos com DDI)
 * Útil para APIs que não aceitam o sinal de +
 */
export function normalizeToDigitsOnly(brPhone: string): string | null {
  const e164 = normalizeToE164(brPhone);
  if (!e164) return null;
  return e164.replace('+', '');
}

/**
 * Formata telefone E.164 para exibição brasileira
 * @param e164Phone - Telefone no formato E.164
 * @returns Telefone formatado para exibição (XX) XXXXX-XXXX
 */
export function formatPhoneForDisplay(e164Phone: string): string {
  if (!e164Phone) return '';
  
  // Remove +55 e qualquer caractere não numérico
  let digits = e164Phone.replace(/\D/g, '');
  
  // Remove código do país 55 se existir
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2);
  }
  
  if (digits.length === 11) {
    // Celular: (XX) XXXXX-XXXX
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    // Fixo: (XX) XXXX-XXXX
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  
  return e164Phone;
}

/**
 * Valida se um telefone está no formato E.164 válido
 * @param phone - Telefone a ser validado
 * @returns true se válido, false caso contrário
 */
export function isValidE164(phone: string): boolean {
  if (!phone) return false;
  return /^\+55\d{10,11}$/.test(phone);
}
