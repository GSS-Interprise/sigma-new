import { supabase } from "@/integrations/supabase/client";

export type TipoEventoAgesLead = 
  | 'lead_criado'
  | 'lead_editado'
  | 'status_alterado'
  | 'convertido_profissional'
  | 'enviado_acompanhamento'
  | 'documento_anexado'
  | 'documento_removido'
  | 'contato_telefonico'
  | 'email_enviado'
  | 'aprovacao_alterada';

async function getUserInfo() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, userName: 'Sistema' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('nome_completo')
    .eq('id', user.id)
    .single();

  return {
    userId: user.id,
    userName: profile?.nome_completo || 'Usuário',
  };
}

export async function registrarCriacaoAgesLead(leadId: string, nome: string) {
  const { userId, userName } = await getUserInfo();

  await supabase.from('ages_lead_historico').insert({
    lead_id: leadId,
    tipo_evento: 'lead_criado',
    descricao_resumida: `Lead "${nome}" criado`,
    usuario_id: userId,
    usuario_nome: userName,
  });
}

export async function registrarEdicaoAgesLead(
  leadId: string,
  dadosAnteriores: Record<string, any>,
  dadosNovos: Record<string, any>,
  camposAlterados: string[]
) {
  const { userId, userName } = await getUserInfo();

  const camposFormatados = camposAlterados.slice(0, 3).join(', ');
  const descricao = `Lead editado. Campos: ${camposFormatados}${camposAlterados.length > 3 ? '...' : ''}`;

  await supabase.from('ages_lead_historico').insert({
    lead_id: leadId,
    tipo_evento: 'lead_editado',
    descricao_resumida: descricao,
    dados_anteriores: dadosAnteriores,
    dados_novos: dadosNovos,
    campos_alterados: camposAlterados,
    usuario_id: userId,
    usuario_nome: userName,
  });
}

export async function registrarAlteracaoStatusAgesLead(
  leadId: string,
  statusAnterior: string,
  statusNovo: string
) {
  const { userId, userName } = await getUserInfo();

  await supabase.from('ages_lead_historico').insert({
    lead_id: leadId,
    tipo_evento: 'status_alterado',
    descricao_resumida: `Status alterado de "${statusAnterior}" para "${statusNovo}"`,
    dados_anteriores: { status: statusAnterior },
    dados_novos: { status: statusNovo },
    campos_alterados: ['status'],
    usuario_id: userId,
    usuario_nome: userName,
  });
}

export async function registrarConversaoProfissional(leadId: string, profissionalNome: string) {
  const { userId, userName } = await getUserInfo();

  await supabase.from('ages_lead_historico').insert({
    lead_id: leadId,
    tipo_evento: 'convertido_profissional',
    descricao_resumida: `Lead convertido em profissional: ${profissionalNome}`,
    usuario_id: userId,
    usuario_nome: userName,
  });
}

export async function registrarEnvioAcompanhamento(leadId: string, colunaDestino: string) {
  const { userId, userName } = await getUserInfo();

  await supabase.from('ages_lead_historico').insert({
    lead_id: leadId,
    tipo_evento: 'enviado_acompanhamento',
    descricao_resumida: `Lead enviado para acompanhamento: ${colunaDestino}`,
    usuario_id: userId,
    usuario_nome: userName,
  });
}
