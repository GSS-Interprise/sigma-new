-- Deletar TODAS as campanhas da tabela campanhas (e dependências em cascata)
DELETE FROM public.campanha_lead_touches WHERE campanha_lead_id IN (SELECT id FROM public.campanha_leads);
DELETE FROM public.campanha_leads;
DELETE FROM public.campanha_proposta_canais;
DELETE FROM public.campanha_proposta_lead_canais;
DELETE FROM public.campanha_propostas;
DELETE FROM public.campanhas_envios;
DELETE FROM public.campanhas;