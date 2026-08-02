-- Torna o destino do import uma relacao consultavel e auditavel. O JSON legado
-- continua existindo para compatibilidade com jobs antigos e reprocessamentos.
ALTER TABLE public.lead_import_jobs
  ADD COLUMN IF NOT EXISTS lista_destino_id uuid
    REFERENCES public.disparo_listas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lista_criada_automaticamente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicados_arquivo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invalidos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vinculados_lista integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_lead_import_jobs_lista_destino
  ON public.lead_import_jobs(lista_destino_id)
  WHERE lista_destino_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lead_import_job_items (
  job_id uuid NOT NULL REFERENCES public.lead_import_jobs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  resultado text NOT NULL CHECK (resultado IN ('novo', 'existente')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_import_job_items_lead
  ON public.lead_import_job_items(lead_id);

ALTER TABLE public.lead_import_job_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios autenticados visualizam itens de imports"
  ON public.lead_import_job_items;
CREATE POLICY "Usuarios autenticados visualizam itens de imports"
  ON public.lead_import_job_items FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.lead_import_job_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_import_job_items TO service_role;

UPDATE public.lead_import_jobs job
SET lista_destino_id = (job.mapeamento_colunas #>> '{_params,lista_destino_id}')::uuid
WHERE job.lista_destino_id IS NULL
  AND job.mapeamento_colunas #>> '{_params,lista_destino_id}' IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.disparo_listas lista
    WHERE lista.id = (job.mapeamento_colunas #>> '{_params,lista_destino_id}')::uuid
  );

UPDATE public.lead_import_jobs job
SET vinculados_lista = counts.total
FROM (
  SELECT lista_id, count(*)::integer AS total
  FROM public.disparo_lista_itens
  GROUP BY lista_id
) counts
WHERE job.lista_destino_id = counts.lista_id;

-- Para o historico, a separacao e inferida pelos motivos gravados. Nos novos
-- imports os contadores passam a ser incrementados diretamente pela funcao.
UPDATE public.lead_import_jobs job
SET duplicados_arquivo = stats.duplicados,
    invalidos = greatest(coalesce(job.ignorados, 0) - stats.duplicados, 0)
FROM (
  SELECT id,
         count(*) FILTER (
           WHERE lower(coalesce(erro->>'motivo', erro #>> '{}')) LIKE '%duplicad%'
         )::integer AS duplicados
  FROM public.lead_import_jobs,
       LATERAL jsonb_array_elements(coalesce(erros, '[]'::jsonb)) erro
  GROUP BY id
) stats
WHERE job.id = stats.id;

COMMENT ON COLUMN public.lead_import_jobs.lista_destino_id IS
  'Lista que recebeu todos os medicos validos do import.';
COMMENT ON COLUMN public.lead_import_jobs.vinculados_lista IS
  'Quantidade exata de contatos presentes na lista ao concluir o job.';
