import { AppLayout } from "@/components/layout/AppLayout";
import { useSearchParams } from "react-router-dom";
import { BINavigation, BI_CATEGORIES } from "@/components/bi/BINavigation";
import { AbaLicitacoes } from "@/components/bi/AbaLicitacoes";
import { AbaInteligenciaCompetitiva } from "@/components/bi/AbaInteligenciaCompetitiva";
import { AbaMedicos } from "@/components/bi/AbaMedicos";
import { AbaRelacionamento } from "@/components/bi/AbaRelacionamento";
import { AbaFinanceiro } from "@/components/bi/AbaFinanceiro";
import { AbaDisparos } from "@/components/bi/AbaDisparos";
import { AbaEscalas } from "@/components/bi/AbaEscalas";
import { AbaContratos } from "@/components/bi/AbaContratos";
import { AbaAges } from "@/components/bi/AbaAges";
import { AbaTI } from "@/components/bi/AbaTI";
import { AbaClienteExterno } from "@/components/bi/AbaClienteExterno";
import { AbaProspec } from "@/components/bi/AbaProspec";

const ALL_MODULE_KEYS = BI_CATEGORIES.flatMap((c) => c.modules.map((m) => m.key));

// Map of client slugs to their display names
const CLIENT_MODULES: Record<string, string> = {
  "hospital-de-gaspar": "Hospital de Gaspar",
};

const MODULE_COMPONENTS: Record<string, React.ComponentType> = {
  licitacoes: AbaLicitacoes,
  competitiva: AbaInteligenciaCompetitiva,
  contratos: AbaContratos,
  ages: AbaAges,
  medicos: AbaMedicos,
  relacionamento: AbaRelacionamento,
  financeiro: AbaFinanceiro,
  disparos: AbaDisparos,
  prospec: AbaProspec,
  escalas: AbaEscalas,
  ti: AbaTI,
};

export default function BI() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") || "").toLowerCase();
  const activeModule = ALL_MODULE_KEYS.includes(tabParam) ? tabParam : "licitacoes";

  const handleSelectModule = (moduleKey: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", moduleKey);
      return next;
    }, { replace: true });
  };

  const ActiveComponent = MODULE_COMPONENTS[activeModule];
  const isClientModule = activeModule in CLIENT_MODULES;

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Business Intelligence</h1>
      <p className="text-sm text-muted-foreground">Análises e relatórios estratégicos</p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-6">
        <BINavigation activeModule={activeModule} onSelectModule={handleSelectModule} />
        <div className="space-y-6">
          {isClientModule ? (
            <AbaClienteExterno
              clienteSlug={activeModule}
              clienteNome={CLIENT_MODULES[activeModule]}
            />
          ) : (
            ActiveComponent && <ActiveComponent />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
