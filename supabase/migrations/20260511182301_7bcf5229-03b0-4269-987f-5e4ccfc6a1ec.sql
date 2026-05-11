-- 1) Copiar anexos faltantes do pré-contrato 98 (b5908ef5) para o ativo 99 (1944be2b)
INSERT INTO public.contrato_anexos (contrato_id, arquivo_url, arquivo_nome, usuario_nome)
SELECT '1944be2b-cec2-424c-a803-e1de72bf4a55'::uuid,
       a.arquivo_url,
       a.arquivo_nome,
       'Sistema (limpeza duplicata)'
FROM public.contrato_anexos a
WHERE a.contrato_id = 'b5908ef5-dc03-4742-8c1a-2d584e11223a'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM public.contrato_anexos b
    WHERE b.contrato_id = '1944be2b-cec2-424c-a803-e1de72bf4a55'::uuid
      AND (b.arquivo_url = a.arquivo_url OR b.arquivo_nome = a.arquivo_nome)
  );

-- 2) Liberar codigo_interno do pré-contrato (para evitar conflito de unicidade) e deletar o pré-contrato
UPDATE public.contratos
SET codigo_interno = NULL
WHERE id = 'b5908ef5-dc03-4742-8c1a-2d584e11223a'::uuid;

DELETE FROM public.contrato_anexos WHERE contrato_id = 'b5908ef5-dc03-4742-8c1a-2d584e11223a'::uuid;
DELETE FROM public.contratos WHERE id = 'b5908ef5-dc03-4742-8c1a-2d584e11223a'::uuid;

-- 3) Transferir o codigo_interno 98 para o contrato Ativo
UPDATE public.contratos
SET codigo_interno = 98
WHERE id = '1944be2b-cec2-424c-a803-e1de72bf4a55'::uuid;