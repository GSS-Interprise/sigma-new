import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, MessageSquare } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { NotificacoesSino } from "./NotificacoesSino";
import { Footer } from "./Footer";
import { GlobalBreadcrumb } from "./GlobalBreadcrumb";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useLicitacoesRealtimeAccess } from "@/hooks/useLicitacoesRealtimeAccess";
import { useLicitacoesRealtime } from "@/hooks/useLicitacoesRealtime";

interface AppLayoutProps {
  children: ReactNode;
  headerActions?: ReactNode;
  hideFooter?: boolean;
}

/** Componente wrapper — garante que os hooks são chamados incondicionalmente */
function LicitacoesRealtimeLoader() {
  // Notificações de licitação agora chegam via system_notifications (sininho).
  useLicitacoesRealtime();
  return null;
}

function AppLayoutContent({ children, headerActions, hideFooter }: AppLayoutProps) {
  const { hasAccess, isLoading } = useLicitacoesRealtimeAccess();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-background overflow-hidden w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b bg-card sticky top-0 z-40 flex-shrink-0">
          <div className="min-h-16 flex items-start sm:items-center justify-between px-4 md:px-6 gap-2 py-2 sm:py-0">
            <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0">
              <SidebarTrigger className="md:hidden shrink-0 h-9 w-9 rounded-md mt-0.5 sm:mt-0" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <div className="flex-1 min-w-0">
                {headerActions}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Comunicação"
                onClick={() => navigate("/comunicacao")}
              >
                <MessageSquare className="h-5 w-5" />
              </Button>
              <NotificacoesSino />
            </div>
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
