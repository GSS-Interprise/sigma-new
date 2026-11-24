// Chamadas do Supabase Auth que aguentam queda rápida de rede (24/11/2026).
// Caso real: o Wagner clicou em "Enviar link de redefinição" e viu "Failed to fetch". O servidor estava no ar
// (mesma chamada daqui: 200 em 1 s); o navegador dele perdeu a conexão naquele instante (Wi-Fi, VPN, antivírus).
// O supabase-js devolve isso como erro de status 0 (AuthRetryableFetchError), sem chegar ao servidor. Aqui a chamada
// é repetida até 3 vezes e, se ainda falhar, a mensagem diz o que houve em português em vez de "Failed to fetch".

type ComErro = { error: { message?: string; status?: number; name?: string } | null };

export function erroDeRede(error: { message?: string; status?: number; name?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = String(error.message || "");
  return error.name === "AuthRetryableFetchError" || error.status === 0
    || /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
}

export const MSG_SEM_CONEXAO =
  "Não foi possível falar com o Sigma agora (conexão instável). Confira a internet e tente de novo em instantes.";

export async function comRetryDeRede<T extends ComErro>(chamada: () => Promise<T>, tentativas = 3): Promise<T> {
  let r = await chamada().catch((e) => ({ error: e }) as T);
  for (let i = 1; i < tentativas && erroDeRede(r.error); i++) {
    await new Promise((ok) => setTimeout(ok, 800 * i));
    r = await chamada().catch((e) => ({ error: e }) as T);
  }
  return r;
}

export function mensagemErroAuth(error: { message?: string } | null | undefined, padrao: string): string {
  if (erroDeRede(error as any)) return MSG_SEM_CONEXAO;
  return error?.message || padrao;
}
