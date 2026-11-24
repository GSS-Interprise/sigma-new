import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { NumerosOficiaisTab } from "@/components/configuracoes/NumerosOficiaisTab";
import { usePermissions } from "@/hooks/usePermissions";
import { useCaptacaoPermissions } from "@/hooks/useCaptacaoPermissions";

// Números oficiais de WhatsApp fora de Configurações (09/11): a captação (gestor ou quem tem
// seigzaps_config) precisa ver e ajustar os números, e Configurações inteira é só de admin.
// O banco já aceita esse público (whatsapp_numero_atualizar e chakra-connect checam o mesmo).
export default function NumerosWhatsApp() {
  const { isAdmin } = usePermissions();
  const { hasCaptacaoPermission } = useCaptacaoPermissions();
  if (!isAdmin && !hasCaptacaoPermission("seigzaps_config")) return <Navigate to="/" replace />;
  return (
    <AppLayout
      headerActions={(
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">Números WhatsApp</h1>
          <p className="truncate text-sm text-muted-foreground">Tipo, responsável e situação de cada número oficial da GSS</p>
        </div>
      )}
    >
      {/* largura cheia como as telas vizinhas (SLA ao vivo): a tabela precisa do espaço para Tipo e Responsável */}
      <div className="w-full p-4 md:p-6">
        <NumerosOficiaisTab />
      </div>
    </AppLayout>
  );
}
