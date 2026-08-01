-- =====================================================================
-- pncp_score_gss_v3 - fecha 5 misses medidos em 01/08/2026.
--
-- A v2 ja resolvia acento, stemmer e plantonista (ver pncp_score_v2.sql). Os
-- misses que sobraram tinham TRES causas distintas, todas confirmadas
-- rodando o classificador contra o texto real:
--
--   1. EDITAL SEM A PALAVRA "MEDICO". O bloco 4 exigia
--      "servic/prestac/contratac ... medic". Mas boa parte dos editais diz
--      so a ESPECIALIDADE:
--        "PRESTACAO DE SERVICOS ESPECIALIZADOS EM PSIQUIATRIA"  -> b4 = 0
--        "Consultas Medicas na area de neuropediatria"          -> b4 = 0
--      Prestacao de servico + especialidade medica E o nucleo do negocio,
--      tanto quanto "servico medico".
--
--   2. CREDENCIAMENTO MULTIDISCIPLINAR. O bloco 3 exigia contexto medico
--      numa lista que nao incluia as terapias:
--        "CREDENCIAMENTO ... MULTIDISCIPLINARES - PSICOPEDAGOGIA,
--         FONOAUDIOLOGIA, TERAPIA OCUPACIONAL"                  -> b3 = 0
--      A GSS presta esses servicos; a lista e' que estava curta.
--
--   3. A EXCLUSAO MATANDO O ALVO OUTRA VEZ. Este e' o bug de julho voltando
--      por outra porta:
--        "Credenciamento de pessoas juridicas prestadoras de servicos de
--         saude para procedimentos ambulatoriais, diagnosticos, clinicos,
--         cirurgicos..."  -> b3=3 b2=2 b1=1 = 6, exclusao -5 = 1
--      A guarda so' protegia quem tinha b4. Credenciamento de saude (b3)
--      tambem e' sinal forte e precisa blindar.
--
-- ARMADILHA DE TRANSPORTE (mantida da v2): a Management API corrompe literal
-- acentuado. Este arquivo e' 100% ASCII; acento sai em runtime no
-- imm_unaccent(). NUNCA escrever literal acentuado aqui.
-- =====================================================================

