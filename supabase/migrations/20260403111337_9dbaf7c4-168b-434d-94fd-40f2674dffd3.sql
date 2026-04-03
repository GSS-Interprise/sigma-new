
-- Import 36 auth.users with original UUIDs
-- All users get temporary password: TempPass2026!

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at, confirmation_token,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'dd9e3c9f-ad54-4843-a686-0142ca997eac', 'authenticated', 'authenticated', 'raul.sxs27@gmail.com', crypt('TempPass2026!', gen_salt('bf')), '2026-03-10T22:03:20.708423Z', '2026-03-10T22:03:20.64227Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '97ed2a13-9005-469f-9202-7bc1cfbf8b9e', 'authenticated', 'authenticated', 'amanda.almeida@gestaodeservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2026-02-24T16:54:27.174538Z', '2026-02-24T16:54:27.067019Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'faf883a8-7df2-4123-acc2-ab0de7f4fa70', 'authenticated', 'authenticated', 'arthur.rhc@gmail.com', crypt('TempPass2026!', gen_salt('bf')), '2026-02-24T16:40:47.155165Z', '2026-02-24T16:40:47.075042Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '06046288-ea1e-43c9-935f-7ea41e7bef5e', 'authenticated', 'authenticated', 'diego@fredsouza.com', crypt('TempPass2026!', gen_salt('bf')), '2026-02-13T14:30:59.402547Z', '2026-02-13T14:30:59.291934Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'fe8eaf35-4ac2-4f99-b977-202b43ac6142', 'authenticated', 'authenticated', 'pablo@fredsouza.com', crypt('TempPass2026!', gen_salt('bf')), '2026-02-13T12:41:34.269833Z', '2026-02-13T12:41:34.109484Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '3952f9c4-16ce-435c-a008-01fb1f8e80a3', 'authenticated', 'authenticated', 'daniele@fredsouza.com', crypt('TempPass2026!', gen_salt('bf')), '2026-02-12T16:57:22.648182Z', '2026-02-12T16:57:22.559982Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a70c3147-c3eb-4aee-8285-98afc86c9420', 'authenticated', 'authenticated', 'roberto.filho@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2026-02-09T17:43:24.995144Z', '2026-02-09T17:43:24.887557Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '586b0bf2-c2b9-4567-ae0d-9ed1f0cb8920', 'authenticated', 'authenticated', 'robertowhistle@gmail.com', crypt('TempPass2026!', gen_salt('bf')), '2026-02-09T16:58:38.51496Z', '2026-02-09T16:58:38.433734Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'dfe5defb-39c7-457d-ad26-2e463d4cdb58', 'authenticated', 'authenticated', 'felipe.graeff@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2026-01-21T18:59:46.479016Z', '2026-01-21T18:59:46.293591Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '6aa34a7f-eae0-4c72-8620-86ba6a08849e', 'authenticated', 'authenticated', 'drdouglasbarbosa86@gmail.com', crypt('TempPass2026!', gen_salt('bf')), '2026-01-15T17:10:21.477506Z', '2026-01-15T17:10:21.378986Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '18700581-4a05-4b28-81e3-88921c3f9f1d', 'authenticated', 'authenticated', 'kezia.jaqueline@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-12-10T19:07:17.411448Z', '2025-12-10T19:07:17.331352Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '45195808-18e5-4e53-8bba-d1149da93ebd', 'authenticated', 'authenticated', 'brenda.rezende@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-12-09T17:25:13.508109Z', '2025-12-09T17:25:13.404173Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'f0f9f0a2-24fc-435b-a69b-5b42820ec8da', 'authenticated', 'authenticated', 'kayky.souza@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-12-09T12:23:57.487329Z', '2025-12-09T12:23:57.288743Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '1791105a-2b6e-4538-b193-84b97911803a', 'authenticated', 'authenticated', 'ester.perao@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-12-09T12:16:14.858604Z', '2025-12-09T12:16:14.785749Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '4a882ce9-5ae2-43e7-b1a7-6668686a8c71', 'authenticated', 'authenticated', 'sarah.reis@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-12-09T11:59:10.425033Z', '2025-12-09T11:59:10.334057Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'af473dba-514d-4c75-9269-27f1b500c2cd', 'authenticated', 'authenticated', 'erika.antunes@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-12-09T11:47:02.259518Z', '2025-12-09T11:47:02.117558Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'cdadef34-3904-4aad-adf9-b3f422de8518', 'authenticated', 'authenticated', 'ulisses.moraes@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-12-05T16:36:09.746706Z', '2025-12-05T16:36:09.575405Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '34f97f5a-455d-4be4-8cf2-6cfa5706adcf', 'authenticated', 'authenticated', 'maria.vitoria@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-11-17T17:04:09.258056Z', '2025-11-17T17:04:09.18182Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a8c8feab-523c-4905-a905-308670380c76', 'authenticated', 'authenticated', 'financeiro@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-11-17T14:42:20.001009Z', '2025-11-17T14:42:19.942229Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '11d70a5b-11c2-4651-8521-de3c8a00a2b4', 'authenticated', 'authenticated', 'sarah.oliveira@agesaude.org.br', crypt('TempPass2026!', gen_salt('bf')), '2025-11-14T14:42:28.445896Z', '2025-11-14T14:42:28.341839Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '5b85ea6b-34a6-45ef-81bb-ddd58b695445', 'authenticated', 'authenticated', 'drmaikonmadeiragss@gmail.com', crypt('TempPass2026!', gen_salt('bf')), '2025-11-14T14:33:03.910613Z', '2025-11-14T14:33:03.832801Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '3adafddc-3d23-40c6-8ce0-5ddf0d3aef0b', 'authenticated', 'authenticated', 'luana.barros@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-11-11T11:51:18.009929Z', '2025-11-11T11:51:17.97021Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c9d41fe7-f0dc-4941-8491-59e9551a81d8', 'authenticated', 'authenticated', 'emmily.santos@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-11-11T11:49:33.340078Z', '2025-11-11T11:49:33.184584Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '17101e3b-8795-490c-8b91-8aa29be3677e', 'authenticated', 'authenticated', 'bruna.pereira@gestaoservicosaude.com', crypt('TempPass2026!', gen_salt('bf')), '2025-11-10T11:28:54.047372Z', '2025-11-10T11:28:53.914448Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '7b2fea38-3b27-4818-b61d-4b1a5564b7a8', 'authenticated', 'authenticated', 'danilo.souza@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-10-23T19:22:41.69098Z', '2025-10-23T19:22:41.670078Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '901fb3ea-057d-47f6-b087-bd18fb0deafa', 'authenticated', 'authenticated', 'ricardo.fagundes@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-10-23T19:11:26.508985Z', '2025-10-23T19:11:26.45992Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'eb117c6a-2ae2-4be7-9bcf-6c271e7ef1fe', 'authenticated', 'authenticated', 'suporte@fredsouza.com', crypt('TempPass2026!', gen_salt('bf')), '2025-10-17T18:38:57.234443Z', '2025-10-17T18:38:57.193667Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '5fc86254-ee42-4afb-b9da-c143d68c5995', 'authenticated', 'authenticated', 'bianca.santos@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-10-09T19:17:15.099984Z', '2025-10-09T19:17:15.065177Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '77468374-6efb-429e-ac8f-1141a22457e0', 'authenticated', 'authenticated', 'cadastro@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-10-09T17:52:08.203779Z', '2025-10-09T17:52:08.111651Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '9bcc555a-486c-49ba-8e82-2496d668d2fc', 'authenticated', 'authenticated', 'antonia.verdum@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-10-09T16:46:44.833038Z', '2025-10-09T16:46:44.752242Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'b822d017-cef8-4f50-8057-51e36f15ae9f', 'authenticated', 'authenticated', 'ewerton.monteiro@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-10-09T12:19:33.500144Z', '2025-10-09T12:19:33.457426Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c10597fc-38e0-409c-8473-a231b2043c8e', 'authenticated', 'authenticated', 'teste@gss.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-10-07T16:41:18.329554Z', '2025-10-07T16:41:18.290855Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '2e0c9567-8867-47d0-8314-d61278be30c3', 'authenticated', 'authenticated', 'maikon.madeira@gmail.com', crypt('TempPass2026!', gen_salt('bf')), '2025-10-04T18:52:49.981856Z', '2025-10-04T18:52:49.941977Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a23cf841-d9f1-4131-905b-765d712c5f80', 'authenticated', 'authenticated', 'ramone.oliveira@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-10-03T19:43:07.671354Z', '2025-10-03T19:43:07.631927Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'f153b76a-c765-4532-9e4c-60981e1c9cc0', 'authenticated', 'authenticated', 'yrodrigues@hotmail.com', crypt('TempPass2026!', gen_salt('bf')), '2025-10-03T11:53:17.469481Z', '2025-10-03T11:53:17.272885Z', now(), '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '5842d696-5e72-4798-9e5a-eb5d8268998a', 'authenticated', 'authenticated', 'bi@gestaoservicosaude.com.br', crypt('TempPass2026!', gen_salt('bf')), '2025-10-02T17:30:22.581703Z', '2025-10-02T17:30:22.555484Z', now(), '', '{"provider":"email","providers":["email"]}', '{}')
ON CONFLICT (id) DO NOTHING;

