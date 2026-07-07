-- Push no celular SÓ pras mensagens de canal (comunicacao_notificacoes). As notificações
-- do sistema (kanban, licitações, financeiro, documentos, etc.) NÃO disparam push, pra não
-- floodar o usuário. O sino in-app continua mostrando tudo; só o push mobile é filtrado.
drop trigger if exists trg_web_push_system on public.system_notifications;
drop function if exists public.tg_web_push_system();
