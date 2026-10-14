-- Colunas do quadro de licitações da GSS conforme a Bianca (WhatsApp 14/10, 15:10). Ela mandou a lista
-- "de cabeça", sem olhar o sistema; por isso as colunas que não estão nela (Conferência, Proposta
-- presencial, Em disputa, Proposta final, Adjudicação/Homologação, Descarte) ficam no quadro até a GSS
-- confirmar, cada uma no ponto do fluxo onde já estava. Só o quadro da GSS (modulo licitacoes); a AGES
-- tem as próprias colunas (licitacoes_ages) e não muda.

-- Reprovados: coluna nova. O valor entra no enum para a coluna aceitar card (mesma regra de
-- licitacoes_coluna_criar).
alter type public.status_licitacao add value if not exists 'reprovados';

insert into kanban_status_config (modulo, status_id, label, ordem, cor, ativo)
select 'licitacoes', 'reprovados', 'Reprovados', 99, '#b91c1c', true
 where not exists (select 1 from kanban_status_config where modulo = 'licitacoes' and status_id = 'reprovados');

-- Fracassado unido a Não ganhamos (pedido da reunião de 07/10, repetido na lista: "Não arrematados/fracassados").
-- Mesmo efeito de excluir a coluna pelo menu do quadro levando os cards para Não ganhamos.
update licitacoes set status = 'nao_ganhamos' where status = 'fracassado' and empresa = 'GSS';
update kanban_status_config set ativo = false, updated_at = now() where modulo = 'licitacoes' and status_id = 'fracassado';

-- nomes da lista da Bianca
update kanban_status_config k set label = x.label, updated_at = now()
  from (values ('captacao_edital', 'Editais'),
               ('capitacao_de_credenciamento', 'Credenciamento'),
               ('edital_analise', 'Em análise'),
               ('esclarecimentos_impugnacao', 'Esclarecimentos/Impugnações'),
               ('cadastro_proposta', 'Cadastrar proposta'),
               ('suspenso_revogado', 'Suspenso/Revogado'),
               ('recurso_contrarrazao', 'Recurso/Contrarrazão'),
               ('nao_ganhamos', 'Não arrematados/fracassados')) as x(sid, label)
 where k.modulo = 'licitacoes' and k.status_id = x.sid;

-- ordem: a da lista dela, com as colunas fora da lista intercaladas onde já estavam no fluxo
update kanban_status_config k set ordem = x.i, updated_at = now()
  from unnest(array['captacao_edital', 'capitacao_de_credenciamento', 'edital_analise', 'conferencia',
                    'deliberacao', 'esclarecimentos_impugnacao', 'cadastro_proposta', 'proposta_presencial',
                    'suspenso_revogado', 'aguardando_sessao', 'em_disputa', 'proposta_final',
                    'adjudicacao_homologacao', 'recurso_contrarrazao', 'nao_ganhamos', 'arrematados',
                    'reprovados', 'descarte_edital']) with ordinality as x(sid, i)
 where k.modulo = 'licitacoes' and k.ativo and k.status_id = x.sid;