-- Create identities for each user (required for email/password login)
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT id, id, email, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), created_at, now()
FROM auth.users
WHERE id IN (
  'dd9e3c9f-ad54-4843-a686-0142ca997eac', '97ed2a13-9005-469f-9202-7bc1cfbf8b9e',
  'faf883a8-7df2-4123-acc2-ab0de7f4fa70', '06046288-ea1e-43c9-935f-7ea41e7bef5e',
  'fe8eaf35-4ac2-4f99-b977-202b43ac6142', '3952f9c4-16ce-435c-a008-01fb1f8e80a3',
  'a70c3147-c3eb-4aee-8285-98afc86c9420', '586b0bf2-c2b9-4567-ae0d-9ed1f0cb8920',
  'dfe5defb-39c7-457d-ad26-2e463d4cdb58', '6aa34a7f-eae0-4c72-8620-86ba6a08849e',
  '18700581-4a05-4b28-81e3-88921c3f9f1d', '45195808-18e5-4e53-8bba-d1149da93ebd',
  'f0f9f0a2-24fc-435b-a69b-5b42820ec8da', '1791105a-2b6e-4538-b193-84b97911803a',
  '4a882ce9-5ae2-43e7-b1a7-6668686a8c71', 'af473dba-514d-4c75-9269-27f1b500c2cd',
  'cdadef34-3904-4aad-adf9-b3f422de8518', '34f97f5a-455d-4be4-8cf2-6cfa5706adcf',
  'a8c8feab-523c-4905-a905-308670380c76', '11d70a5b-11c2-4651-8521-de3c8a00a2b4',
  '5b85ea6b-34a6-45ef-81bb-ddd58b695445', '3adafddc-3d23-40c6-8ce0-5ddf0d3aef0b',
  'c9d41fe7-f0dc-4941-8491-59e9551a81d8', '17101e3b-8795-490c-8b91-8aa29be3677e',
  '7b2fea38-3b27-4818-b61d-4b1a5564b7a8', '901fb3ea-057d-47f6-b087-bd18fb0deafa',
  'eb117c6a-2ae2-4be7-9bcf-6c271e7ef1fe', '5fc86254-ee42-4afb-b9da-c143d68c5995',
  '77468374-6efb-429e-ac8f-1141a22457e0', '9bcc555a-486c-49ba-8e82-2496d668d2fc',
  'b822d017-cef8-4f50-8057-51e36f15ae9f', 'c10597fc-38e0-409c-8473-a231b2043c8e',
  '2e0c9567-8867-47d0-8314-d61278be30c3', 'a23cf841-d9f1-4131-905b-765d712c5f80',
  'f153b76a-c765-4532-9e4c-60981e1c9cc0', '5842d696-5e72-4798-9e5a-eb5d8268998a'
)
ON CONFLICT DO NOTHING;
