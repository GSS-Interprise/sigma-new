-- 1) Deletar a campanha de disparo ativa (CEPON) e seus contatos
DELETE FROM public.disparos_contatos WHERE campanha_id = '42ca501c-802d-4d97-9477-ff56690e49cc';
DELETE FROM public.disparos_campanhas WHERE id = '42ca501c-802d-4d97-9477-ff56690e49cc';

-- 2) Resetar lead "Ewerton rubi" para 'Novo' (desmarcar como contactado)
UPDATE public.leads SET status = 'Novo', updated_at = now() WHERE id = 'a01942e2-7b3e-4cd7-8c09-43fb6d66a308';

-- 3) Deletar a lista de disparo "chapecó todo brasil" e seus itens
DELETE FROM public.disparo_lista_itens WHERE lista_id = 'ee05b497-4343-44fa-aece-c0b5526e0879';
DELETE FROM public.disparo_listas WHERE id = 'ee05b497-4343-44fa-aece-c0b5526e0879';