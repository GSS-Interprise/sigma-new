-- Conferência do cadastro de médico que "não subiu" para a equipe de cadastro (caso Suzana Martins
-- Cardo, 16/11/2026). Só leitura: rode no SQL Editor do Supabase. Não altera nada.
--
-- O cadastro pelo Kanban de médicos (/medicos › Adicionar Médico) grava: leads → medicos → card em
-- medico_kanban_cards → lead 'Convertido'. Até a correção, se o insert em medicos falhasse, o lead
-- ficava como 'Novo', sem médico e sem card, e a tela dizia "Médico criado e adicionado ao Kanban!".

-- 1. Onde a médica parou: lead, médico e card.
select l.id as lead_id, l.nome, l.status as status_lead, l.crm as crm_lead, l.created_at as lead_criado_em,
       m.id as medico_id, m.crm as crm_medico,
       m.aprovacao_contrato_assinado, m.aprovacao_documentacao_unidade, m.aprovacao_cadastro_unidade,
       c.id as card_id, c.status as coluna_card
  from leads l
  left join medicos m on m.lead_id = l.id
  left join medico_kanban_cards c on c.medico_id = m.id
 where unaccent(lower(l.nome)) like '%suzana%cardo%'
 order by l.created_at desc, l.id;
-- Lead 'Novo' com medico_id e card_id vazios = o médico foi recusado pelo banco (defeito corrigido).
-- Médico sem card = falha só no card. Médico com as 3 aprovações = saiu do Kanban (já está no Corpo Clínico).

-- 2. Por que o médico foi recusado: crm é UNIQUE em medicos e médico sem CRM grava 'PENDENTE'.
select id, nome_completo, crm, created_at
  from medicos
 where crm = 'PENDENTE'
    or crm = (select crm from leads where unaccent(lower(nome)) like '%suzana%cardo%' order by created_at desc, id limit 1)
 order by created_at, id;
-- Qualquer linha aqui bloqueia um novo médico com o mesmo CRM (ou sem CRM).

-- 3. Outros cadastros na mesma situação (lead criado pelo Kanban sem médico).
select l.id, l.nome, l.crm, l.created_at
  from leads l
 where l.status = 'Novo'
   and l.created_at >= now() - interval '60 days'
   and not exists (select 1 from medicos m where m.lead_id = l.id)
   and exists (
     select 1 from lead_historico h
      where h.lead_id = l.id and h.tipo_evento = 'lead_criado'
   )
   and coalesce(l.origem, '') = ''
 order by l.created_at desc, l.id;
-- Lista larga (inclui leads criados de propósito sem médico); confira os nomes com a equipe.
