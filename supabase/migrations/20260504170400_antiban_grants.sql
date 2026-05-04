-- =====================================================================
-- Plano Aquecimento + Anti-Ban v1 — Sprint 1
-- GRANTs nas tabelas/sequencias/view novas pra service_role e authenticated
-- (necessário pq Supabase não auto-grant em CREATE TABLE)
-- =====================================================================

GRANT ALL ON public.chip_state        TO service_role, authenticated;
GRANT ALL ON public.chip_send_log     TO service_role, authenticated;
GRANT ALL ON public.chip_receive_log  TO service_role, authenticated;
GRANT ALL ON public.chip_health_event TO service_role, authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.chip_send_log_id_seq     TO service_role, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.chip_receive_log_id_seq  TO service_role, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.chip_health_event_id_seq TO service_role, authenticated;

GRANT SELECT ON public.vw_chip_health TO service_role, authenticated, anon;
