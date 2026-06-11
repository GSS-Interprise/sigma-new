-- Kanban manual (pedido equipe 11/06): campanhas manuais ganham estágios de
-- entrada próprios — Pendentes → Aguardando resposta → Aquecido — antes do
-- funil de triagem (Em análise/Aprovado/Na escala), que segue igual.
--
-- Esses 3 estágios derivam do campanha_leads.status (frio/contatado/em_conversa),
-- não da etapa_acompanhamento. A view de kanban filtrava etapa IS NOT NULL, então
-- leads manuais em estágio inicial nunca apareciam. Aqui:
--   1. _full expõe tipo_envio (front sabe se a campanha é manual).
--   2. a view de kanban inclui leads manuais em estágio inicial (etapa nula),
--      mantendo TODO lead IA exatamente como antes (aditivo, sem regressão).

CREATE OR REPLACE VIEW vw_acompanhamento_kanban_full AS
SELECT cl.id AS campanha_lead_id,
    cl.campanha_id,
    cl.lead_id,
    cl.etapa_acompanhamento,
    cl.status,
    cl.assumido_por,
    cl.assumido_em,
    cl.validacoes,
    cl.resultado_final,
    cl.motivo_perdido,
    cl.data_primeiro_contato,
    cl.data_ultimo_contato,
    cl.data_status,
    cl.updated_at,
    cl.humano_assumiu,
    jsonb_array_length(COALESCE(cl.historico_conversa, '[]'::jsonb)) AS msgs_total,
    _prospeccao_validacoes_ok(COALESCE(cl.validacoes, '{}'::jsonb)) AS validacoes_ok,
    l.nome AS lead_nome,
    l.phone_e164 AS lead_phone,
    l.especialidade AS lead_especialidade,
    l.cidade AS lead_cidade,
    l.uf AS lead_uf,
    l.classificacao AS lead_classificacao,
    l.opt_out AS lead_opt_out,
    c.nome AS campanha_nome,
    c.briefing_ia ->> 'handoff_nome'::text AS handoff_nome,
    c.briefing_ia ->> 'nome_servico'::text AS servico,
    c.briefing_ia ->> 'cidade'::text AS servico_cidade,
    p.nome_completo AS assumido_por_nome,
    p.email AS assumido_por_email,
    bi.observacoes_ia AS perfil_resumo,
    bi.modalidade_preferida AS perfil_modalidade,
    bi.valor_minimo_aceitavel AS perfil_valor_min,
    bi.confianca_score AS perfil_confianca,
    c.tipo_envio AS tipo_envio
   FROM campanha_leads cl
     JOIN leads l ON l.id = cl.lead_id
     JOIN campanhas c ON c.id = cl.campanha_id
     LEFT JOIN profiles p ON p.id = cl.assumido_por
     LEFT JOIN banco_interesse_leads bi ON bi.lead_id = cl.lead_id;

CREATE OR REPLACE VIEW vw_acompanhamento_kanban AS
SELECT campanha_lead_id,
    campanha_id,
    lead_id,
    etapa_acompanhamento,
    status,
    assumido_por,
    assumido_em,
    validacoes,
    resultado_final,
    motivo_perdido,
    data_primeiro_contato,
    data_ultimo_contato,
    data_status,
    updated_at,
    humano_assumiu,
    msgs_total,
    validacoes_ok,
    lead_nome,
    lead_phone,
    lead_especialidade,
    lead_cidade,
    lead_uf,
    lead_classificacao,
    lead_opt_out,
    campanha_nome,
    handoff_nome,
    servico,
    servico_cidade,
    assumido_por_nome,
    assumido_por_email,
    perfil_resumo,
    perfil_modalidade,
    perfil_valor_min,
    perfil_confianca,
    tipo_envio
   FROM vw_acompanhamento_kanban_full
  WHERE etapa_acompanhamento IS NOT NULL
     -- manual: mostra também os estágios de entrada (etapa ainda nula)
     OR (tipo_envio = 'manual' AND status IN ('frio','contatado','sem_resposta','em_conversa','quente'));
