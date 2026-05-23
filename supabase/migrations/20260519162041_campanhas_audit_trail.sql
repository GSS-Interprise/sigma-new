-- =====================================================================
-- Audit trail pra campanhas: quem criou, quem editou, quando, o quê
--
-- Contexto: descobrimos campanhas fantasma criadas sem responsável
-- (DISPARO UROLOGISTA - NAVEGANTES, 3 da reunião GSS 19/05 deletadas).
-- Tabela campanhas hoje não rastreia created_by/updated_by.
--
-- Solução em 2 camadas:
--  1. Colunas created_by, created_by_name, updated_by, updated_by_name
--     na própria tabela campanhas (visão "última edição")
--  2. Tabela campanhas_history com snapshot de cada INSERT/UPDATE/DELETE
--     (audit log completo, navegável por campanha)
--
-- Captura via auth.uid() do JWT da request. Se request vier via
-- service_role (script/API admin), fica NULL — esperado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas de auditoria na tabela campanhas
-- ---------------------------------------------------------------------
ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_name text;

CREATE INDEX IF NOT EXISTS idx_campanhas_created_by ON public.campanhas(created_by);
CREATE INDEX IF NOT EXISTS idx_campanhas_updated_by ON public.campanhas(updated_by);

COMMENT ON COLUMN public.campanhas.created_by IS 'auth.users.id de quem criou (auth.uid() no INSERT). NULL se criada via service_role.';
COMMENT ON COLUMN public.campanhas.updated_by IS 'auth.users.id de quem editou por último.';
COMMENT ON COLUMN public.campanhas.created_by_name IS 'Snapshot do nome do criador (resiliente a delete de profile).';

-- ---------------------------------------------------------------------
-- 2. Tabela history (snapshot de cada mudança)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campanhas_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id     uuid NOT NULL,
  campanha_nome   text,
  action          text NOT NULL CHECK (action IN ('insert','update','delete')),
  snapshot_antes  jsonb,
  snapshot_depois jsonb,
  changed_fields  text[],
  changed_by      uuid REFERENCES auth.users(id),
  changed_by_name text,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campanhas_history_campanha ON public.campanhas_history(campanha_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_campanhas_history_changed_by ON public.campanhas_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_campanhas_history_action ON public.campanhas_history(action);

COMMENT ON TABLE public.campanhas_history IS
  'Audit log de toda mudança em campanhas (insert/update/delete). Snapshots antes/depois + diff de campos. Pra rastrear quem mexeu em que.';

-- ---------------------------------------------------------------------
-- 3. Trigger BEFORE: seta os campos de auditoria
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_campanhas_set_audit_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_name text;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT nome_completo INTO v_user_name FROM public.profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by      := COALESCE(NEW.created_by, v_user_id);
    NEW.created_by_name := COALESCE(NEW.created_by_name, v_user_name);
    NEW.updated_by      := NEW.created_by;
    NEW.updated_by_name := NEW.created_by_name;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by      := COALESCE(v_user_id, OLD.updated_by);
    NEW.updated_by_name := COALESCE(v_user_name, OLD.updated_by_name);
    NEW.updated_at      := now();
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS campanhas_set_audit_fields ON public.campanhas;
CREATE TRIGGER campanhas_set_audit_fields
  BEFORE INSERT OR UPDATE ON public.campanhas
  FOR EACH ROW EXECUTE FUNCTION public.trg_campanhas_set_audit_fields();

-- ---------------------------------------------------------------------
-- 4. Trigger AFTER: registra snapshot no history
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_campanhas_log_history()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_action text;
  v_user_id uuid := auth.uid();
  v_user_name text;
  v_changed text[];
  v_old_json jsonb;
  v_new_json jsonb;
  v_key text;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT nome_completo INTO v_user_name FROM public.profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.campanhas_history (
      campanha_id, campanha_nome, action, snapshot_depois, changed_by, changed_by_name
    ) VALUES (
      NEW.id, NEW.nome, 'insert', to_jsonb(NEW), NEW.created_by, NEW.created_by_name
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD) - 'updated_at' - 'updated_by' - 'updated_by_name';
    v_new_json := to_jsonb(NEW) - 'updated_at' - 'updated_by' - 'updated_by_name';

    -- Identifica campos modificados (skip os de auditoria que sempre mudam)
    v_changed := ARRAY[]::text[];
    FOR v_key IN SELECT jsonb_object_keys(v_new_json)
    LOOP
      IF v_old_json->v_key IS DISTINCT FROM v_new_json->v_key THEN
        v_changed := array_append(v_changed, v_key);
      END IF;
    END LOOP;

    -- Só registra se houve mudança real (evita ruído de save sem alteração)
    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.campanhas_history (
        campanha_id, campanha_nome, action,
        snapshot_antes, snapshot_depois, changed_fields,
        changed_by, changed_by_name
      ) VALUES (
        NEW.id, NEW.nome, 'update',
        to_jsonb(OLD), to_jsonb(NEW), v_changed,
        NEW.updated_by, NEW.updated_by_name
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.campanhas_history (
      campanha_id, campanha_nome, action, snapshot_antes,
      changed_by, changed_by_name
    ) VALUES (
      OLD.id, OLD.nome, 'delete', to_jsonb(OLD),
      v_user_id, v_user_name
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS campanhas_log_history ON public.campanhas;
CREATE TRIGGER campanhas_log_history
  AFTER INSERT OR UPDATE OR DELETE ON public.campanhas
  FOR EACH ROW EXECUTE FUNCTION public.trg_campanhas_log_history();

-- ---------------------------------------------------------------------
-- 5. View pra consulta rápida (top 100 mudanças recentes, legível)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_campanhas_audit_recent AS
SELECT
  h.changed_at,
  h.campanha_nome,
  h.action,
  COALESCE(h.changed_by_name, '(service_role/sistema)') AS quem,
  array_to_string(h.changed_fields, ', ') AS campos_alterados,
  h.campanha_id,
  h.changed_by
FROM public.campanhas_history h
ORDER BY h.changed_at DESC
LIMIT 100;

COMMENT ON VIEW public.vw_campanhas_audit_recent IS
  'Top 100 mudanças recentes em campanhas. Quem fez o quê quando. SELECT * pra ver tudo.';

-- ---------------------------------------------------------------------
-- 6. GRANTs (lição do incidente 18/05 — sempre explícito)
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT ON public.campanhas_history TO authenticated, service_role;
GRANT SELECT ON public.vw_campanhas_audit_recent TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. RLS — qualquer autenticado lê o histórico
-- ---------------------------------------------------------------------
ALTER TABLE public.campanhas_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campanhas_history_read ON public.campanhas_history;
CREATE POLICY campanhas_history_read
  ON public.campanhas_history FOR SELECT TO authenticated USING (true);

-- INSERT só via trigger (não exposto pra usuário escrever direto)
-- Não criar policy de INSERT/UPDATE/DELETE — fica restrito ao trigger.

-- ---------------------------------------------------------------------
-- 8. Seed inicial: registra "estado descoberto" no history pras campanhas
--    ativas existentes, pra ter ponto de partida visível
-- ---------------------------------------------------------------------
INSERT INTO public.campanhas_history (
  campanha_id, campanha_nome, action, snapshot_depois,
  changed_by_name, changed_at
)
SELECT
  c.id, c.nome, 'insert', to_jsonb(c),
  '(snapshot inicial — created_by desconhecido)',
  c.created_at
FROM public.campanhas c
WHERE c.status = 'ativa'
  AND NOT EXISTS (
    SELECT 1 FROM public.campanhas_history h WHERE h.campanha_id = c.id
  );
