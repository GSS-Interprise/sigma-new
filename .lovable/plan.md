

## Adicionar botão "Disparo Manual" no header do SIG Zap

### O que muda
No header da página `/disparos-sigzap`, adicionar um novo botão **"Disparo Manual"** ao lado dos botões existentes ("Corrigir duplicados" e "Configurações").

### Layout do header (depois)
```text
[ícone] SIG Zap                [Disparo Manual] [Corrigir duplicados] [Configurações]
        Atendimento WhatsApp
```

### Comportamento
Preciso confirmar 1 ponto antes de implementar a ação do botão — o visual eu já deixo pronto.

**O que o "Disparo Manual" deve fazer ao clicar?**
- (a) Abrir um modal pra digitar número + mensagem e enviar manualmente via instância selecionada (one-shot, fora de campanha).
- (b) Navegar pra outra página existente (ex: `/disparos-zap` ou `/disparos-campanhas`).
- (c) Só deixar o botão pronto agora (sem ação / `console.log`) e a gente liga depois.

### Arquivos
- `src/pages/DisparosSigZap.tsx` — adicionar `<Button>` com ícone `Send` no `headerActions`, posicionado antes de "Corrigir duplicados".
- (se opção **a**) `src/components/sigzap/DisparoManualDialog.tsx` — novo modal com campos `telefone`, `mensagem`, seletor de instância (reusa as `selectedInstanceIds`) e envio via edge function `send-sigzap-message`.
- (se opção **b**) apenas `useNavigate` no botão.

### Fora desta etapa
- Disparo em massa (já existe em `/disparos-zap`).
- Templates / mídia no disparo manual (pode ser próximo passo se for opção a).

