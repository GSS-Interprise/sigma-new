-- =====================================================================
-- pncp_score_gss_v2 - classificador DETERMINISTICO (zero IA) sobre o
-- texto do objeto, nao sobre tsvector.
--
-- POR QUE ABANDONAR tsquery/tsvector: a versao antiga tinha 3 defeitos que
-- se anulavam parcialmente e derrubavam o recall para ~25%:
--   1. ACENTO: pncp_mirror.busca_objeto = to_tsvector('portuguese', objeto)
--      guarda lexema ACENTUADO ('medic' com acento, 'saud' com acento), mas
--      100% dos termos da query eram sem acento -> "SERVICOS MEDICOS" (o
--      objeto mais on-target do negocio) NUNCA casava. Score = 0.
--   2. STEMMER COLIDE: 'medicamento:*' stemiza para o MESMO radical de
--      'medico'. A regra de exclusao matava -5 em todo edital medico
--      legitimo - 105 dos 128 casos recuperaveis morriam so nesse termo.
--   3. 'plantonist:*' nao casa 'plantonista' (lexema real e' mais curto).
--
-- Regex sobre imm_unaccent(lower(texto)) resolve os tres: sem stemmer nao
-- ha colisao, sem acento nao ha divergencia, e o casamento e' literal e
-- auditavel. Custo: nao usa indice GIN, mas o volume (490k linhas) roda em
-- segundos e a triagem e' batch.
--
-- ATENCAO A ARMADILHA DE TRANSPORTE: a Management API do Supabase corrompe
-- literais acentuados no SQL enviado ('medicos' vira mojibake no servidor).
-- Por isso este arquivo e' 100% ASCII e todo acento e' removido em tempo de
-- execucao por imm_unaccent(). NUNCA escrever literal acentuado aqui.
-- =====================================================================

create or replace function pncp_score_gss_v2(p_objeto text)
returns integer language sql immutable as $$
with t as (
  select regexp_replace(lower(imm_unaccent(coalesce(p_objeto, ''))), '\s+', ' ', 'g') as o
),
s as (
  select o,
    -- BLOCO 4: nucleo do negocio - prestacao de servico medico / plantao.
    -- 'serv\M' cobre a abreviacao "SERV MEDICO" usada por varios orgaos.
    -- 'mao de obra medic' e 'terceirizac...medic' sao formas comuns de
    -- contratar o mesmo servico e escapavam da janela de 40 caracteres.
    (case when o ~ '(servic|serv\M|prestac|contratac)[a-z]* .{0,60}medic'
            or o ~ 'medic[a-z]* .{0,30}(plantao|plantonist|sobreaviso)'
            or o ~ 'plantao|plantonist|plantoes'
            or o ~ '(servic|serv\M)[a-z]* medic'
            or o ~ '(mao de obra|terceirizac[a-z]*) .{0,20}medic'
            or o ~ 'medic[a-z]* .{0,20}(especializ|assistenci)'
          then 4 else 0 end) as b4,
    -- BLOCO 3: credenciamento / gestao de unidade de saude
    (case when o ~ 'credenciament[a-z]*' and o ~ '(medic|profission|saude|hospitalar|clinic|odontolog|enferm|exame|consulta|cirurg)'
            or (o ~ 'gestao' and o ~ '(saude|hospital|unidade de saude|upa|ubs|pronto)')
            or (o ~ 'escala' and o ~ 'medic')
            or o ~ 'chamament[a-z]* public[a-z]*' and o ~ '(medic|saude|hospitalar|clinic)'
          then 3 else 0 end) as b3,
    -- BLOCO 2: especialidade / porta de entrada / termos fortes de saude
    -- radicais CURTOS de proposito: 'laboratori' pega laboratorial E
    -- laboratoriais (o sufixo plural quebrava o casamento).
    (case when o ~ 'hospitalar|ambulatori|telemedicina|telessaude|telediagnostic|anestesiolog|radiolog|cardiolog|ortoped|pediatr|ginecolog|psiquiatr|oftalmolog|ultrassonograf|tomograf|endoscop|laboratori|diagnostic|analises clinic'
            or o ~ 'atencao basica|saude da familia|pronto atendimento|pronto socorro|upa 24|samu|uti |urgencia|emergencia|home care|medicina do trabalho'
            or o ~ 'exame[s]? .{0,25}(medic|clinic|laboratori|imagem|complementar)'
            or o ~ 'laudo[s]? medic'
          then 2 else 0 end) as b2,
    -- BLOCO 1: sinal fraco de saude
    (case when (o ~ 'servic' and o ~ 'saude')
            or (o ~ 'equipe' and o ~ '(medic|saude|multiprofission)')
            or o ~ 'enfermagem|fisioterap|nutricion|fonoaudiolog|psicolog|odontolog'
          then 1 else 0 end) as b1,
    -- EXCLUSAO: compra de bem, obra, e servico nao-assistencial.
    -- 'medicament' (nao 'medic'!) e' o ponto critico: precisa casar
    -- medicamento/medicamentos sem tocar em medico/medicina.
    (case when o ~ 'medicament|insumo|equipament|mobiliari|veicul|ambulanci|trator|frota|combustivel|obra |reforma|pavimentac|construc|alimentac|refeic|merenda|limpeza|vigilanci|dedetizac|informatica|impressora|software|licenc[a-z]* de uso|curso |capacitac|treinament|leilo|locacao de imovel|residuos'
          then 1 else 0 end) as excl_hit
  from t
)
select greatest(0,
  b4 + b3 + b2 + b1
  -- A exclusao so' derruba quando NAO ha sinal forte de prestacao de
  -- servico medico (bloco 4). "Aquisicao de material" morre; "prestacao de
  -- servicos medicos ... incluindo materiais" sobrevive. Sem esta guarda,
  -- a exclusao volta a matar o alvo, que foi o bug original.
  - (case when excl_hit = 1 and b4 = 0 then 5 else 0 end)
)::int
from s
$$;

grant execute on function pncp_score_gss_v2(text) to authenticated, service_role;
