-- Pedido da Bianca (Contratos, 25/11/2026): médico só vai para Contratos com o cadastro completo.
-- Quando a modalidade envolve PJ, o contrato precisa do representante legal da empresa do médico.
alter table public.leads
  add column if not exists representante_legal_nome text,
  add column if not exists representante_legal_email text;

comment on column public.leads.representante_legal_nome is
  'Representante legal da PJ do médico. Obrigatório na conversão quando a modalidade envolve PJ.';
comment on column public.leads.representante_legal_email is
  'E-mail do representante legal da PJ do médico. Obrigatório na conversão quando a modalidade envolve PJ.';

-- Documentos da empresa: o Financeiro também anexa e atualiza (pedido da Bianca, 25/11/2026).
create or replace function public.pode_gerir_documentos(_uid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from user_roles where user_id = _uid
                  and role::text in ('admin', 'lider_licitacao', 'licitador', 'gestor_contratos', 'lideres',
                                     'gestor_captacao', 'gestor_financeiro'));
$function$;
