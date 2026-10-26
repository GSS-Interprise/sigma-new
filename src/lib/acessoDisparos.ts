// Liberação individual de Disparos (captacao_permissoes_usuario.pode_acessar_disparos).
// Quem não tem `disparos.visualizar` no perfil, mas tem a chave individual, entra só nestas
// rotas — a central e Chips & Instâncias. O resto do módulo continua exigindo o perfil.
export const ROTAS_ACESSO_INDIVIDUAL_DISPAROS = ["/disparos", "/disparos/config"] as const;

export interface AcessoDisparosInput {
  isAdmin: boolean;
  /** `disparos.visualizar` vindo do perfil (tabela permissoes) */
  podeVerModuloPeloPerfil: boolean;
  /** `pode_acessar_disparos` do usuário */
  acessoIndividual: boolean;
}

export function temAcessoCompletoDisparos({ isAdmin, podeVerModuloPeloPerfil }: AcessoDisparosInput): boolean {
  return isAdmin || podeVerModuloPeloPerfil;
}

export function podeAbrirRotaDisparos(input: AcessoDisparosInput, rota: string): boolean {
  if (temAcessoCompletoDisparos(input)) return true;
  return input.acessoIndividual && (ROTAS_ACESSO_INDIVIDUAL_DISPAROS as readonly string[]).includes(rota);
}
