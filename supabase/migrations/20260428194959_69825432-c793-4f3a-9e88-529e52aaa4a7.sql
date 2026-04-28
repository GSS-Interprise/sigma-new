-- Delete all data tied to sigzap instance "teste5847"
DO $$
DECLARE
  v_instance_id uuid := 'd201fee5-193c-413f-a75f-cf15099becfa';
  v_conv_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_conv_ids FROM public.sigzap_conversations WHERE instance_id = v_instance_id;

  IF v_conv_ids IS NOT NULL THEN
    DELETE FROM public.sigzap_messages WHERE conversation_id = ANY(v_conv_ids);
  END IF;

  DELETE FROM public.sigzap_conversations WHERE instance_id = v_instance_id;
  DELETE FROM public.sigzap_contacts WHERE instance_id = v_instance_id;
  DELETE FROM public.sigzap_events WHERE instance_id = v_instance_id;
  DELETE FROM public.instance_proxy_settings WHERE instance_id = v_instance_id;
  DELETE FROM public.sigzap_instances WHERE id = v_instance_id;
END $$;