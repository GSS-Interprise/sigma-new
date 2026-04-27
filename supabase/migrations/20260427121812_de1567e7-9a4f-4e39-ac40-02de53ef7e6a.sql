
ALTER TABLE public.worklist_tarefas
  ADD COLUMN IF NOT EXISTS setor_destino_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS setor_origem_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'setor',
  ADD COLUMN IF NOT EXISTS urgencia text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'tarefa',
  ADD COLUMN IF NOT EXISTS concluida_em timestamptz,
  ADD COLUMN IF NOT EXISTS lead_id uuid,
  ADD COLUMN IF NOT EXISTS sigzap_conversation_id uuid;

CREATE INDEX IF NOT EXISTS idx_worklist_tarefas_setor_destino ON public.worklist_tarefas(setor_destino_id);
CREATE INDEX IF NOT EXISTS idx_worklist_tarefas_responsavel ON public.worklist_tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_worklist_tarefas_created_by ON public.worklist_tarefas(created_by);
CREATE INDEX IF NOT EXISTS idx_worklist_tarefas_data_limite ON public.worklist_tarefas(data_limite);

CREATE OR REPLACE FUNCTION public.user_setor_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT setor_id FROM public.profiles WHERE id = _user_id LIMIT 1; $$;

CREATE TABLE IF NOT EXISTS public.worklist_tarefa_mencionados (
  tarefa_id uuid NOT NULL REFERENCES public.worklist_tarefas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, user_id)
);
ALTER TABLE public.worklist_tarefa_mencionados ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_worklist_mencionados_user ON public.worklist_tarefa_mencionados(user_id);

CREATE TABLE IF NOT EXISTS public.worklist_tarefa_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES public.worklist_tarefas(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text,
  nome text,
  tamanho_bytes bigint,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.worklist_tarefa_anexos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_worklist_anexos_tarefa ON public.worklist_tarefa_anexos(tarefa_id);

CREATE TABLE IF NOT EXISTS public.worklist_tarefa_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES public.worklist_tarefas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conteudo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.worklist_tarefa_comentarios ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_worklist_comentarios_tarefa ON public.worklist_tarefa_comentarios(tarefa_id);

CREATE OR REPLACE FUNCTION public.can_view_worklist_tarefa(_tarefa_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.worklist_tarefas t
    WHERE t.id = _tarefa_id
      AND (
        t.created_by = _user_id
        OR t.responsavel_id = _user_id
        OR t.escopo = 'geral'
        OR (t.setor_destino_id IS NOT NULL AND t.setor_destino_id = public.user_setor_id(_user_id))
        OR EXISTS (SELECT 1 FROM public.worklist_tarefa_mencionados m WHERE m.tarefa_id = t.id AND m.user_id = _user_id)
        OR public.is_admin(_user_id)
      )
  );
$$;

DROP POLICY IF EXISTS "Authorized users can create tasks" ON public.worklist_tarefas;
DROP POLICY IF EXISTS "Authorized users can delete tasks" ON public.worklist_tarefas;
DROP POLICY IF EXISTS "Authorized users can update tasks" ON public.worklist_tarefas;
DROP POLICY IF EXISTS "Users can view their own tasks" ON public.worklist_tarefas;
DROP POLICY IF EXISTS "auth_all_worklist" ON public.worklist_tarefas;

CREATE POLICY "worklist_tarefas_select" ON public.worklist_tarefas FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR responsavel_id = auth.uid()
  OR escopo = 'geral'
  OR (setor_destino_id IS NOT NULL AND setor_destino_id = public.user_setor_id(auth.uid()))
  OR EXISTS (SELECT 1 FROM public.worklist_tarefa_mencionados m WHERE m.tarefa_id = worklist_tarefas.id AND m.user_id = auth.uid())
  OR public.is_admin(auth.uid())
);

CREATE POLICY "worklist_tarefas_insert" ON public.worklist_tarefas FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "worklist_tarefas_update" ON public.worklist_tarefas FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR responsavel_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "worklist_tarefas_delete" ON public.worklist_tarefas FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "worklist_mencionados_select" ON public.worklist_tarefa_mencionados FOR SELECT TO authenticated
USING (public.can_view_worklist_tarefa(tarefa_id, auth.uid()));
CREATE POLICY "worklist_mencionados_insert" ON public.worklist_tarefa_mencionados FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.worklist_tarefas t WHERE t.id = tarefa_id AND (t.created_by = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY "worklist_mencionados_delete" ON public.worklist_tarefa_mencionados FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.worklist_tarefas t WHERE t.id = tarefa_id AND (t.created_by = auth.uid() OR public.is_admin(auth.uid()))));

