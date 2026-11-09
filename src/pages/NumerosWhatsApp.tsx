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
    <AppLayout>
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
        <NumerosOficiaisTab />
      </main>
    </AppLayout>
  );
}
