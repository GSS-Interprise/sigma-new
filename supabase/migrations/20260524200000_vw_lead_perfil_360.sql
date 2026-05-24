-- F2.9 — view vw_lead_perfil_360 agregando contexto do lead pra "perfil 360º"
-- Usado pelo card de identidade no painel do Acompanhamento. Inclui:
-- - dados básicos (nome, especialidade, classificação LGPD, opt-out, cooldown)
-- - quantas campanhas o lead participa (ativas/pausadas + total)
-- - status de conversão (já foi convertido alguma vez?)
-- - se está em blacklist
-- - última atividade no SigZap

CREATE OR REPLACE VIEW public.vw_lead_perfil_360 AS
SELECT
  l.id AS lead_id,
  l.nome,
  l.phone_e164,
  l.cpf,
  l.crm,
  l.cidade,
  l.uf,
  l.classificacao,
  l.cooldown_ate,
  l.opt_out,
  l.tags,
  l.created_at AS lead_criado_em,
  l.data_conversao,
  l.convertido_por,
  -- Campanhas
  (SELECT COUNT(*) FROM public.campanha_leads cl
    WHERE cl.lead_id = l.id) AS total_campanhas,
  (SELECT COUNT(*) FROM public.campanha_leads cl
    JOIN public.campanhas c ON c.id = cl.campanha_id
    WHERE cl.lead_id = l.id AND c.status IN ('ativa', 'pausada')) AS campanhas_ativas,
  (SELECT COUNT(*) FROM public.campanha_leads cl
    WHERE cl.lead_id = l.id AND cl.status = 'convertido') AS vezes_convertido,
  (SELECT COUNT(*) FROM public.campanha_leads cl
    WHERE cl.lead_id = l.id AND cl.etapa_acompanhamento = 'quente') AS vezes_quente,
  (SELECT COUNT(*) FROM public.campanha_leads cl
    WHERE cl.lead_id = l.id AND cl.etapa_acompanhamento = 'perdido') AS vezes_perdido,
  -- Blacklist
  EXISTS (SELECT 1 FROM public.blacklist bl
    WHERE bl.phone_e164 = l.phone_e164) AS em_blacklist,
  -- SigZap
  (SELECT MAX(conv.last_message_at) FROM public.sigzap_conversations conv
    WHERE conv.lead_id = l.id) AS ultima_msg_sigzap
FROM public.leads l
WHERE l.merged_into_id IS NULL;

GRANT SELECT ON public.vw_lead_perfil_360 TO authenticated, service_role;

COMMENT ON VIEW public.vw_lead_perfil_360 IS
  'F2.9 — Perfil 360 do lead. Agrega contexto cross-campanha + status LGPD + atividade SigZap. Consumido pelo LeadIdentidadeCard.';
