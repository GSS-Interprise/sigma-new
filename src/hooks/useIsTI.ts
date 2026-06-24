import { usePermissions } from "@/hooks/usePermissions";
import { useUserSetor } from "@/hooks/useUserSetor";

/**
 * Verdadeiro se o usuário é do setor TI/Tecnologia, ou admin.
 * Usado para liberar ações exclusivas do TI (ex.: transformar demanda em ticket).
 */
export function useIsTI() {
  const { isAdmin } = usePermissions();
  const { setorNome, isLoading } = useUserSetor();
  const nome = (setorNome || "").toLowerCase().trim();
  const isSetorTI = nome === "ti" || nome.includes("tecnologia");
  return { isTI: isAdmin || isSetorTI, isLoading };
}