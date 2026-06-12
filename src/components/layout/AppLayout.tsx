import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { NotificacoesSino } from "./NotificacoesSino";
import { Footer } from "./Footer";
import { GlobalBreadcrumb } from "./GlobalBreadcrumb";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useLicitacoesRealtimeAccess } from "@/hooks/useLicitacoesRealtimeAccess";
import { useLicitacoesRealtimeNotifications } from "@/hooks/useLicitacoesRealtimeNotifications";
import { useLicitacoesRealtime } from "@/hooks/useLicitacoesRealtime";
import { AlertaDemandasAtrasadasModal } from "@/components/demandas/AlertaDemandasAtrasadasModal";

interface AppLayoutProps {
  children: ReactNode;
  headerActions?: ReactNode;
  hideFooter?: boolean;
}

/** Componente wrapper — garante que os hooks são chamados incondicionalmente */
function LicitacoesRealtimeLoader() {
  useLicitacoesRealtimeNotifications();
  useLicitacoesRealtime();
  return null;
}

function AppLayoutContent({ children, headerActions, hideFooter }: AppLayoutProps) {
  const { hasAccess, isLoading } = useLicitacoesRealtimeAccess();

  return (
    <div className="flex h-screen bg-background overflow-hidden w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b bg-card sticky top-0 z-40 flex-shrink-0">
          <div className="h-16 flex items-center justify-between px-4 md:px-6 gap-4">
            <div className="flex-1 min-w-0">
              {headerActions}
            </div>
            <NotificacoesSino />
          </div>
          <div className="px-4 md:px-6 pb-1.5 -mt-1">
            <GlobalBreadcrumb />
          </div>
        </header>
        <main className="flex-1 overflow-auto flex flex-col min-h-0">
          {children}
        </main>
        {!hideFooter && <Footer />}
      </div>
      {!isLoading && hasAccess && <LicitacoesRealtimeLoader />}
      <AlertaDemandasAtrasadasModal />
    </div>
  );
}

export function AppLayout({ children, headerActions, hideFooter }: AppLayoutProps) {
  const getInitialSidebarState = () => {
    if (typeof document !== 'undefined') {
      try {
        const cookies = document.cookie;
        const match = cookies.match(/sidebar:state=([^;]*)/);
        if (match && match[1] !== undefined) {
          return match[1].trim() === 'true';
        }
      } catch (error) {
        console.error('Erro ao ler cookie da sidebar:', error);
      }
    }
    return true;
  };

  return (
    <SidebarProvider 
      defaultOpen={getInitialSidebarState()}
      style={{
        "--sidebar-width": "16rem",
        "--sidebar-width-icon": "5rem",
      } as React.CSSProperties}
    >
      <AppLayoutContent headerActions={headerActions} hideFooter={hideFooter}>
        {children}
      </AppLayoutContent>
    </SidebarProvider>
  );
}
