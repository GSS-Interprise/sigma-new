-- =====================================================================
-- Mantem pncp_mirror.score_gss vivo.
--
-- Sem isto o score so' existe para as 491k linhas do backfill: toda linha
-- nova do pncp-mirror-sync entraria com score NULL e sumiria da triagem e
-- da aba comparativa - a tela envelheceria em silencio, que e' exatamente
-- o modo de falha que ja nos custou dias nesta frente.
--
-- BEFORE INSERT OR UPDATE: o upsert do sync reescreve objeto_compra, entao
-- o score precisa reagir a UPDATE tambem, nao so' a INSERT.
-- =====================================================================

create or replace function pncp_score_gss_trg()
returns trigger language plpgsql as $$
begin
  new.score_gss := pncp_score_gss_v2(new.objeto_compra);
  return new;
end $$;

drop trigger if exists trg_pncp_score_gss on pncp_mirror;
create trigger trg_pncp_score_gss
  before insert or update of objeto_compra on pncp_mirror
  for each row execute function pncp_score_gss_trg();
