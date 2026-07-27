-- A estratégia é contexto do vínculo campanha-lead, não uma tag global do médico.
-- Expor o nome nas views mantém a UI consistente sem duplicar dados em leads.tags.
CREATE OR REPLACE VIEW public.vw_acompanhamento_kanban_full AS
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
    public._prospeccao_validacoes_ok(COALESCE(cl.validacoes, '{}'::jsonb)) AS validacoes_ok,
    l.nome AS lead_nome,
    l.phone_e164 AS lead_phone,
    l.especialidade AS lead_especialidade,
    l.cidade AS lead_cidade,
    l.uf AS lead_uf,
    l.classificacao AS lead_classificacao,
    l.opt_out AS lead_opt_out,
    c.nome AS campanha_nome,
    c.briefing_ia ->> 'handoff_nome' AS handoff_nome,
    c.briefing_ia ->> 'nome_servico' AS servico,
    c.briefing_ia ->> 'cidade' AS servico_cidade,
    p.nome_completo AS assumido_por_nome,
    p.email AS assumido_por_email,
    bi.observacoes_ia AS perfil_resumo,
    bi.modalidade_preferida AS perfil_modalidade,
    bi.valor_minimo_aceitavel AS perfil_valor_min,
    bi.confianca_score AS perfil_confianca,
    c.tipo_envio AS tipo_envio,
    cl.strategy_id,
    s.nome AS strategy_name,
    s.status AS strategy_status
FROM public.campanha_leads cl
JOIN public.leads l ON l.id = cl.lead_id
JOIN public.campanhas c ON c.id = cl.campanha_id
LEFT JOIN public.campaign_strategies s ON s.id = cl.strategy_id
LEFT JOIN public.profiles p ON p.id = cl.assumido_por
LEFT JOIN public.banco_interesse_leads bi ON bi.lead_id = cl.lead_id;

CREATE OR REPLACE VIEW public.vw_acompanhamento_kanban AS
SELECT *
FROM public.vw_acompanhamento_kanban_full
WHERE etapa_acompanhamento IS NOT NULL
   OR (
     tipo_envio = 'manual'
     AND status IN ('frio', 'contatado', 'sem_resposta', 'em_conversa', 'quente')
   );

GRANT SELECT ON public.vw_acompanhamento_kanban_full TO authenticated, service_role;
GRANT SELECT ON public.vw_acompanhamento_kanban TO authenticated, service_role;