CREATE POLICY "worklist_anexos_select" ON public.worklist_tarefa_anexos FOR SELECT TO authenticated
USING (public.can_view_worklist_tarefa(tarefa_id, auth.uid()));
CREATE POLICY "worklist_anexos_insert" ON public.worklist_tarefa_anexos FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.can_view_worklist_tarefa(tarefa_id, auth.uid()));
CREATE POLICY "worklist_anexos_delete" ON public.worklist_tarefa_anexos FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "worklist_comentarios_select" ON public.worklist_tarefa_comentarios FOR SELECT TO authenticated
USING (public.can_view_worklist_tarefa(tarefa_id, auth.uid()));
CREATE POLICY "worklist_comentarios_insert" ON public.worklist_tarefa_comentarios FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.can_view_worklist_tarefa(tarefa_id, auth.uid()));
CREATE POLICY "worklist_comentarios_delete" ON public.worklist_tarefa_comentarios FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

INSERT INTO storage.buckets (id, name, public)
VALUES ('worklist-anexos', 'worklist-anexos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "worklist_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'worklist-anexos' AND public.can_view_worklist_tarefa(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "worklist_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'worklist-anexos' AND public.can_view_worklist_tarefa(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "worklist_storage_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'worklist-anexos' AND owner = auth.uid());

CREATE OR REPLACE VIEW public.vw_worklist_pendencias_setor
WITH (security_invoker = true) AS
SELECT
  'lead-' || l.id::text AS id,
  '6dfff5fe-e51c-4258-95d0-cdc84b179985'::uuid AS setor_id,
  'lead'::text AS origem,
  l.id AS recurso_id,
  COALESCE(l.nome, 'Lead sem nome') AS titulo,
  ('Lead em aberto há ' || EXTRACT(DAY FROM now() - l.created_at)::text || ' dias') AS descricao,
  CASE WHEN l.created_at < now() - interval '30 days' THEN 'alta'
       WHEN l.created_at < now() - interval '14 days' THEN 'media'
       ELSE 'baixa' END AS urgencia,
  l.created_at AS referencia_data,
  '/disparos/leads'::text AS link
FROM public.captacao_leads l
WHERE l.status IN ('aberto','novo','em_contato')
  AND l.created_at < now() - interval '7 days'
UNION ALL
SELECT
  'contrato-' || c.id::text,
  '1a57b82d-be39-408c-aec7-c49ee97a692c'::uuid,
  'contrato', c.id,
  COALESCE(c.codigo_contrato, 'Contrato sem código'),
  ('Vence em ' || c.data_fim::text),
  CASE WHEN c.data_fim < current_date + interval '15 days' THEN 'alta'
       WHEN c.data_fim < current_date + interval '45 days' THEN 'media'
       ELSE 'baixa' END,
  c.data_fim::timestamptz, '/contratos'
FROM public.contratos c
WHERE c.data_fim BETWEEN current_date AND current_date + interval '90 days'
  AND COALESCE(c.status_contrato, '') NOT IN ('encerrado','cancelado')
UNION ALL
SELECT
  'licitacao-' || li.id::text,
  'ee54a8a5-47b1-4059-881a-381b9f5b82f1'::uuid,
  'licitacao', li.id,
  COALESCE(li.titulo, li.numero_edital, 'Licitação'),
  ('Limite em ' || li.data_limite::text),
  CASE WHEN li.data_limite < now() + interval '3 days' THEN 'alta'
       WHEN li.data_limite < now() + interval '7 days' THEN 'media'
       ELSE 'baixa' END,
  li.data_limite::timestamptz, '/licitacoes'
FROM public.licitacoes li
WHERE li.data_limite BETWEEN current_date AND current_date + interval '14 days'
  AND li.status NOT IN ('descarte_edital','suspenso_revogado','nao_ganhamos','adjudicacao_homologacao','arrematados');

GRANT SELECT ON public.vw_worklist_pendencias_setor TO authenticated;
