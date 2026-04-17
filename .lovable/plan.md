
## Plano: Refatorar Proposta — Mensagens por Canal + Mover Vínculos para Campanhas

### Entendimento

1. **Hoje**: `proposta` tem `tipo_disparo` (WhatsApp/Email) + uma única `mensagem`. O `CaptacaoPropostaDialog` permite escolher o canal e escrever 1 mensagem.
2. **Mudança pedida**:
   - Remover o conceito de "tipo de disparo" da proposta.
   - Adicionar **abas de mensagem por canal**: WhatsApp, Email, Instagram, LinkedIn, TikTok (5 abas).
   - Cada mensagem pode ser `null`.
   - **Somente admin** pode editar essas mensagens. Outros usuários veem em modo read-only.
   - **Vínculo de propostas a leads/disparos não acontece mais aqui** — agora é exclusivamente via Campanhas (`campanha_propostas`).

### Investigação ainda necessária (farei na execução)

- Confirmar colunas atuais em `proposta` (provavelmente `tipo_disparo`, `mensagem`).
- Identificar todos os lugares que leem `tipo_disparo` / `mensagem` para migrar sem quebrar (LeadPropostasSection, CaptacaoPropostaDetailDialog, CaptacaoPropostasTab, etc).
- Verificar fluxo de "vincular proposta a lead" para removê-lo do dialog principal.

### Migração de dados (sem perda)

```sql
ALTER TABLE proposta
  ADD COLUMN mensagem_whatsapp text,
  ADD COLUMN mensagem_email     text,
  ADD COLUMN mensagem_instagram text,
  ADD COLUMN mensagem_linkedin  text,
  ADD COLUMN mensagem_tiktok    text;

-- Preserva conteúdo atual baseado no tipo_disparo
UPDATE proposta SET mensagem_whatsapp = mensagem
  WHERE LOWER(COALESCE(tipo_disparo,'')) = 'whatsapp' AND mensagem IS NOT NULL;
UPDATE proposta SET mensagem_email = mensagem
  WHERE LOWER(COALESCE(tipo_disparo,'')) = 'email'    AND mensagem IS NOT NULL;
-- Fallback: se tipo_disparo era null mas tinha mensagem, vai pra whatsapp
UPDATE proposta SET mensagem_whatsapp = mensagem
  WHERE mensagem_whatsapp IS NULL
    AND mensagem_email    IS NULL
    AND mensagem IS NOT NULL;
```

`tipo_disparo` e `mensagem` ficam mantidas por enquanto (legado/segurança); marcamos como deprecated e removemos do UI.

### Edição restrita a admin (RLS)

Adicionar policy de UPDATE em `proposta` que permite alterar as 5 colunas `mensagem_*` apenas se `is_admin(auth.uid())`. As outras colunas seguem regra atual.
Mais simples: enforce no front (campos `disabled` quando não-admin) + uma policy UPDATE adicional que exige admin quando qualquer `mensagem_*` mudou — via trigger BEFORE UPDATE que rejeita se non-admin tentar mudar essas colunas.

```sql
CREATE OR REPLACE FUNCTION proposta_protect_mensagens()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    IF NEW.mensagem_whatsapp IS DISTINCT FROM OLD.mensagem_whatsapp
    OR NEW.mensagem_email    IS DISTINCT FROM OLD.mensagem_email
    OR NEW.mensagem_instagram IS DISTINCT FROM OLD.mensagem_instagram
    OR NEW.mensagem_linkedin IS DISTINCT FROM OLD.mensagem_linkedin
    OR NEW.mensagem_tiktok   IS DISTINCT FROM OLD.mensagem_tiktok THEN
      RAISE EXCEPTION 'Apenas administradores podem editar mensagens da proposta';
    END IF;
  END IF;
  RETURN NEW;
END$$;
CREATE TRIGGER trg_proposta_protect_mensagens
  BEFORE UPDATE ON proposta FOR EACH ROW
  EXECUTE FUNCTION proposta_protect_mensagens();
```

### Mudanças no front

**`CaptacaoPropostaDialog.tsx`** (criação)
- Remover bloco "Tipo de Disparo" (Select WhatsApp/Email).
- Substituir o textarea único por um componente `<MensagensCanaisTabs />` com 5 abas (WhatsApp, Email, Instagram, LinkedIn, TikTok), cada uma com Textarea opcional.
- No `INSERT`, gravar `mensagem_whatsapp`, `mensagem_email`, etc. Não enviar mais `tipo_disparo` nem `mensagem`.
- Se usuário **não-admin** abrir o dialog de criação: textareas ficam `disabled` com aviso "Somente administradores editam mensagens".

**`CaptacaoPropostaDetailDialog.tsx`** (visualização/edição)
- Substituir o campo único de mensagem pelas mesmas 5 abas.
- Cada Textarea só editável se `isAdmin && isEditing`.
- Salvar grava as 5 colunas.

**Novo componente** `src/components/disparos/MensagensCanaisTabs.tsx`
- Props: `values`, `onChange`, `readOnly`, ícones de marca (reutiliza `BrandIcons.tsx`).
- Renderiza Tabs com 5 abas + Textarea.

**Remover vínculo proposta↔lead daqui**
- Em `CaptacaoPropostaDialog` / `CaptacaoPropostaDetailDialog`: remover qualquer botão/ação de "vincular a lead". Adicionar aviso curto: *"Vínculos agora são feitos via Campanhas"*.
- `LeadPropostasSection` / `VincularPropostaExistenteDialog`: manter apenas leitura das propostas já vinculadas; remover botão "Vincular proposta existente" e "Nova proposta a partir do lead". Mostrar mensagem orientando uso de Campanhas.

**Onde a mensagem é usada para envio**
- Buscar usos de `proposta.mensagem` em edge functions/disparos e adaptar para escolher a coluna correta conforme o canal sendo disparado (ex.: tráfego pago/whatsapp usa `mensagem_whatsapp`, email usa `mensagem_email`, etc.). Identificar na execução.

### Permissões — uso do hook
- Usar `usePermissions().isAdmin` (já existente) no front para bloquear edição.

### Etapas de execução

1. Migration: adicionar 5 colunas + copiar dados + trigger de proteção admin.
2. Criar `MensagensCanaisTabs.tsx`.
3. Refatorar `CaptacaoPropostaDialog.tsx` (remover tipo de disparo, usar abas, gravar 5 colunas).
4. Refatorar `CaptacaoPropostaDetailDialog.tsx` (abas + read-only para não-admin).
5. Remover/ocultar fluxo de vínculo proposta↔lead em `LeadPropostasSection` e dialogs relacionados.
6. Ajustar edge functions/hooks que enviam mensagens para usar a coluna correta por canal.
7. Testar criação, edição (admin vs não-admin) e visualização.

### Detalhes técnicos relevantes

- Mantemos `tipo_disparo` e `mensagem` no schema temporariamente para não quebrar código legado durante a transição; após validação podemos remover em migration futura.
- O trigger garante segurança no banco mesmo se UI for burlada.
- Ícones reutilizam `src/components/disparos/icons/BrandIcons.tsx`.
