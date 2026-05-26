-- Fix: operadoras não-admin recebiam "new row violates RLS policy for table campanhas_history"
-- ao criar/editar campanhas.
--
-- Causa: trigger AFTER INSERT/UPDATE/DELETE em campanhas chama trg_campanhas_log_history()
-- que insere em campanhas_history. A tabela tem RLS ativo mas só tem policy de SELECT —
-- não há policy de INSERT. Como o trigger roda no contexto da operadora (authenticated),
-- o INSERT no history era rejeitado e abortava a transação inteira.
--
-- Fix: marcar a função como SECURITY DEFINER. Trigger passa a rodar como owner (postgres),
-- bypassando RLS na escrita do history. Operadora continua sem conseguir escrever
-- diretamente em campanhas_history — só via trigger oficial.

ALTER FUNCTION public.trg_campanhas_log_history() SECURITY DEFINER;
