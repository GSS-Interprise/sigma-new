-- Motor Hermes (27/11/2026): token do robô de IA da VPS. Origem 'hermes' só é gravável pelo service role (igual à
-- 'bateria'); no sigma-mcp esse token vê só as ferramentas da fila ia_trabalho, nenhum domínio dos sócios.
alter table public.mcp_tokens drop constraint if exists mcp_tokens_origem_ck;
alter table public.mcp_tokens add constraint mcp_tokens_origem_ck check (origem = any (array['manual', 'oauth', 'bateria', 'hermes']));
