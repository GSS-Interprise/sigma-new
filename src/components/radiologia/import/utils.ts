import { format } from "date-fns";
import type { LayoutVersion } from "./types";

// Mapa de SLA para horas (suporta múltiplos formatos, normalizado em uppercase)
export const SLA_HORAS_MAP: Record<string, number> = {
  // Formato CEPON
  'ATENDIMENTO AMBULATORIAL': 48,
  'INTERNADO': 4,
  'PRONTO SOCORRO': 2,
  'ALTA': 2,
  // Formato alternativo (outra planilha)
  'BAIXA': 48,
  // Variações
  'PS': 2,
  'AMBULATORIAL': 48,
  'INT': 4,
};

/**
 * Obtém as horas de SLA a partir do texto, com fallback
 */
export function getSlaHoras(slaTexto: string | undefined): { sla: string; horas: number } {
  if (!slaTexto) {
    return { sla: 'Internado', horas: 4 };
  }
  
  const normalized = slaTexto.toString().trim().toUpperCase();
  
  // Busca exata
  if (SLA_HORAS_MAP[normalized] !== undefined) {
    return { sla: slaTexto.toString().trim(), horas: SLA_HORAS_MAP[normalized] };
  }
  
  // Busca parcial
  for (const [key, value] of Object.entries(SLA_HORAS_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return { sla: slaTexto.toString().trim(), horas: value };
    }
  }
  
  // Default
  return { sla: slaTexto.toString().trim(), horas: 4 };
}

// Mapa de nivel_urgencia legado para SLA
export const NIVEL_URGENCIA_TO_SLA: Record<string, string> = {
  pronto_socorro: 'Pronto Socorro',
  internados: 'Internado',
  baixa: 'Atendimento Ambulatorial',
};

// Mapa de nivel_urgencia legado para horas
export const NIVEL_URGENCIA_HORAS: Record<string, number> = {
  pronto_socorro: 2,
  internados: 4,
  baixa: 48,
};

/**
 * Retorna sempre 'v2' - único layout suportado agora
 */
export function detectLayoutVersion(_headers: string[]): LayoutVersion {
  return 'v2';
}

/**
 * Normaliza headers da planilha para facilitar mapeamento
 */
export function normalizeHeaders(headers: string[]): Record<string, string> {
  const headerMap: Record<string, string> = {};
  
  headers.forEach((header, index) => {
    if (header) {
      // Remove espaços, underscores e converte para lowercase
      const normalized = header.toLowerCase().trim().replace(/[_\s]+/g, '');
      headerMap[normalized] = header;
    }
  });
  
  return headerMap;
}

/**
 * Parse de data do Excel (serial number ou string)
 */
export function parseExcelDate(serial: any): Date | null {
  if (!serial) return null;
  
  if (typeof serial === 'number') {
    // Excel serial number
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
  }
  
  if (typeof serial === 'string') {
    try {
      // Tenta MM/DD/YY
      const parts = serial.split('/');
      if (parts.length === 3) {
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        return new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
      }
      
      // Tenta ISO format
      const date = new Date(serial);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      return null;
    }
  }
  
  return null;
}

/**
 * Parse de hora do Excel (serial number ou string)
 */
export function parseExcelTime(serial: any): string | null {
  if (!serial) return null;
  
  if (typeof serial === 'number') {
    // Excel time serial (fraction of day)
    const totalSeconds = Math.round(serial * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  
  // Já é string
  return serial?.toString() || null;
}

/**
 * Combina data e hora em um timestamp ISO
 */
export function combineDateTime(date: Date | null, timeStr: string | null): Date {
  if (!date) return new Date();
  
  const result = new Date(date);
  
  if (timeStr) {
    const [hours, minutes, seconds] = timeStr.split(':');
    result.setHours(
      parseInt(hours) || 0,
      parseInt(minutes) || 0,
      parseInt(seconds || '0') || 0
    );
  }
  
  return result;
}

/**
 * Mapeia o campo "mod" do layout V2 para segmento
 */
export function mapModToSegmento(mod: string | undefined): string {
  if (!mod) return 'TC';
  
  const modUpper = mod.toUpperCase();
  
  if (modUpper.includes('CT')) return 'TC';
  if (modUpper.includes('MR')) return 'RM';
  if (modUpper.includes('US')) return 'US';
  if (modUpper.includes('RX') || modUpper.includes('CR') || modUpper.includes('DX')) return 'RX';
  if (modUpper.includes('MG') || modUpper.includes('MM')) return 'MM';
  
  return 'TC'; // default
}

/**
 * Normaliza status do layout V2
 * "Final" -> resolvida, qualquer outro -> aberta
 */
export function normalizeStatusV2(status: string | undefined): string {
  if (!status) return 'aberta';
  
  const statusLower = status.toLowerCase().trim();
  
  if (statusLower === 'final' || statusLower === 'finalizado' || statusLower === 'resolvido') {
    return 'resolvida';
  }
  
  return 'aberta';
}

/**
 * Calcula o prazo limite de SLA baseado na data de detecção e horas
 */
export function calcularPrazoSla(dataDeteccao: Date, slaHoras: number): Date {
  return new Date(dataDeteccao.getTime() + slaHoras * 60 * 60 * 1000);
}

/**
 * Formata data para referência (yyyy-MM-dd)
 */
export function formatDataReferencia(date: Date | null): string | null {
  if (!date) return null;
  return format(date, 'yyyy-MM-dd');
}

/**
 * Busca médico por nome com matching flexível
 */
export function findMedicoId(
  nomeMedico: string | undefined,
  medicoMap: Map<string, string>
): string | null {
  if (!nomeMedico) return null;
  
  const nomeBusca = nomeMedico.trim().toUpperCase();
  
  // Match exato
  if (medicoMap.has(nomeBusca)) {
    return medicoMap.get(nomeBusca)!;
  }
  
  // Match parcial - nome contém ou está contido
  for (const [key, value] of medicoMap.entries()) {
    if (key.includes(nomeBusca) || nomeBusca.includes(key)) {
      return value;
    }
  }
  
  // Match por primeiro e último nome
  const partes = nomeBusca.split(' ').filter(Boolean);
  if (partes.length >= 2) {
    const primeiroNome = partes[0];
    const ultimoNome = partes[partes.length - 1];
    
    for (const [key, value] of medicoMap.entries()) {
      const keyPartes = key.split(' ').filter(Boolean);
      if (keyPartes.length >= 2) {
        if (keyPartes[0] === primeiroNome && keyPartes[keyPartes.length - 1] === ultimoNome) {
          return value;
        }
      }
    }
  }
  
  return null;
}

/**
 * Cria mapa de médicos para busca rápida
 */
export function createMedicoMap(medicos: Array<{ id: string; nome_completo: string | null }>): Map<string, string> {
  const map = new Map<string, string>();
  
  medicos?.forEach(m => {
    const nomeKey = m.nome_completo?.trim().toUpperCase();
    if (nomeKey) {
      map.set(nomeKey, m.id);
    }
  });
  
  return map;
}
