// Para onde voltar depois do login. Usado pela tela /conectar-claude: o Claude.ai manda o sócio para lá com o pedido
// OAuth na URL; se ele não estiver logado, o login levaria para "/" e o pedido se perderia.
// Só caminho interno ("/x", nunca "//x" nem URL completa), para não virar redirecionamento aberto.
const CHAVE = "sigma_volta_para";

export function guardarVolta(caminho: string) {
  try {
    if (caminho.startsWith("/") && !caminho.startsWith("//")) sessionStorage.setItem(CHAVE, caminho);
  } catch {
    /* sessionStorage bloqueado: o login volta para a Home */
  }
}

export function consumirVolta(): string | null {
  try {
    const v = sessionStorage.getItem(CHAVE);
    sessionStorage.removeItem(CHAVE);
    return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
  } catch {
    return null;
  }
}
