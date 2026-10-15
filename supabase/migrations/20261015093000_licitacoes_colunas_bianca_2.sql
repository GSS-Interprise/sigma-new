-- Colunas do quadro da GSS, segunda resposta da Bianca (WhatsApp 15/10, 08:22): "pode retirar Conferência,
-- Proposta presencial, Em disputa, Proposta final, Adjudicação" e "os reprovados são junto com o Descarte,
-- pode só alterar o nome". Só o quadro da GSS (modulo licitacoes); a AGES tem colunas próprias.
--
-- Para onde vão os cards (inclusive arquivados, para nenhum card reaberto cair em coluna que não existe):
--   Conferência → Em análise · Proposta presencial → Cadastrar proposta · Em disputa → Aguardando sessão ·
--   Proposta final e Adjudicação → Arrematados (a Bianca já tinha dito que são a mesma etapa; todos estão
--   arquivados). A coluna Reprovados criada em 14/10 sai, e o Descarte passa a se chamar Reprovados.
--
-- A mudança é arrumação do quadro, não movimento da equipe: durante ela ficam desligados o aviso no sino de
-- mudança de coluna (avisaria os responsáveis de 50+ cards), a criação de pré-contrato ao virar Arrematados
-- (são editais antigos) e o gatilho de arquivamento (os cards continuam arquivados como estão).
begin;
alter table public.licitacoes disable trigger trg_licitacao_notify_sino_upd;
alter table public.licitacoes disable trigger on_licitacao_arrematada;
alter table public.licitacoes disable trigger trg_licitacao_arquivamento;

update public.licitacoes set status = 'edital_analise' where empresa = 'GSS' and status = 'conferencia';
update public.licitacoes set status = 'cadastro_proposta' where empresa = 'GSS' and status = 'proposta_presencial';
update public.licitacoes set status = 'aguardando_sessao' where empresa = 'GSS' and status = 'em_disputa';
update public.licitacoes set status = 'arrematados' where empresa = 'GSS' and status in ('proposta_final', 'adjudicacao_homologacao');
update public.licitacoes set status = 'descarte_edital' where empresa = 'GSS' and status = 'reprovados';

alter table public.licitacoes enable trigger trg_licitacao_notify_sino_upd;
alter table public.licitacoes enable trigger on_licitacao_arrematada;
alter table public.licitacoes enable trigger trg_licitacao_arquivamento;

update public.kanban_status_config set ativo = false, updated_at = now()
 where modulo = 'licitacoes' and status_id in ('conferencia', 'proposta_presencial', 'em_disputa', 'proposta_final', 'adjudicacao_homologacao', 'reprovados');
update public.kanban_status_config set label = 'Reprovados', updated_at = now()
 where modulo = 'licitacoes' and status_id = 'descarte_edital';

-- ordem: a lista da Bianca, com Reprovados (o antigo Descarte) no fim
update public.kanban_status_config k set ordem = x.i, updated_at = now()
  from unnest(array['captacao_edital', 'capitacao_de_credenciamento', 'edital_analise', 'deliberacao',
                    'esclarecimentos_impugnacao', 'cadastro_proposta', 'suspenso_revogado', 'aguardando_sessao',
                    'recurso_contrarrazao', 'nao_ganhamos', 'arrematados', 'descarte_edital']) with ordinality as x(sid, i)
 where k.modulo = 'licitacoes' and k.ativo and k.status_id = x.sid;
commit;
