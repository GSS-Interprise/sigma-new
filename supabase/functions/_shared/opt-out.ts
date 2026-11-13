// Bloqueio por opt-out ("SAIR") compartilhado entre o descadastro e a IA das campanhas. Fica fora dos index.ts
// para ter teste: em 12/11 o médico mandou "Sir" e "Sair" 3 s depois, o descadastro rodou e a IA respondeu mesmo
// assim (a revalidação só rodava com conversation_id e o bloqueio gravado sem o 9 não casava com o lead).

// Telefone que vai para a blacklist. O WhatsApp manda celular antigo sem o 9 (55 41 9198-2008); o lead está com
// o 9 (+55 41 99198-2008). Sem normalizar, o bloqueio não casava com o lead e leads.opt_out ficava falso.
// Celular de 8 dígitos começando em 6-9 ganha o 9.
export function telefoneBloqueioE164(phone: string): string {
  const phoneDigits = String(phone).replace(/\D/g, "");
  let local = phoneDigits.startsWith("55") ? phoneDigits.slice(2) : phoneDigits;
  if (local.length === 10 && /^[6-9]$/.test(local[2])) local = local.slice(0, 2) + "9" + local.slice(2);
  return `+55${local}`;
}

// Formas do mesmo telefone procuradas na blacklist: como chegou e com/sem o 9, porque há bloqueios antigos
// gravados sem o 9.
export function variantesTelefoneBloqueio(phoneDigits: string): string[] {
  const semPais = phoneDigits.replace(/^55/, "");
  return [
    semPais,
    semPais.length === 10
      ? semPais.slice(0, 2) + "9" + semPais.slice(2)
      : semPais.length === 11
      ? semPais.slice(0, 2) + semPais.slice(3)
      : semPais,
  ].map((d) => `+55${d}`);
}

// Só o pedaço do supabase-js que a revalidação usa; o teste passa um banco em memória com a mesma forma.
export type Linha = Record<string, unknown>;
export interface ConsultaLeitura extends PromiseLike<{ data: Linha[] | null }> {
  select(colunas: string): ConsultaLeitura;
  eq(coluna: string, valor: unknown): ConsultaLeitura;
  in(coluna: string, valores: unknown[]): ConsultaLeitura;
  limit(n: number): ConsultaLeitura;
  maybeSingle(): PromiseLike<{ data: Linha | null }>;
}
export interface ClienteLeitura {
  from(tabela: string): ConsultaLeitura;
}

// Revalida logo antes de enviar a resposta da IA: o "SAIR" pode ter chegado enquanto o modelo gerava texto
// (~30 s). Cancela a rodada se a campanha do lead foi encerrada, se o telefone está na blacklist (qualquer
// campanha) ou se o lead está com opt_out.
export async function rodadaCanceladaPorOptOut(
  supabase: ClienteLeitura,
  { campanhaLeadId, leadId, phoneDigits }: { campanhaLeadId: string; leadId: string; phoneDigits: string },
): Promise<boolean> {
  const { data: latestLeadState } = await supabase
    .from("campanha_leads")
    .select("status")
    .eq("id", campanhaLeadId)
    .maybeSingle();
  const { data: bloqueado } = await supabase.from("blacklist").select("id")
    .in("phone_e164", variantesTelefoneBloqueio(phoneDigits)).limit(1);
  const { data: optOut } = await supabase.from("leads").select("opt_out").eq("id", leadId).maybeSingle();
  return latestLeadState?.status === "descartado" || (bloqueado?.length ?? 0) > 0 || optOut?.opt_out === true;
}
