-- 14/10: e-mail com lixo no fim (ex.: "...@gmail.com20240827135433") passava na regra antiga e
-- fazia o Resend recusar o lote inteiro de 100. A regra agora exige domínio terminado em letras,
-- igual à checagem do envio (EMAIL_VALIDO em email-campanha).
CREATE OR REPLACE FUNCTION public.email_publico_campanha(p_campanha_id uuid)
 RETURNS TABLE(lead_id uuid, email text, nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with c as (select * from campanhas where id = p_campanha_id),
  base as (
    -- campanha só de e-mail: pelos filtros
    select l.id, lower(trim(l.email)) as email, l.nome
      from leads l, c
     where c.canal = 'email'
       and (coalesce(array_length(c.especialidade_ids, 1), 0) = 0
            or l.especialidade_id = any(c.especialidade_ids)
            or exists (select 1 from lead_especialidades le where le.lead_id = l.id and le.especialidade_id = any(c.especialidade_ids)))
       and (coalesce(array_length(c.regiao_estados, 1), 0) = 0 or l.uf = any(c.regiao_estados))
       and (coalesce(array_length(c.regiao_cidades, 1), 0) = 0 or lower(unaccent(trim(l.cidade))) in (select lower(unaccent(trim(x))) from unnest(c.regiao_cidades) x))  -- cadastro mistura ITAJAI/Itajaí
       and (not exists (select 1 from campanha_listas cl where cl.campanha_id = c.id)
            or exists (select 1 from campanha_listas cl join disparo_lista_itens i on i.lista_id = cl.lista_id
                        where cl.campanha_id = c.id and i.lead_id = l.id))
    union all
    -- e-mail dentro de campanha de WhatsApp: o público dela
    select l.id, lower(trim(l.email)), l.nome
      from campanha_leads cl join leads l on l.id = cl.lead_id, c
     where c.canal is distinct from 'email' and cl.campanha_id = c.id
       and (c.email_publico = 'todos' or cl.status in ('frio', 'contatado', 'sem_resposta', 'sem_whatsapp'))
  )
  select distinct on (b.email) b.id, b.email, b.nome
    from base b
    join leads l on l.id = b.id
   where b.email ~* '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'
     and coalesce(l.opt_out, false) = false
     and not exists (select 1 from email_optout o where o.email = b.email)
   order by b.email, b.id;
$function$;
