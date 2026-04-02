import type { LayoutV2Row, PendenciaInsert } from "./types";
import {
  parseExcelDate,
  parseExcelTime,
  combineDateTime,
  formatDataReferencia,
  findMedicoId,
  mapModToSegmento,
  normalizeStatusV2,
  getSlaHoras,
} from "./utils";

interface ParseV2Options {
  clienteId: string;
  medicoMap: Map<string, string>;
  fileName: string;
  userId: string;
}

interface GroupedPatient {
  rows: Array<{ row: LayoutV2Row; linha: number }>;
}

/**
 * Normaliza os headers da planilha V2 para nomes de campo padronizados
 */
function normalizeV2Row(row: any): LayoutV2Row {
  const normalized: LayoutV2Row = {};
  
  for (const key of Object.keys(row)) {
    const keyLower = key.toLowerCase().replace(/[_\s]+/g, '');
    
    // Mapeamento de campos
    if (keyLower === 'dataentrada' || keyLower === 'data_entrada') {
      normalized.data_entrada = row[key];
    } else if (keyLower === 'nomepaciente' || keyLower === 'nome_paciente') {
      normalized.nome_paciente = row[key];
    } else if (keyLower === 'sla') {
      normalized.sla = row[key];
    } else if (keyLower === 'horaentrada' || keyLower === 'hora_entrada') {
      normalized.hora_entrada = row[key];
    } else if (keyLower === 'status') {
      normalized.status = row[key];
    } else if (keyLower === 'atribuido') {
      normalized.atribuido = row[key];
    } else if (keyLower === 'idpaciente' || keyLower === 'id_paciente') {
      normalized.id_paciente = row[key]?.toString();
    } else if (keyLower === 'codacesso' || keyLower === 'cod_acesso') {
      normalized.cod_acesso = row[key]?.toString();
    } else if (keyLower === 'description' || keyLower === 'descricao') {
      normalized.description = row[key];
    } else if (keyLower === 'mod' || keyLower === 'modalidade') {
      normalized.mod = row[key];
    } else if (keyLower === 'datafinal' || keyLower === 'data_final') {
      normalized.data_final = row[key];
    } else if (keyLower === 'medicofinalizador' || keyLower === 'medico_finalizador') {
      normalized.medico_finalizador = row[key];
    } else if (keyLower === 'datanascimento' || keyLower === 'data_nascimento') {
      normalized.data_nascimento = row[key];
    }
  }
  
  return normalized;
}

/**
 * Gera uma chave composta robusta para identificação única de registros
 * Combina múltiplos campos para evitar duplicatas mesmo com dados vazios
 */
function gerarChaveComposta(row: LayoutV2Row, dataEntrada: Date | null, horaEntrada: string | null, dataNascimento: Date | null, description: string): string {
  const partes = [
    row.cod_acesso?.toString() || '',
    row.id_paciente?.toString() || '',
    dataEntrada ? formatDataReferencia(dataEntrada) : '',
    horaEntrada || '',
    dataNascimento ? formatDataReferencia(dataNascimento) : '',
    description || ''
  ];
  
  return partes.join('_');
}

/**
 * Parser para o layout V2 (novo)
 * Colunas: data_entrada, nome_paciente, sla, hora_entrada, status, atribuido,
 * id_paciente, cod_acesso, description, mod, data_final, medico_finalizador, data_nascimento
 */
