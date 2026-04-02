import { toZonedTime } from "date-fns-tz";

const TIMEZONE = "America/Sao_Paulo";

/**
 * Converte uma data UTC para o timezone de São Paulo
 * Retorna data atual se a entrada for inválida (evita crashes)
 */
export function toLocalTime(date: string | Date | null | undefined): Date {
  if (!date) return new Date();
  
  try {
    const parsed = typeof date === 'string' ? new Date(date) : date;
    
    // Verifica se a data é válida
    if (isNaN(parsed.getTime())) {
      console.warn('toLocalTime: Data inválida recebida:', date);
      return new Date();
    }
    
    return toZonedTime(parsed, TIMEZONE);
  } catch (error) {
    console.warn('toLocalTime: Erro ao converter data:', date, error);
    return new Date();
  }
}

/**
 * Parseia uma data no formato YYYY-MM-DD como data LOCAL (sem conversão de timezone)
 * Evita o problema de "um dia a menos" que ocorre com new Date("YYYY-MM-DD")
 */
export function parseLocalDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  
  // Se for string no formato YYYY-MM-DD, parseia manualmente
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    const [datePart] = dateString.split('T'); // Remove a parte de hora se existir
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day); // month é 0-indexed
  }
  
  return new Date(dateString);
}

/**
 * Formata uma data para string YYYY-MM-DD (sem problemas de timezone)
 */
export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parseia data de nascimento de múltiplos formatos para YYYY-MM-DD
 * Suporta formatos brasileiros (DD/MM/YYYY, DD-MM-YYYY) e ISO (YYYY-MM-DD)
 * Ignora horário - retorna apenas a data
 */
export function parseBirthDate(dateString: string | null | undefined): string | null {
  if (!dateString || typeof dateString !== 'string') return null;
  
  // Remove espaços e horário se existir
  const cleanDate = dateString.trim().split(/[\sT]/)[0];
  
  // Formato brasileiro: DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = cleanDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    
    // Valida se a data é válida
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2100) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }
  
  // Formato ISO: YYYY-MM-DD
  const isoMatch = cleanDate.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    
    // Valida se a data é válida
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2100) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }
  
  return null;
}
