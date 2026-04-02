import { Badge } from "@/components/ui/badge";
import { Lock, Eye } from "lucide-react";

interface LockInfo {
  user_id: string;
  user_name: string;
  started_at: string;
  expires_at: string;
}

interface LicitacaoLockBadgeProps {
  hasLock: boolean;
  lockedBy: LockInfo | null;
  isLoading: boolean;
}

export function LicitacaoLockBadge({ hasLock, lockedBy, isLoading }: LicitacaoLockBadgeProps) {
  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1 text-xs animate-pulse">
        <Lock className="h-3 w-3" />
        Verificando...
      </Badge>
    );
  }

  if (hasLock) {
    return (
      <Badge variant="outline" className="gap-1 text-xs bg-green-50 text-green-700 border-green-200">
        <Lock className="h-3 w-3" />
        Você está editando
      </Badge>
    );
  }

  if (lockedBy) {
    return (
      <Badge variant="outline" className="gap-1 text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
        <Eye className="h-3 w-3" />
        {lockedBy.user_name} está editando - modo visualização
      </Badge>
    );
  }

  return null;
}
