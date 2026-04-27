-- The import-leads-excel Edge Function uses the service_role database role internally.
-- These grants are required before RLS bypass/elevated processing can write dispatch lists.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.disparo_listas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.disparo_lista_itens TO service_role;