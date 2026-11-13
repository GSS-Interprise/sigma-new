-- Fase 9.3: achar LinkedIn e Instagram do médico (busca na web pelo Gemini + conferência pela Unipile quando houver
-- conta conectada). Só grava linkedin_url / instagram_handle com confiança >= 70; abaixo disso fica o candidato em
-- redes_candidatos para a equipe confirmar.
alter table public.leads add column if not exists instagram_confianca int;
alter table public.leads add column if not exists redes_buscado_em timestamptz;
alter table public.leads add column if not exists redes_candidatos jsonb;
