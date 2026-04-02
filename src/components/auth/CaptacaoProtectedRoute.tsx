import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCaptacaoPermissions, CaptacaoPermission } from "@/hooks/useCaptacaoPermissions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CaptacaoProtectedRouteProps {
  children: ReactNode;
  permission: CaptacaoPermission;
}

export function CaptacaoProtectedRoute({ children, permission }: CaptacaoProtectedRouteProps) {
  const { hasCaptacaoPermission, isLoading } = useCaptacaoPermissions();
  const navigate = useNavigate();
  const hasPermission = hasCaptacaoPermission(permission);

  // Redirect when permission is revoked (realtime)
  useEffect(() => {
    if (!isLoading && !hasPermission) {
      toast.warning("Seu acesso a este módulo foi revogado");
      navigate("/", { replace: true });
    }
  }, [hasPermission, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasPermission) {
    return null; // useEffect will handle redirect
  }

  return <>{children}</>;
}
