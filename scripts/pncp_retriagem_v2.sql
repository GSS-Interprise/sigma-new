-- =====================================================================
-- Re-triagem com o classificador corrigido (pncp_score_gss_v2).
--
-- A fila atual foi montada pelo scorer antigo, que tinha os 3 bugs de
-- acento/stemmer: 82% do que ele aprovou e' Inexigibilidade vencida e o
-- recall contra a Effecti era 7,8%. Reaproveitar essa fila entregaria a
-- lista errada para a equipe.
--
-- NAO TOCA em decisao humana (humano_aprovado/humano_rejeitado/promovido):
-- se alguem ja olhou, a decisao vale mais que o score.
-- =====================================================================

-- 1. re-pontua o que ainda esta em estado automatico
update pncp_triagem t
   set score  = m.score_gss,
       status = case when m.score_gss >= 5 then 'auto_aprovado'
                     when m.score_gss >= 3 then 'pendente_humano'
                     else 'auto_rejeitado' end
  from pncp_mirror m
 where m.numero_controle_pncp = t.numero_controle_pncp
   and t.perfil_slug = 'gss-saude'
   and t.status in ('auto_aprovado','auto_rejeitado','pendente_humano')
   and t.promovido_licitacao_id is null
   and t.score is distinct from m.score_gss;

-- 2. traz para a fila os candidatos que o scorer novo enxerga e o antigo
--    nao enxergava. So' o que a equipe consegue disputar: modalidade que
--    nao seja Inexigibilidade (9 = contratacao direta ja decidida) e com
--    proposta ainda aberta.
insert into pncp_triagem (numero_controle_pncp, perfil_slug, score, status)
select m.numero_controle_pncp, 'gss-saude', m.score_gss,
       case when m.score_gss >= 5 then 'auto_aprovado' else 'pendente_humano' end
  from pncp_mirror m
 where m.score_gss >= 3
   and m.modalidade_id <> 9
   and m.data_encerramento_proposta > now()
   and not exists (select 1 from pncp_triagem t
                    where t.numero_controle_pncp = m.numero_controle_pncp
                      and t.perfil_slug = 'gss-saude')
on conflict do nothing;
