-- Fix (06/07): sigma_email_log estava sem GRANT + RLS on → inserts via PostgREST
-- (service_role, ex.: edges de email) falhavam silenciosamente. As edges logam via
-- service_role (bypassa RLS, mas precisa do GRANT de tabela). Corrige o gotcha.
grant select, insert on public.sigma_email_log to service_role, authenticated;
