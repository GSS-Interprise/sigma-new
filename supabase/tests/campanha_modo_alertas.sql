-- Teste do banco: criação de campanha pelo assistente com o modo da conversa e os avisos (migration 20261113200000).
-- Roda contra o banco de verdade e NÃO deixa nada gravado: tudo acontece dentro de um bloco que termina com erro de
-- propósito, o que desfaz a campanha criada. Resultado esperado na mensagem de erro: "TESTE_OK".
-- Rodar: psql "$DB" -f supabase/tests/campanha_modo_alertas.sql   (ou pelo scratchpad sql.py)
do $$
declare
  r jsonb; c record; v_uid uuid; v_camp record;
begin
  select id into v_uid from profiles where status = 'ativo' order by created_at limit 1;
  select official_sender_ids, official_template_name, especialidade_ids into v_camp
    from campanhas where official_template_name is not null and coalesce(cardinality(official_sender_ids), 0) > 0 order by created_at desc limit 1;
  if v_camp is null then raise exception 'TESTE_PULADO: nenhuma campanha oficial para copiar número e modelo'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 1) Modo equipe + destinos: número sem 55 ganha 55, número inválido e estrangeiro saem (repetido a edge ignora).
  r := campanha_assistente_criar(jsonb_build_object(
    'nome', 'TESTE AUTOMATICO APAGAR', 'especialidade_ids', to_jsonb(v_camp.especialidade_ids), 'ufs', '["SC"]'::jsonb,
    'template_name', v_camp.official_template_name, 'sender_ids', to_jsonb(v_camp.official_sender_ids), 'comecar', false,
    'tipo_envio', 'manual',
    'alerta_destinos', '[{"nome":"A","fone":"(48) 99999-0000"},{"nome":"Ruim","fone":"123"},{"nome":"EUA","fone":"1 202 555 0100"}]'::jsonb));
  select tipo_envio, alerta_destinos, status::text into c from campanhas where id = (r ->> 'campanha_id')::uuid;
  if c.tipo_envio <> 'manual' then raise exception 'FALHOU: tipo_envio %', c.tipo_envio; end if;
  if c.alerta_destinos <> '[{"nome":"A","fone":"5548999990000"}]'::jsonb then raise exception 'FALHOU: destinos %', c.alerta_destinos; end if;
  if c.status <> 'pausada' then raise exception 'FALHOU: status %', c.status; end if;

  -- 2) Sem tipo_envio e sem destinos: IA e lista vazia (avisos vão para os destinatários gerais).
  r := campanha_assistente_criar(jsonb_build_object(
    'nome', 'TESTE AUTOMATICO APAGAR 2', 'especialidade_ids', to_jsonb(v_camp.especialidade_ids), 'ufs', '["SC"]'::jsonb,
    'template_name', v_camp.official_template_name, 'sender_ids', to_jsonb(v_camp.official_sender_ids), 'comecar', false));
  select tipo_envio, alerta_destinos into c from campanhas where id = (r ->> 'campanha_id')::uuid;
  if c.tipo_envio <> 'ia' or c.alerta_destinos <> '[]'::jsonb then raise exception 'FALHOU: padrão % %', c.tipo_envio, c.alerta_destinos; end if;

  -- 3) Só administrador pede rotina do motor de IA (migration 20261113170000).
  if not public.is_admin(v_uid) then
    begin
      perform rotina_pedir('ia_claude_situacao', '{}'::jsonb);
      raise exception 'FALHOU: não-admin pediu rotina do motor de IA';
    exception when others then
      if sqlerrm not like '%so_administrador%' then raise; end if;
    end;
  end if;

  raise exception 'TESTE_OK';
end $$;
