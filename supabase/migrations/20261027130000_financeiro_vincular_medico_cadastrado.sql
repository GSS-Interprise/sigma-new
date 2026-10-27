-- Médico cadastrado depois da importação do fechamento: o vínculo só era feito na importação,
-- então a linha do pagamento ficava "sem contato" mesmo com o médico já no cadastro
-- (Amni, 27/10: Abiran, Maria Del Carmen, Renan Zini e Anderson Göttems).
-- Ao cadastrar (ou renomear) um médico, vincula os pagamentos sem médico cujo nome bate
-- pelo primeiro e último nome, ignorando acentos e da/de/do/das/dos/e, e só quando esse
-- médico é o único do cadastro com esse primeiro e último nome.

create or replace function public.financeiro_nome_tokens(p text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(w order by ord), '{}')
  from unnest(regexp_split_to_array(
         lower(public.unaccent(coalesce(p, ''))), '[^a-z0-9]+')) with ordinality as t(w, ord)
  where w <> '' and w not in ('da', 'de', 'do', 'das', 'dos', 'e')
$$;

create or replace function public.financeiro_vincular_medico_cadastrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t text[] := public.financeiro_nome_tokens(new.nome_completo);
  primeiro text;
  ultimo text;
begin
  if array_length(t, 1) is null or array_length(t, 1) < 2 then
    return new;
  end if;
  primeiro := t[1];
  ultimo := t[array_length(t, 1)];

  -- outro médico com o mesmo primeiro e último nome: ambíguo, deixa para a tela
  if exists (
    select 1 from medicos m
    where m.id <> new.id
      and (public.financeiro_nome_tokens(m.nome_completo))[1] = primeiro
      and (public.financeiro_nome_tokens(m.nome_completo))[array_length(public.financeiro_nome_tokens(m.nome_completo), 1)] = ultimo
  ) then
    return new;
  end if;

  update financeiro_pagamentos p
     set medico_id = new.id
   where p.medico_id is null
     and array_length(public.financeiro_nome_tokens(p.profissional_nome), 1) >= 2
     and (public.financeiro_nome_tokens(p.profissional_nome))[1] = primeiro
     and (public.financeiro_nome_tokens(p.profissional_nome))[array_length(public.financeiro_nome_tokens(p.profissional_nome), 1)] = ultimo;

  return new;
end;
$$;

drop trigger if exists trg_financeiro_vincular_medico on public.medicos;
create trigger trg_financeiro_vincular_medico
  after insert or update of nome_completo on public.medicos
  for each row execute function public.financeiro_vincular_medico_cadastrado();

-- médicos já cadastrados hoje que ficaram sem vínculo
update medicos set nome_completo = nome_completo
 where id in ('8421a819-ea7b-4100-8d54-b27bb12d31ee', 'f1cd8e0e-ca02-4080-8c64-49b15830cd6b',
              '5d8a63c5-3cc5-4dc5-85a3-8680705e3d1b', '30270d7b-5ba2-4ad5-b788-9276020f1100');
