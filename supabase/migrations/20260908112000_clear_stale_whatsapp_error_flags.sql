-- Um envio posterior confirmado pode ter deixado o erro da tentativa anterior
-- no card. Isso fazia a UI parecer bloqueada mesmo com a mensagem entregue.
UPDATE public.campanha_leads
SET ultimo_erro_codigo = NULL,
    ultimo_erro_mensagem = NULL,
    erro_envio = NULL,
    updated_at = now()
WHERE envio_status = 'confirmed'
  AND ultimo_erro_codigo IS NOT NULL;
