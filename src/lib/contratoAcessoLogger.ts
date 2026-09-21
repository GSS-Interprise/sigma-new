import { supabase } from "@/integrations/supabase/client";

export type TipoAcessoContrato =
  | "visualizar_contrato"
  | "visualizar_anexo"
  | "baixar_anexo"
  | "imprimir"
  | "exportar_pdf";

interface RegistrarAcessoParams {
  contratoId: string;
  tipoAcesso: TipoAcessoContrato;
  anexoId?: string | null;
  anexoNome?: string | null;
  detalhes?: Record<string, any> | null;
}

// Dedup simples em memória para não logar a mesma visualização várias vezes
// quando um componente faz re-render. Janela: 30s por (contrato + tipo + anexo).
const recentLogs = new Map<string, number>();
const DEDUP_WINDOW_MS = 30_000;

function dedupKey(p: RegistrarAcessoParams, userId: string) {
  return `${userId}|${p.contratoId}|${p.tipoAcesso}|${p.anexoId || p.anexoNome || ""}`;
}

export async function registrarAcessoContrato(params: RegistrarAcessoParams): Promise<void> {
  try {
    if (!params.contratoId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const key = dedupKey(params, user.id);
    const now = Date.now();
    const last = recentLogs.get(key);
    if (last && now - last < DEDUP_WINDOW_MS) return;
    recentLogs.set(key, now);

    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;

    // A gravação passa por uma função SECURITY DEFINER que usa auth.uid()
    // no servidor. Isso evita falsos "permission denied" quando o perfil
    // local e o JWT renovado ainda não estão sincronizados.
    const { error } = await supabase.rpc("registrar_acesso_contrato", {
      p_contrato_id: params.contratoId,
      p_tipo_acesso: params.tipoAcesso,
      p_anexo_id: params.anexoId || null,
      p_anexo_nome: params.anexoNome || null,
      p_user_agent: userAgent,
      p_detalhes: params.detalhes || null,
    });

    if (error) {
      recentLogs.delete(key);
      console.warn("Não foi possível registrar acesso ao contrato:", error.message);
    }
  } catch (err) {
    console.warn("Erro ao registrar acesso ao contrato:", err);
  }
}
