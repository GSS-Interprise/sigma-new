-- Prestador de serviço que NÃO é médico (Mavi, 18/11/2026): ele entra no fechamento do financeiro, mas ficava
-- "sem cadastro" porque o cadastro de médicos exigia CRM. Sem cadastro não há contato, e o pedido de NF não sai.
--
-- Marcador no próprio cadastro: com prestador_nao_medico = true o CRM pode ficar vazio. Médico continua com CRM
-- obrigatório (a regra vale no banco, não só na tela). O vínculo com o fechamento não muda: o gatilho
-- trg_financeiro_vincular_medico liga os pagamentos "sem cadastro" pelo primeiro e último nome assim que o cadastro
-- é salvo.

alter table public.medicos
  add column if not exists prestador_nao_medico boolean not null default false;

alter table public.medicos alter column crm drop not null;

alter table public.medicos drop constraint if exists medicos_crm_obrigatorio_para_medico;
alter table public.medicos
  add constraint medicos_crm_obrigatorio_para_medico
  check (prestador_nao_medico or (crm is not null and length(btrim(crm)) > 0));
