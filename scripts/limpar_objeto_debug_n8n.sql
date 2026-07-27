-- =====================================================================
-- Tira o dump de debug do n8n de dentro do campo objeto.
--
-- O QUE ACONTECEU: o captador manda `column_id` com a MODALIDADE ("Pregao
-- Eletronico") em vez de um UUID. A api-licitacoes, em vez de recusar ou
-- ignorar, anexa o payload inteiro dentro do objeto como "debug":
--
--   Contratacao de Empresa Especializada ... EMHUR.<br><br><hr><small>
--   <strong>Importado do n8n (column_id nao e UUID: Pregao Eletronico)
--   </strong></small><pre>{ "titulo": ..., "responsavel_id": ... }
--
-- O texto REAL do edital esta la, so soterrado. A equipe abre o card e ve
-- codigo - foi assim que a Sarah reportou em 27/07.
--
-- Este arquivo so LIMPA o que ja foi gravado. A blindagem da entrada (parar
-- de escrever debug no objeto) vai na api-licitacoes.
-- =====================================================================

-- Corta a partir do primeiro marcador de debug e devolve texto limpo.
-- Ordem importa: primeiro CORTA o lixo, depois decodifica entidade, depois
-- tira tag. Decodificar antes do corte transformaria &quot; em aspas dentro
-- do JSON e o regex de corte poderia casar no lugar errado.
create or replace function limpar_objeto_debug(p_texto text)
returns text language sql immutable as $$
  select nullif(btrim(
    regexp_replace(
      regexp_replace(
        replace(replace(replace(replace(replace(
          -- 1) corta do primeiro <hr>/<br><br><hr>/"Importado do n8n" em diante
          regexp_replace(coalesce(p_texto, ''),
            '(<br\s*/?>\s*)*<hr\b.*$|<small>\s*<strong>\s*Importado do n8n.*$|Importado do n8n \(column_id.*$',
            '', 'is'),
          -- 2) entidades que sobraram no texto legitimo
          '&quot;', '"'), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&nbsp;', ' '),
        -- 3) qualquer tag remanescente
        '<[^>]+>', ' ', 'g'),
      -- 4) espaco repetido
      '\s+', ' ', 'g')
  ), '')
$$;

comment on function limpar_objeto_debug(text) is
  'Remove o dump de debug do n8n do campo objeto, preservando o texto real do '
  'edital. Corta ANTES de decodificar entidade - decodificar primeiro faria o '
  'regex de corte casar dentro do JSON.';
