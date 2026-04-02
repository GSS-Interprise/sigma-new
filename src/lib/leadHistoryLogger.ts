import { supabase } from "@/integrations/supabase/client";

export type TipoEventoLead = 
  | 'disparo_email' 
  | 'disparo_zap' 
  | 'proposta_enviada' 
  | 'proposta_aceita' 
  | 'proposta_recusada' 
  | 'convertido_em_medico' 
  | 'desconvertido_para_lead'
  | 'reprocessado_kanban'
  | 'atendimento'
  | 'contato_telefonico'
  | 'reuniao_agendada'
  | 'documentacao_solicitada'
  | 'documentacao_recebida'
  | 'status_alterado'
  | 'enviado_acompanhamento'
  | 'lead_criado'
  | 'lead_editado'
  | 'lead_qualificado'
  | 'em_resposta'
  | 'lead_descartado'
  | 'outro';

interface LeadHistoryParams {
  leadId: string;
  tipoEvento: TipoEventoLead;
  descricaoResumida: string;
  propostaId?: string | null;
  servicoId?: string | null;
  contratoId?: string | null;
  licitacaoId?: string | null;
  medicoId?: string | null;
  disparoLogId?: string | null;
  disparoProgramadoId?: string | null;
  metadados?: Record<string, any> | null;
}

interface UserInfo {
  userId: string | null;
  userName: string;
  userEmail: string | null;
}

/**
 * Get current authenticated user info
 */
async function getCurrentUserInfo(): Promise<UserInfo> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { userId: null, userName: 'Sistema', userEmail: null };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('nome_completo, email')
    .eq('id', user.id)
    .single();

  return {
    userId: user.id,
    userName: profile?.nome_completo || user.email || 'Usuário',
    userEmail: profile?.email || user.email || null,
  };
}

/**
 * Registra um evento no histórico do lead
 * Centraliza toda a lógica de auditoria/rastreamento de leads
 */
export async function registrarHistoricoLead(params: LeadHistoryParams): Promise<void> {
  try {
    const userInfo = await getCurrentUserInfo();

    const { error } = await supabase
      .from('lead_historico')
      .insert({
        lead_id: params.leadId,
        tipo_evento: params.tipoEvento,
        descricao_resumida: params.descricaoResumida,
        usuario_id: userInfo.userId,
        usuario_nome: userInfo.userName,
        proposta_id: params.propostaId || null,
        servico_id: params.servicoId || null,
        contrato_id: params.contratoId || null,
        licitacao_id: params.licitacaoId || null,
        medico_id: params.medicoId || null,
        disparo_log_id: params.disparoLogId || null,
        disparo_programado_id: params.disparoProgramadoId || null,
        metadados: {
          ...params.metadados,
          user_email: userInfo.userEmail,
          timestamp: new Date().toISOString(),
        },
      });

    if (error) {
      console.error('Erro ao registrar histórico do lead:', error);
    }
  } catch (error) {
    console.error('Erro ao registrar histórico do lead:', error);
  }
}

/**
 * Atualiza o status do lead e registra no histórico
 */
export async function atualizarStatusLead(
  leadId: string, 
  novoStatus: string,
  statusAntigo?: string,
  tipoEventoOverride?: TipoEventoLead
): Promise<boolean> {
  try {
    const userInfo = await getCurrentUserInfo();

    // Atualizar o status do lead
    const { error: updateError } = await supabase
      .from('leads')
      .update({ 
        status: novoStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    if (updateError) {
      console.error('Erro ao atualizar status do lead:', updateError);
      return false;
    }

    // Determinar o tipo de evento baseado no status
    let tipoEvento: TipoEventoLead = tipoEventoOverride || 'status_alterado';
    
    if (!tipoEventoOverride) {
      switch (novoStatus) {
        case 'Acompanhamento':
          tipoEvento = 'enviado_acompanhamento';
          break;
        case 'Qualificado':
          tipoEvento = 'lead_qualificado';
          break;
        case 'Em Resposta':
          tipoEvento = 'em_resposta';
          break;
        case 'Proposta Enviada':
          tipoEvento = 'proposta_enviada';
          break;
        case 'Proposta Aceita':
          tipoEvento = 'proposta_aceita';
          break;
        case 'Proposta Recusada':
          tipoEvento = 'proposta_recusada';
          break;
        case 'Convertido':
          tipoEvento = 'convertido_em_medico';
          break;
        case 'Descartado':
          tipoEvento = 'lead_descartado';
          break;
      }
    }

    // Registrar no histórico
    await registrarHistoricoLead({
      leadId,
      tipoEvento,
      descricaoResumida: `Status alterado${statusAntigo ? ` de "${statusAntigo}"` : ''} para "${novoStatus}" por ${userInfo.userName}`,
      metadados: {
        status_antigo: statusAntigo,
        status_novo: novoStatus,
        alterado_por: userInfo.userName,
        alterado_por_email: userInfo.userEmail,
      }
    });

    return true;
  } catch (error) {
    console.error('Erro ao atualizar status do lead:', error);
    return false;
  }
}

/**
 * Registra criação de lead
 */
export async function registrarCriacaoLead(
  leadId: string,
  dadosLead: Record<string, any>
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'lead_criado',
    descricaoResumida: `Lead "${dadosLead.nome}" criado por ${userInfo.userName}`,
    metadados: {
      dados_lead: dadosLead,
    }
  });
}

