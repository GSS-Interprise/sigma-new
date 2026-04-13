import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoKanban } from "@/components/disparos/CaptacaoKanban";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { LeadStatusManager } from "@/components/disparos/LeadStatusManager";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function DisparosAcompanhamento() {
  const [searchTerm, setSearchTerm] = useState("");

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Acompanhamento</h1>
        <p className="text-sm text-muted-foreground">Acompanhe o funil de captação</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <LeadStatusManager modulo="disparos" />
      </div>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="acompanhamento">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 h-[calc(100vh-80px)] overflow-hidden">
          <CaptacaoKanban searchTerm={searchTerm} />
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
