-- Tabela de acessos a contratos (visualizações, downloads, impressões)
CREATE TABLE IF NOT EXISTS public.contrato_acessos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL,
  usuario_id UUID NOT NULL,
  usuario_nome TEXT NOT NULL,
  tipo_acesso TEXT NOT NULL CHECK (tipo_acesso IN ('visualizar_contrato','visualizar_anexo','baixar_anexo','imprimir','exportar_pdf')),
  anexo_id UUID NULL,
  anexo_nome TEXT NULL,
  ip TEXT NULL,
  user_agent TEXT NULL,
  detalhes JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contrato_acessos_contrato_id ON public.contrato_acessos(contrato_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contrato_acessos_usuario_id ON public.contrato_acessos(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contrato_acessos_tipo ON public.contrato_acessos(tipo_acesso);

ALTER TABLE public.contrato_acessos ENABLE ROW LEVEL SECURITY;

-- Autenticados podem inserir seus próprios registros de acesso
CREATE POLICY "Usuários autenticados podem registrar seus acessos"
ON public.contrato_acessos
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = usuario_id);

-- Autenticados podem ler todos os acessos (mesmo critério que auditoria_logs do módulo contratos)
CREATE POLICY "Usuários autenticados podem visualizar acessos"
ON public.contrato_acessos
FOR SELECT
TO authenticated
USING (true);