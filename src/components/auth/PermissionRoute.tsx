import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions, Modulo } from "@/hooks/usePermissions";

interface PermissionRouteProps {
  children: ReactNode;
  /** Módulo que o usuário precisa ter permissão de visualizar */
  modulo?: Modulo;
  /** Exige que seja admin */
  adminOnly?: boolean;
  /** Exige admin OU líder */
  adminOrLeader?: boolean;
  /** Redireciona para esta rota se não tiver permissão (padrão: "/") */
  redirectTo?: string;
}

export function PermissionRoute({
  children,
  modulo,
  adminOnly,
  adminOrLeader,
  redirectTo = "/",
}: PermissionRouteProps) {
  const { isAdmin, isLeader, canView, isLoadingRoles } = usePermissions();

  // Enquanto carrega, não redireciona ainda
  if (isLoadingRoles) return null;

  if (adminOnly && !isAdmin) return <Navigate to={redirectTo} replace />;
  if (adminOrLeader && !isAdmin && !isLeader) return <Navigate to={redirectTo} replace />;
  if (modulo && !canView(modulo)) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}
