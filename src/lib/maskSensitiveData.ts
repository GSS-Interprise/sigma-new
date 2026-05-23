/**
 * Mascaramento LGPD de dados pessoais sensíveis.
 *
 * Princípio: mostra mínimo necessário pra operadora reconhecer o dado
 * (ex: ver últimos dígitos do telefone basta pra identificar), esconde
 * o resto. Usuária pode revelar sob clique se precisar copiar/usar.
 *
 * Aplicado em cards do Kanban de Médicos e aba Dados do prontuário.
 */

/** `024.935.321-04` → `024.***.***-04` */
export function maskCPF(cpf: string | null | undefined): string {
  if (!cpf) return '';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf; // formato inválido — retorna como está
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}

/** `+5548999197899` → `+55 (48) ****-7899` (mantém DDI+DDD+últimos 4) */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return phone; // formato inválido — retorna como está

  // Brasileiro com DDI: +55 (48) ****-7899
  if (digits.length === 12 || digits.length === 13) {
    const ddi = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const last4 = digits.slice(-4);
    return `+${ddi} (${ddd}) ****-${last4}`;
  }
  // Brasileiro sem DDI: (48) ****-7899
  if (digits.length === 10 || digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const last4 = digits.slice(-4);
    return `(${ddd}) ****-${last4}`;
  }
  // Formato desconhecido: mostra só últimos 4
  return `****${digits.slice(-4)}`;
}

/** `medico@gmail.com` → `m***@gmail.com` */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at < 1) return email; // sem @ — não é email válido
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 1) return `${local}***${domain}`;
  return `${local[0]}***${domain}`;
}

/**
 * `R NEWTON RAMOS 70 AP 902 CENTRO FLORIANOPOLIS` → `R N*** RAMOS, FLORIANOPOLIS`
 * Tira número do imóvel, apartamento, bloco. Mantém só rua e cidade.
 */
export function maskAddress(address: string | null | undefined): string {
  if (!address) return '';
  // Heurística: separa por palavras, mantém primeira (tipo logradouro),
  // mascara nome da rua, mantém última (cidade)
  const parts = address
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '';
  if (parts.length <= 2) return parts.join(' ');

  const tipo = parts[0]; // "R", "AV", "RUA", etc.
  const cidade = parts[parts.length - 1];
  return `${tipo} *** , ${cidade}`;
}

/**
 * `01310-100` → mantém visível. CEP em si é menos sensível que endereço completo
 * (só identifica região, não casa). Retorna como veio.
 */
export function maskCEP(cep: string | null | undefined): string {
  return cep || '';
}

/**
 * Verifica se uma string contém algum dos campos sensíveis conhecidos.
 * Útil pra futuros checks de "esse texto deve ser mascarado?"
 */
export function isLikelySensitive(value: string): boolean {
  if (!value) return false;
  // CPF
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value)) return true;
  // CPF sem formatação
  if (/^\d{11}$/.test(value)) return true;
  // Telefone brasileiro com DDI
  if (/^\+55\d{10,11}$/.test(value)) return true;
  // Email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return true;
  return false;
}