/**
 * Registra edição de lead
 */
export async function registrarEdicaoLead(
  leadId: string,
  dadosAntigos: Record<string, any>,
  dadosNovos: Record<string, any>,
  camposAlterados: string[]
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'lead_editado',
    descricaoResumida: `Lead editado por ${userInfo.userName}. Campos: ${camposAlterados.join(', ')}`,
    metadados: {
      dados_antigos: dadosAntigos,
      dados_novos: dadosNovos,
      campos_alterados: camposAlterados,
    }
  });
}

/**
 * Registra conversão em médico
 */
export async function registrarConversaoMedico(
  leadId: string,
  medicoId: string,
  dadosConversao?: Record<string, any>
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'convertido_em_medico',
    descricaoResumida: `Lead convertido em médico por ${userInfo.userName}`,
    medicoId,
    metadados: {
      medico_id: medicoId,
      dados_conversao: dadosConversao,
    }
  });
}

/**
 * Registra envio de proposta
 */
export async function registrarPropostaEnviada(
  leadId: string,
  propostaId: string,
  servicoId?: string,
  contratoId?: string,
  detalhes?: Record<string, any>
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'proposta_enviada',
    descricaoResumida: `Proposta enviada por ${userInfo.userName}`,
    propostaId,
    servicoId,
    contratoId,
    metadados: detalhes,
  });
}

/**
 * Registra disparo de email
 */
export async function registrarDisparoEmail(
  leadId: string,
  disparoLogId?: string,
  disparoProgramadoId?: string,
  detalhes?: Record<string, any>
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'disparo_email',
    descricaoResumida: `Email enviado por ${userInfo.userName}`,
    disparoLogId,
    disparoProgramadoId,
    metadados: detalhes,
  });
}

/**
 * Registra disparo de WhatsApp
 */
export async function registrarDisparoZap(
  leadId: string,
  disparoLogId?: string,
  disparoProgramadoId?: string,
  detalhes?: Record<string, any>
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'disparo_zap',
    descricaoResumida: `WhatsApp enviado por ${userInfo.userName}`,
    disparoLogId,
    disparoProgramadoId,
    metadados: detalhes,
  });
}

/**
 * Registra contato telefônico
 */
export async function registrarContatoTelefonico(
  leadId: string,
  observacoes?: string
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'contato_telefonico',
    descricaoResumida: `Contato telefônico realizado por ${userInfo.userName}`,
    metadados: { observacoes },
  });
}

/**
 * Registra reunião agendada
 */
export async function registrarReuniaoAgendada(
  leadId: string,
  dataReuniao: string,
  observacoes?: string
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'reuniao_agendada',
    descricaoResumida: `Reunião agendada para ${dataReuniao} por ${userInfo.userName}`,
    metadados: { data_reuniao: dataReuniao, observacoes },
  });
}

/**
 * Registra solicitação de documentação
 */
export async function registrarDocumentacaoSolicitada(
  leadId: string,
  documentos: string[],
  observacoes?: string
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'documentacao_solicitada',
    descricaoResumida: `Documentação solicitada por ${userInfo.userName}`,
    metadados: { documentos, observacoes },
  });
}

/**
 * Registra recebimento de documentação
 */
export async function registrarDocumentacaoRecebida(
  leadId: string,
  documentos: string[],
  observacoes?: string
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'documentacao_recebida',
    descricaoResumida: `Documentação recebida por ${userInfo.userName}`,
    metadados: { documentos, observacoes },
  });
}

/**
 * Registra desconversão de médico para lead
 */
export async function registrarDesconversaoParaLead(
  leadId: string,
  medicoId: string,
  motivo: string
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'desconvertido_para_lead',
    descricaoResumida: `Médico desconvertido para Lead por ${userInfo.userName}. Motivo: ${motivo}`,
    medicoId,
    metadados: {
      motivo_desconversao: motivo,
      desconvertido_por: userInfo.userName,
      desconvertido_por_email: userInfo.userEmail,
    }
  });
}

/**
 * Registra reprocessamento de médico no Kanban (novo contrato/processo)
 */
export async function registrarReprocessamentoKanban(
  leadId: string,
  medicoId: string,
  motivo: string
): Promise<void> {
  const userInfo = await getCurrentUserInfo();
  
  await registrarHistoricoLead({
    leadId,
    tipoEvento: 'reprocessado_kanban',
    descricaoResumida: `Médico reprocessado no Kanban por ${userInfo.userName}. Motivo: ${motivo}`,
    medicoId,
    metadados: {
      motivo_reprocessamento: motivo,
      reprocessado_por: userInfo.userName,
      reprocessado_por_email: userInfo.userEmail,
    }
  });
}
