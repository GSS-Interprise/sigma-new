import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { usePermissions, Modulo } from "@/hooks/usePermissions";
import { useCaptacaoPermissions } from "@/hooks/useCaptacaoPermissions";
import { podeAbrirRotaDisparos } from "@/lib/acessoDisparos";

interface PermissionRouteProps {
  children: ReactNode;
  /** Módulo que o usuário precisa ter permissão de visualizar */
  modulo?: Modulo;
  /** Exige que seja admin */
  adminOnly?: boolean;
  /** Exige admin OU líder */
  adminOrLeader?: boolean;
  /** Também aceita a liberação individual de Disparos (pode_acessar_disparos) nesta rota */
  aceitaAcessoIndividualDisparos?: boolean;
  /** Redireciona para esta rota se não tiver permissão (padrão: "/") */
  redirectTo?: string;
}

export function PermissionRoute({
  children,
  modulo,
  adminOnly,
  adminOrLeader,
  aceitaAcessoIndividualDisparos,
  redirectTo = "/",
}: PermissionRouteProps) {
  const { isAdmin, isLeader, canView, isLoadingRoles } = usePermissions();

  // Enquanto carrega, não redireciona ainda
  if (isLoadingRoles) return null;

  if (adminOnly && !isAdmin) return <Navigate to={redirectTo} replace />;
  if (adminOrLeader && !isAdmin && !isLeader) return <Navigate to={redirectTo} replace />;
  if (modulo && !canView(modulo)) {
    if (aceitaAcessoIndividualDisparos) {
      return <AcessoIndividualDisparosRoute redirectTo={redirectTo}>{children}</AcessoIndividualDisparosRoute>;
    }
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

// Separado para só carregar as permissões de captação (e abrir o canal realtime) quando o perfil
// não dá acesso ao módulo.
function AcessoIndividualDisparosRoute({ children, redirectTo }: { children: ReactNode; redirectTo: string }) {
  const { pathname } = useLocation();
  const { isAdmin, canView } = usePermissions();
  const { acessoIndividualDisparos, isLoading } = useCaptacaoPermissions();

  if (isLoading) return null;

  const podeAbrir = podeAbrirRotaDisparos(
    { isAdmin, podeVerModuloPeloPerfil: canView("disparos"), acessoIndividual: acessoIndividualDisparos },
    pathname.replace(/\/+$/, "") || "/",
  );
  if (!podeAbrir) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}