export function parseLayoutV2(
  jsonData: any[],
  options: ParseV2Options
): { pendencias: PendenciaInsert[]; erros: string[] } {
  const { clienteId, medicoMap, fileName, userId } = options;
  const pendencias: PendenciaInsert[] = [];
  const erros: string[] = [];

  // Normalizar todas as linhas
  const normalizedData = jsonData.map(row => normalizeV2Row(row));

  // Agrupar registros por paciente + data
  const registrosPorPaciente = new Map<string, GroupedPatient>();

  for (let i = 0; i < normalizedData.length; i++) {
    const row = normalizedData[i];
    const nomePaciente = row.nome_paciente?.toString() || '';
    
    // Validação mínima: precisa ter pelo menos nome do paciente ou algum identificador
    if (!nomePaciente && !row.id_paciente && !row.cod_acesso) {
      erros.push(`Linha ${i + 2}: Registro sem identificação (nome, id_paciente ou cod_acesso)`);
      continue;
    }

    // Parse de datas para a chave composta
    const dataEntrada = parseExcelDate(row.data_entrada);
    const horaEntrada = parseExcelTime(row.hora_entrada);
    const dataNascimento = parseExcelDate(row.data_nascimento);
    const description = row.description?.toString() || '';
    
    // Gerar chave composta robusta
    const chaveComposta = gerarChaveComposta(row, dataEntrada, horaEntrada, dataNascimento, description);

    if (!registrosPorPaciente.has(chaveComposta)) {
      registrosPorPaciente.set(chaveComposta, { rows: [] });
    }
    registrosPorPaciente.get(chaveComposta)!.rows.push({ row, linha: i + 2 });
  }

  // Processar cada grupo de paciente
  for (const [groupKey, group] of registrosPorPaciente) {
    try {
      const primeiroRegistro = group.rows[0].row;
      const idPaciente = primeiroRegistro.id_paciente || '';

      // Parse de datas
      const dataEntrada = parseExcelDate(primeiroRegistro.data_entrada);
      const horaEntrada = parseExcelTime(primeiroRegistro.hora_entrada);
      const dataNascimento = parseExcelDate(primeiroRegistro.data_nascimento);
      const dataFinal = parseExcelDate(primeiroRegistro.data_final);

      // Combinar data e hora
      const dataDeteccaoFinal = combineDateTime(dataEntrada, horaEntrada);

      // Buscar médico atribuído
      const medicoAtribuidoNome = primeiroRegistro.atribuido?.toString();
      const medicoAtribuidoId = findMedicoId(medicoAtribuidoNome, medicoMap);

      // Buscar médico finalizador
      const medicoFinalizadorNome = primeiroRegistro.medico_finalizador?.toString();
      const medicoFinalizadorId = findMedicoId(medicoFinalizadorNome, medicoMap);

      // SLA - usa função que suporta ambos os formatos
      const { sla: slaTexto, horas: slaHoras } = getSlaHoras(primeiroRegistro.sla);

      // Status normalizado
      const statusPendencia = normalizeStatusV2(primeiroRegistro.status);

      // Segmento (mod -> segmento)
      const segmento = mapModToSegmento(primeiroRegistro.mod);

      // Agregar exames do grupo
      const listaExames = group.rows
        .map(r => r.row.description?.toString())
        .filter(Boolean);
      const descricaoInicial = listaExames.length > 1
        ? `${listaExames.length} exame(s): ${listaExames.join(', ')}`
        : listaExames[0] || '';

      // Calcular prazo SLA
      const prazoLimiteSla = new Date(dataDeteccaoFinal.getTime() + slaHoras * 60 * 60 * 1000);

      // Código de acesso - usar chave composta robusta
      const codAcessos = group.rows.map(r => r.row.cod_acesso).filter(Boolean);
      const codAcessoOriginal = codAcessos[0] || '';
      // Usar a chave composta como cod_acesso para garantir unicidade
      const codAcesso = gerarChaveComposta(primeiroRegistro, dataEntrada, horaEntrada, dataNascimento, listaExames[0] || '');

      const pendencia: PendenciaInsert = {
        cliente_id: clienteId,
        medico_id: medicoAtribuidoId, // No V2, médico principal = atribuído
        medico_atribuido_id: medicoAtribuidoId,
        medico_atribuido_nome: medicoAtribuidoNome === 'NOT ASSIGNED' ? null : (medicoAtribuidoNome || null),
        tipo_registro: null, // Deprecated no V2
        // Sanitiza nome do paciente removendo parênteses soltos e espaços extras
        nome_paciente: (primeiroRegistro.nome_paciente || '').replace(/[()]/g, '').trim(),
        id_paciente: idPaciente,
        data_nascimento: dataNascimento ? formatDataReferencia(dataNascimento) : null,
        segmento,
        nivel_urgencia: null, // Deprecated no V2
        sla: slaTexto,
        sla_horas: slaHoras,
        descricao_inicial: descricaoInicial,
        exame: listaExames.join(', '),
        quantidade_pendente: group.rows.length,
        data_deteccao: dataDeteccaoFinal.toISOString(),
        data_referencia: formatDataReferencia(dataEntrada),
        status_pendencia: statusPendencia,
        prazo_limite_sla: prazoLimiteSla.toISOString(),
        cod_acesso: codAcesso || null,
        acesso: codAcesso || null, // Manter compatibilidade
        arquivo_importacao: fileName,
        data_importacao: new Date().toISOString(),
        importado_por: userId,
        layout_versao: 'v2',
        data_final: dataFinal ? dataFinal.toISOString() : null,
        medico_finalizador_id: medicoFinalizadorId,
      };

      pendencias.push(pendencia);
    } catch (error: any) {
      erros.push(`Grupo ${groupKey}: ${error.message}`);
    }
  }

  return { pendencias, erros };
}
