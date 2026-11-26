import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmpresaDocumentosTab } from "@/components/contratos/EmpresaDocumentosTab";
import { usePermissions } from "@/hooks/usePermissions";

// Item próprio no menu (pedido da Bianca, 25/11/2026): Contratos, Licitação e Financeiro anexam e atualizam
// as certidões da GSS sem precisar ver o resto de Clientes e Contratos. Quem edita é a função
// pode_gerir_documentos no banco; aqui só decide quem enxerga a página.
// Mesma lista do item do menu (Sidebar.tsx, "Documentos da empresa")
const MODULOS_DOCUMENTOS_EMPRESA = ["contratos", "licitacoes", "financeiro"] as const;

export default function DocumentosEmpresa() {
  const { isAdmin, canView, isLoadingRoles } = usePermissions();
  if (isLoadingRoles) return null;
  if (!isAdmin && !MODULOS_DOCUMENTOS_EMPRESA.some((m) => canView(m))) return <Navigate to="/" replace />;

  return (
    <AppLayout
      headerActions={(
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">Documentos da empresa</h1>
          <p className="truncate text-sm text-muted-foreground">Certidões e documentos da GSS com validade. O Sigma avisa antes de vencer.</p>
        </div>
      )}
    >
      <div className="p-4 md:p-6">
        <EmpresaDocumentosTab />
      </div>
    </AppLayout>
  );
}
