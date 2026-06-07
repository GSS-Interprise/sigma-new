-- =====================================================================
-- WS-A — Cadência de TAREFAS (manuais) parametrizável (templates + override)
--
-- ⚠️ CONTEXTO IMPORTANTE — dois sistemas de "cadência" coexistem:
--   1. cadencia_templates + cadencia_passos (JÁ EM PRODUÇÃO): cadência de
--      MENSAGENS AUTOMÁTICAS (whatsapp/email com mensagem_template), consumida
--      pelo campanha-disparo-processor. NÃO É TOCADA AQUI.
--   2. campanha_lead_tasks (esta migration): TAREFAS MANUAIS que a operadora
--      executa e marca feita. É isto que estamos tornando parametrizável.
--
-- Antes: trigger tg_campanha_leads_generate_tasks gerava 6 tasks FIXAS
-- (whatsapp_1/2/3, email, instagram, telefone em D+0/1/2/4/6/8), tipos
-- travados num CHECK. A equipe quer definir a cadência por campanha
-- ("ligar 1x", "chamar no Instagram", + outras) e novos canais sem deploy.
--
-- Agora:
--   - task_tipos              = canais de tarefa gerenciáveis (whatsapp, ligacao…)
--   - tarefa_cadencia_templates = cadências de tarefa reutilizáveis (passos jsonb)
--   - campanhas.tarefa_cadencia_passos = SNAPSHOT da cadência da campanha
--     (fonte de verdade do trigger; desacopla de edições futuras do template)
--   - campanha_lead_tasks ganha `rotulo`; `tipo` passa a ser o código do canal;
--     CHECK e UNIQUE(tipo) saem, UNIQUE(ordem) entra.
--   - trigger lê tarefa_cadencia_passos com FALLBACK pra Padrão (retrocompat).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. task_tipos — canais de tarefa gerenciáveis
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_tipos (
  codigo     text PRIMARY KEY,
  label      text NOT NULL,
  icone      text NOT NULL DEFAULT 'CircleDot',   -- nome de ícone lucide (validado por registry no front)
  cor        text NOT NULL DEFAULT 'text-slate-600',
  ordem      int  NOT NULL DEFAULT 100,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.task_tipos (codigo, label, icone, cor, ordem) VALUES
  ('whatsapp',  'WhatsApp',  'MessageCircle',  'text-emerald-600', 10),
  ('ligacao',   'Ligação',   'Phone',          'text-amber-600',   20),
  ('instagram', 'Instagram', 'Instagram',      'text-pink-600',    30),
  ('email',     'Email',     'Mail',           'text-blue-600',    40),
  ('sms',       'SMS',       'MessageSquare',  'text-slate-600',   50)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.task_tipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view task_tipos" ON public.task_tipos;
CREATE POLICY "Authenticated can view task_tipos"
  ON public.task_tipos FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can manage task_tipos" ON public.task_tipos;
CREATE POLICY "Authenticated can manage task_tipos"
  ON public.task_tipos FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "service_role_all_task_tipos" ON public.task_tipos;
CREATE POLICY "service_role_all_task_tipos"
  ON public.task_tipos FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.task_tipos TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. tarefa_cadencia_templates — cadências de TAREFA reutilizáveis
--    passos jsonb: [{ordem, canal, rotulo, dia_offset}]
--    (nome distinto de cadencia_templates, que é de MENSAGENS automáticas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tarefa_cadencia_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  descricao  text,
  is_default boolean NOT NULL DEFAULT false,
  ativo      boolean NOT NULL DEFAULT true,
  passos     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Template "Padrão" = as 6 etapas legadas (retrocompat com o comportamento atual)
INSERT INTO public.tarefa_cadencia_templates (nome, descricao, is_default, passos)
SELECT
  'Padrão',
  'Cadência clássica: 3 WhatsApp + email + Instagram + ligação ao longo de 8 dias.',
  true,
  '[
    {"ordem":1,"canal":"whatsapp","rotulo":"WhatsApp #1","dia_offset":0},
    {"ordem":2,"canal":"whatsapp","rotulo":"WhatsApp #2","dia_offset":1},
    {"ordem":3,"canal":"email","rotulo":"Email","dia_offset":2},
    {"ordem":4,"canal":"whatsapp","rotulo":"WhatsApp #3","dia_offset":4},
    {"ordem":5,"canal":"instagram","rotulo":"Instagram","dia_offset":6},
    {"ordem":6,"canal":"ligacao","rotulo":"Ligar","dia_offset":8}
  ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.tarefa_cadencia_templates WHERE nome = 'Padrão');

ALTER TABLE public.tarefa_cadencia_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view tarefa_cadencia_templates" ON public.tarefa_cadencia_templates;
CREATE POLICY "Authenticated can view tarefa_cadencia_templates"
  ON public.tarefa_cadencia_templates FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can manage tarefa_cadencia_templates" ON public.tarefa_cadencia_templates;
CREATE POLICY "Authenticated can manage tarefa_cadencia_templates"
  ON public.tarefa_cadencia_templates FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "service_role_all_tarefa_cadencia_templates" ON public.tarefa_cadencia_templates;
CREATE POLICY "service_role_all_tarefa_cadencia_templates"
  ON public.tarefa_cadencia_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.tarefa_cadencia_templates TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. campanhas — referência ao template de tarefa + snapshot da cadência
--    (tarefa_cadencia_template_id é distinto de cadencia_template_id, que
--     aponta pro sistema de mensagens automáticas)
-- ---------------------------------------------------------------------
ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS tarefa_cadencia_template_id uuid REFERENCES public.tarefa_cadencia_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tarefa_cadencia_passos jsonb;

COMMENT ON COLUMN public.campanhas.tarefa_cadencia_passos IS
  'Snapshot da cadência de TAREFAS manuais [{ordem,canal,rotulo,dia_offset}]. Fonte de verdade do trigger de geração de campanha_lead_tasks. NULL = usa cadência Padrão (retrocompat).';

-- ---------------------------------------------------------------------
-- 4. campanha_lead_tasks — tipos dinâmicos
-- ---------------------------------------------------------------------
ALTER TABLE public.campanha_lead_tasks
  ADD COLUMN IF NOT EXISTS rotulo text;

-- Backfill rótulo a partir do tipo legado (antes de remapear o tipo)
UPDATE public.campanha_lead_tasks SET rotulo = CASE tipo
    WHEN 'whatsapp_1' THEN 'WhatsApp #1'
    WHEN 'whatsapp_2' THEN 'WhatsApp #2'
    WHEN 'whatsapp_3' THEN 'WhatsApp #3'
    WHEN 'email'      THEN 'Email'
    WHEN 'instagram'  THEN 'Instagram'
    WHEN 'telefone'   THEN 'Telefone'
    ELSE initcap(tipo)
  END
WHERE rotulo IS NULL;

-- Soltar as constraints que travam o tipo (CHECK) e o par (campanha_lead_id,tipo).
-- Descobre o nome dinamicamente via pg_constraint pra não depender do nome
-- auto-gerado pelo Postgres (robusto a divergência).
DO $cleanup$
DECLARE
  v_conname text;
BEGIN
  -- CHECK na coluna tipo (definição menciona 'whatsapp_1', exclusivo desse check)
  FOR v_conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.campanha_lead_tasks'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%whatsapp_1%'
  LOOP
    EXECUTE format('ALTER TABLE public.campanha_lead_tasks DROP CONSTRAINT %I', v_conname);
  END LOOP;

  -- UNIQUE exatamente em (campanha_lead_id, tipo)
  FOR v_conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.campanha_lead_tasks'::regclass
      AND contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
             FROM unnest(conkey) AS k(attnum)
             JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k.attnum)
          = ARRAY['campanha_lead_id','tipo']
  LOOP
    EXECUTE format('ALTER TABLE public.campanha_lead_tasks DROP CONSTRAINT %I', v_conname);
  END LOOP;
