-- The claim RPC is SECURITY DEFINER, but completion/failure updates are made
-- directly by Edge Functions using service_role.

GRANT SELECT, UPDATE ON public.campanha_ia_processed_messages TO service_role;

COMMENT ON TABLE public.campanha_ia_processed_messages IS
  'Idempotency ledger. service_role may read and finalize claimed AI messages.';
