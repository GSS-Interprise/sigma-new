// Tipos para importação de pendências de radiologia (V2)

export interface LayoutV2Row {
  data_entrada?: string | number;
  nome_paciente?: string;
  sla?: string;
  hora_entrada?: string | number;
  status?: string;
  atribuido?: string;
  id_paciente?: string;
  cod_acesso?: string;
  description?: string;
  mod?: string;
  data_final?: string | number;
  medico_finalizador?: string;
  data_nascimento?: string | number;
}

export interface PendenciaInsert {
  cliente_id: string;
  medico_id: string | null;
  medico_atribuido_id: string | null;
  medico_atribuido_nome: string | null;
  tipo_registro: string | null;
  nome_paciente: string;
  id_paciente: string;
  data_nascimento: string | null;
  segmento: string;
  nivel_urgencia: string | null;
  sla: string | null;
  sla_horas: number | null;
  descricao_inicial: string;
  exame: string;
  quantidade_pendente: number;
  data_deteccao: string;
  data_referencia: string | null;
  status_pendencia: string;
  prazo_limite_sla: string;
  cod_acesso: string | null;
  acesso: string | null;
  arquivo_importacao: string;
  data_importacao: string;
  importado_por: string;
  layout_versao: 'v2';
  data_final?: string | null;
  medico_finalizador_id?: string | null;
}

export interface ImportResult {
  total: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: number; // Registros finalizados que não foram atualizados
  erros: number;
  detalhes: string[];
}

export type LayoutVersion = 'v2';
