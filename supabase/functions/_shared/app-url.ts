// Endereço público do front do Sigma, num lugar só (preparação da saída do Lovable para a Vercel, 16/11/2026).
//
// Todo link que uma edge monta para a pessoa abrir (e-mail, aviso no WhatsApp, volta de OAuth, tela de aprovação do
// Claude) parte daqui. Para trocar o domínio: `npx supabase secrets set APP_URL=https://<domínio novo>` e publicar as
// edges que importam este arquivo. Sem o segredo, vale o endereço do Lovable (comportamento de antes).
//
// Configurações do banco que guardam um endereço próprio (config_lista_items: financeiro_nf_link_base,
// email_campanha_link_base, contaazul/gmail) continuam tendo prioridade onde já tinham; trocar lá também na virada.

/** Endereço do Lovable: padrão enquanto APP_URL não existir e origem aceita durante a transição. */
export const APP_URL_LOVABLE = "https://sigma-gss.lovable.app";

/** Endereço público do front, sem barra no fim. */
export function appUrl(): string {
  return (Deno.env.get("APP_URL") || APP_URL_LOVABLE).trim().replace(/\/+$/, "");
}
