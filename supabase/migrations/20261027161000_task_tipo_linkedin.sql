-- LinkedIn como tarefa dentro do médico na campanha (reunião com Ramone e Vinicius, 27/10):
-- conectar com o médico no LinkedIn vira um passo da cadência como WhatsApp, ligação e e-mail.
insert into public.task_tipos (codigo, label, icone, cor, ordem, ativo)
values ('linkedin', 'LinkedIn', 'Linkedin', 'text-sky-700', 35, true)
on conflict (codigo) do update set ativo = true;
