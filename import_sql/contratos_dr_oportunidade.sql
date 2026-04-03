INSERT INTO "contratos_dr_oportunidade" ("id", "codigo_interno", "codigo_contrato", "cliente_id", "unidade_id", "medico_id", "licitacao_origem_id", "data_inicio", "data_fim", "data_termino", "prazo_meses", "valor_estimado", "tipo_servico", "tipo_contratacao", "especialidade_contrato", "objeto_contrato", "condicao_pagamento", "documento_url", "status_contrato", "assinado", "motivo_pendente", "dias_aviso_vencimento", "created_at", "updated_at") VALUES
('30e356a7-6f90-4ffb-b5c0-70271357121a', '1', 'CT S/N', '6be3dc42-11c9-4f74-ac41-1ce510eae6e6', 'b45882b8-7134-4b64-9802-ae9721f64772', NULL, NULL, '2025-03-19T00:00:00.000Z', '2026-03-18T00:00:00.000Z', '2026-03-18T00:00:00.000Z', '12', '1440', '["Escala Médica"]', 'direta_privada', NULL, 'O presente contrato tem por objeto a licença de uso, pela CONTRATANTE, do software de gestão de escalas (“Dr. Escala”) desenvolvido e mantido pela CONTRATADA, bem como a prestação de serviços de suporte técnico e manutenção corretiva durante a vigência do contrato.

DATA DE ASSINATURA: 14/03/2025

DATA DE IMPLEMENTAÇÃO: 18/03/2025

DATA DE INICIO DOS SERVIÇOS: 18/03/2025

VALOR MENSAL: R$ 1.440,00

INICIO DAS COBRANÇAS MENSAIS: 01/04/2025

E-MAIL DE ENVIO DE COBRANÇA: financeiro@hsan.com.br', NULL, 'https://qyapnxtghhdcfafnogii.supabase.co/storage/v1/object/public/contratos-documentos/1767899315023-CONTRATO_-_DR_ESCALA_X_HSA.pdf', 'Ativo', 'Sim', NULL, '60', '2026-01-08T19:08:35.776Z', '2026-01-08T19:09:09.924Z'),
('f0e813db-a1f9-40cb-b2d6-da26aff993c7', '2', 'CT 561/2025', '961a6f37-355a-4a8f-88ee-1c18928df581', '5623b535-31b5-4ee6-8318-9c3fe6b0eda8', NULL, NULL, '2025-04-25T00:00:00.000Z', '2026-04-24T00:00:00.000Z', '2026-04-24T00:00:00.000Z', '12', '3400', '["Escala Médica"]', 'dispensa', NULL, 'prestação de serviço de empresa especializada em locação de software como serviço (SAAS – Software As A Service), para suporte às atividades de gestão de escala de plantão, incluindo a disponibilização mensal de acesso, parametrização e adequação do acesso e uso do sistema, treinamento, manutenção, e suporte técnico remoto, nas condições estabelecidas no Termo de Referência e demais anexos deste contrato.', NULL, 'https://qyapnxtghhdcfafnogii.supabase.co/storage/v1/object/public/contratos-documentos/1767900190880-DR_OPORTUNIDADE_LTDA_CONTRATO_-_DISPENSA_ELETRONICA_N__94194__1___1_.pdf', 'Ativo', 'Sim', NULL, '60', '2026-01-08T19:23:13.644Z', '2026-04-02T14:07:23.768Z')
ON CONFLICT (id) DO NOTHING;