create or replace function pncp_score_gss_v2(p_objeto text)
returns integer language sql immutable as $$
with t as (
  select regexp_replace(lower(imm_unaccent(coalesce(p_objeto, ''))), '\s+', ' ', 'g') as o
),
e as (
  -- Especialidades e modalidades de atendimento que a GSS presta. Usadas
  -- em DOIS lugares: para elevar prestacao-de-servico a bloco 4, e como
  -- contexto valido de credenciamento no bloco 3.
  select o,
    -- Parenteses obrigatorios em volta da concatenacao: o operador ~ casa
    -- ANTES do ||, entao "o ~ 'a' || 'b'" vira "(o ~ 'a') || 'b'" = texto,
    -- e o AND seguinte estoura com "argument of AND must be type boolean".
    (o ~ ('psiquiatr|neuropediatr|pediatr|cardiolog|ortoped|anestesiolog|'
       || 'ginecolog|obstetr|oftalmolog|dermatolog|urolog|neurolog|'
       || 'endocrinolog|infectolog|nefrolog|pneumolog|reumatolog|'
       || 'gastroenterolog|oncolog|geriatr|radiolog|ultrassonograf|'
       || 'fonoaudiolog|fisioterap|psicolog|psicopedagog|terapia ocupacional|'
       || 'psicomotricidade|nutricion|enfermagem|odontolog|clinica geral|'
       || 'clinico geral|intensivist|plantonist')) as tem_especialidade
  from t
),
s as (
  select o, tem_especialidade,
    -- BLOCO 4: nucleo do negocio.
    (case when o ~ '(servic|serv\M|prestac|contratac)[a-z]* .{0,60}medic'
            or o ~ 'medic[a-z]* .{0,30}(plantao|plantonist|sobreaviso)'
            or o ~ 'plantao|plantonist|plantoes'
            or o ~ '(servic|serv\M)[a-z]* medic'
            or o ~ '(mao de obra|terceirizac[a-z]*) .{0,20}medic'
            or o ~ 'medic[a-z]* .{0,20}(especializ|assistenci)'
            -- NOVO (1b): consulta/atendimento medico direto, sem o
            -- "prestacao de servico" na frente.
            --
            -- ATENCAO: aqui NAO se usa o prefixo solto 'medic[a-z]*'. Ele casa
            -- MEDICAMENTO, e foi assim que a primeira tentativa desta regra
            -- deu score 4 para "Aquisicao de medicameno importado para
            -- ATENDIMENTO de demanda judicial". E a mesma colisao
            -- medic/medicamento que derrubou o recall para 7,8% em julho.
            -- Formas explicitas + \M (fim de palavra) tornam impossivel.
            or o ~ '(consulta|atendiment|procediment)[a-z]* .{0,20}medic(o|a|os|as|ina)\M'
            or o ~ 'medic(o|a|os|as|ina)\M .{0,20}(consulta|atendiment)'
          then 4 else 0 end) as b4_forte,
    -- NOVO (1): prestacao de servico + ESPECIALIDADE, sem exigir a palavra
    -- "medico". "PRESTACAO DE SERVICOS ESPECIALIZADOS EM PSIQUIATRIA" e' tao
    -- alvo quanto "servico medico".
    --
    -- SEPARADO do b4_forte de proposito: este sinal NAO blinda a exclusao.
    -- Medido - juntando os dois, "MANUTENCAO DOS EQUIPAMENTOS ODONTOLOGICOS
    -- DA REDE MUNICIPAL DE SAUDE" tirava 5, e compra/manutencao de
    -- equipamento da especialidade entrava como se fosse prestacao de
    -- servico assistencial.
    (case when tem_especialidade
                and o ~ '(prestac|contratac|servic|serv\M|credenciament|chamament)'
          then 4 else 0 end) as b4_espec,
    -- BLOCO 3: credenciamento / gestao de unidade de saude
    (case when (o ~ 'credenciament[a-z]*'
                and (o ~ '(medic|profission|saude|hospitalar|clinic|odontolog|enferm|exame|consulta|cirurg)'
                     -- NOVO (2): terapias e atendimento multidisciplinar
                     or tem_especialidade
                     or o ~ 'multidisciplinar|multiprofission|ambulatori|terapeutic'))
            or (o ~ 'gestao' and o ~ '(saude|hospital|unidade de saude|upa|ubs|pronto)')
            or (o ~ 'escala' and o ~ 'medic')
            or (o ~ 'chamament[a-z]* public[a-z]*'
                and (o ~ '(medic|saude|hospitalar|clinic)' or tem_especialidade))
          then 3 else 0 end) as b3,
    -- BLOCO 2: especialidade / porta de entrada / termos fortes de saude
    (case when o ~ 'hospitalar|ambulatori|telemedicina|telessaude|telediagnostic|anestesiolog|radiolog|cardiolog|ortoped|pediatr|ginecolog|psiquiatr|oftalmolog|ultrassonograf|tomograf|endoscop|laboratori|diagnostic|analises clinic'
            or o ~ 'atencao basica|saude da familia|pronto atendimento|pronto socorro|upa 24|samu|uti |urgencia|emergencia|home care|medicina do trabalho'
            or o ~ 'exame[s]? .{0,25}(medic|clinic|laboratori|imagem|complementar)'
            or o ~ 'laudo[s]? medic'
            -- NOVO: terapias como sinal medio, nao fraco
            or o ~ 'fonoaudiolog|fisioterap|psicopedagog|terapia ocupacional|psicomotricidade'
          then 2 else 0 end) as b2,
    -- BLOCO 1: sinal fraco de saude
    (case when (o ~ 'servic' and o ~ 'saude')
            or (o ~ 'equipe' and o ~ '(medic|saude|multiprofission)')
            or o ~ 'enfermagem|nutricion|psicolog|odontolog'
          then 1 else 0 end) as b1,
    -- EXCLUSAO: compra de bem, obra, e servico nao-assistencial.
    -- Manutencao entrou em 01/08, mas QUALIFICADA. "MANUTENCAO CORRETIVA DE
    -- COMPRESSOR DE AR ODONTOLOGICO" tirava 5 porque a especialidade
    -- descrevia o EQUIPAMENTO, nao o servico.
    --
    -- O 'manutenc' cru era grosseiro demais e matou um alvo legitimo:
    -- "assistencia hospitalar e ambulatorial de media complexidade, dentro do
    -- BLOCO DE MANUTENCAO DAS ACOES da atencao especializada" - onde
    -- "manutencao" e' termo ORCAMENTARIO do SUS, nao conserto de aparelho.
    -- Por isso exige preventiva/corretiva ou um objeto fisico por perto.
    (case when o ~ 'medicament|insumo|equipament|mobiliari|veicul|ambulanci|trator|frota|combustivel|obra |reforma|pavimentac|construc|alimentac|refeic|merenda|limpeza|vigilanci|dedetizac|informatica|impressora|software|licenc[a-z]* de uso|curso |capacitac|treinament|leilo|locacao de imovel|residuos'
            or o ~ 'manutenc[a-z]* (preventiva|corretiva)'
            or o ~ 'manutenc[a-z]* .{0,18}(equipament|aparelh|maquin|predial|veicul|autoclave|compressor|elevador|central de ar)'
          then 1 else 0 end) as excl_hit
  from e
)
select greatest(0,
  greatest(b4_forte, b4_espec) + b3 + b2 + b1
  -- NOVO (3): a guarda passa a cobrir credenciamento de saude, mas so' quando
  -- ele vem ACOMPANHADO de termo forte de saude (b2). Antes so' b4 blindava,
  -- e "Credenciamento ... servicos de saude ... procedimentos ambulatoriais,
  -- cirurgicos" (b3=3 b2=2 b1=1 = 6) levava -5 e virava 1 - edital de
  -- credenciamento cita material o tempo todo, e a mencao nao o transforma
  -- em compra de material.
  --
  -- Exigir b2 junto e' o que impede o vazamento medido no outro extremo:
  -- "CREDENCIAMENTO PROGRAMA POPULAR DE FORMACAO, EDUCACAO" tem b3 mas nao
  -- tem b2, entao continua levando a exclusao.
  --
  -- b4_espec NAO entra na guarda: especialidade + "contratacao" tambem
  -- descreve COMPRA de equipamento da especialidade.
  - (case when excl_hit = 1 and b4_forte = 0 and not (b3 > 0 and b2 > 0)
          then 5 else 0 end)
)::int
from s
$$;

grant execute on function pncp_score_gss_v2(text) to authenticated, service_role;