END
$cleanup$;

-- Remapear tipo legado → código de canal (whatsapp_1/2/3 → whatsapp; telefone → ligacao)
UPDATE public.campanha_lead_tasks SET tipo = CASE
    WHEN tipo IN ('whatsapp_1','whatsapp_2','whatsapp_3') THEN 'whatsapp'
    WHEN tipo = 'telefone' THEN 'ligacao'
    ELSE tipo
  END;

-- Cadência pode ter 2+ passos do mesmo canal → unicidade passa a ser por ordem
DO $uniq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campanha_lead_tasks'::regclass
      AND conname = 'campanha_lead_tasks_campanha_lead_id_ordem_key'
  ) THEN
    ALTER TABLE public.campanha_lead_tasks
      ADD CONSTRAINT campanha_lead_tasks_campanha_lead_id_ordem_key
      UNIQUE (campanha_lead_id, ordem);
  END IF;
END
$uniq$;

COMMENT ON COLUMN public.campanha_lead_tasks.tipo IS
  'Código do canal (FK lógica a task_tipos.codigo). Antes guardava whatsapp_1/2/3 (posicional); agora o canal e o nº fica em rotulo.';

-- ---------------------------------------------------------------------
-- 5. Trigger dinâmico — lê campanhas.tarefa_cadencia_passos com fallback
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_campanha_leads_generate_tasks()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo_envio text;
  v_passos     jsonb;
  v_now        timestamptz := now();
BEGIN
  SELECT tipo_envio, tarefa_cadencia_passos
    INTO v_tipo_envio, v_passos
  FROM public.campanhas
  WHERE id = NEW.campanha_id;

  IF v_tipo_envio IN ('manual', 'ambos') THEN
    -- Fallback: campanha antiga sem cadência configurada usa a Padrão
    IF v_passos IS NULL OR jsonb_typeof(v_passos) <> 'array' OR jsonb_array_length(v_passos) = 0 THEN
      v_passos := '[
        {"ordem":1,"canal":"whatsapp","rotulo":"WhatsApp #1","dia_offset":0},
        {"ordem":2,"canal":"whatsapp","rotulo":"WhatsApp #2","dia_offset":1},
        {"ordem":3,"canal":"email","rotulo":"Email","dia_offset":2},
        {"ordem":4,"canal":"whatsapp","rotulo":"WhatsApp #3","dia_offset":4},
        {"ordem":5,"canal":"instagram","rotulo":"Instagram","dia_offset":6},
        {"ordem":6,"canal":"ligacao","rotulo":"Ligar","dia_offset":8}
      ]'::jsonb;
    END IF;

    INSERT INTO public.campanha_lead_tasks (campanha_lead_id, tipo, rotulo, ordem, prazo_at)
    SELECT
      NEW.id,
      elem->>'canal',
      COALESCE(NULLIF(elem->>'rotulo', ''), initcap(elem->>'canal')),
      COALESCE((elem->>'ordem')::int, idx::int),
      v_now + (COALESCE((elem->>'dia_offset')::int, 0) || ' days')::interval
    FROM jsonb_array_elements(v_passos) WITH ORDINALITY AS arr(elem, idx)
    ON CONFLICT (campanha_lead_id, ordem) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.tg_campanha_leads_generate_tasks IS
  'WS-A — Gera campanha_lead_tasks a partir de campanhas.tarefa_cadencia_passos (snapshot). Fallback pra Padrão se vazio. Só dispara se tipo_envio in (manual, ambos).';
