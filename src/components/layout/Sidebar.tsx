import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Building2,
  Users, 
  Activity,
  FileText, 
  Send,
  Settings,
  LogOut,
  Gavel,
  Calendar,
  DollarSign,
  BarChart3,
  Package,
  Stethoscope,
  Headset,
  MessageSquare,
  MessageCircle,
  Menu,
  Megaphone,
  Shield,
  Briefcase,
  Rocket
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useCaptacaoPermissions } from "@/hooks/useCaptacaoPermissions";
import {
  Sidebar as SidebarUI,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navigationTop = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Licitações", href: "/licitacoes", icon: Gavel },
  { name: "Disparos e Captação", href: "/disparos", icon: Send },
  { name: "Prospecção", href: "/prospeccao", icon: Rocket },
  { name: "Marketing", href: "/marketing", icon: Megaphone },
  { name: "Clientes e Contratos", href: "/contratos", icon: FileText },
  { name: "Relacionamento Médico", href: "/relacionamento-medico", icon: Activity },
  { name: "Médicos", href: "/medicos", icon: Users },
  { name: "Escalas", href: "/escalas", icon: Calendar },
  { name: "Financeiro", href: "/financeiro", icon: DollarSign },
  { name: "Patrimônio", href: "/patrimonio", icon: Package },
  { name: "Radiologia", href: "/radiologia", icon: Stethoscope },
  { name: "BI", href: "/bi", icon: BarChart3 },
  { name: "AGES", href: "/ages", icon: Building2 },
];

const navigationBottom = [
  { name: "Comunicação", href: "/comunicacao", icon: MessageSquare },
  { name: "Suporte", href: "/suporte", icon: Headset },
  { name: "Auditoria", href: "/auditoria", icon: Shield },
  { name: "Configurações", href: "/configuracoes", icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin, hasPermission, userRoles, isLeader } = usePermissions();
  const { hasAnyCaptacaoAccess } = useCaptacaoPermissions();
  const { open, setOpen } = useSidebar();
  
  // Verificar se o usuário é externo
  const isExterno = userRoles?.some(role => role.role === 'externos');
  
  // Verificar se está no módulo de Disparos
  const isDisparosActive = location.pathname.startsWith('/disparos');

  return (
    <SidebarUI collapsible="icon" className="data-[state=collapsed]:w-16 data-[state=expanded]:w-64">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={cn("flex h-16 items-center", open ? "justify-between px-3" : "justify-center")}>
          {open && <h1 className="text-xl font-bold text-sidebar-foreground">SIGMA</h1>}
          <SidebarTrigger className="hover:bg-sidebar-accent rounded-md p-2">
            <Menu className="h-5 w-5" />
          </SidebarTrigger>
        </div>
      </SidebarHeader>
      
      <SidebarContent className={cn(!open && "overflow-hidden")}>
        <SidebarMenu className={cn("space-y-1 py-4", open ? "px-2" : "px-1")}>
          {navigationTop.map((item) => {
            // Mapear href para módulo de permissão
            const moduleMap: Record<string, string> = {
              '/': 'dashboard',
              '/workspace': 'workspace',
              '/licitacoes': 'licitacoes',
              '/disparos': 'disparos',
              '/prospeccao': 'disparos',
              '/marketing': 'marketing',
              '/contratos': 'contratos',
              '/relacionamento-medico': 'relacionamento',
              '/medicos': 'medicos',
              '/escalas': 'escalas',
              '/financeiro': 'financeiro',
              '/patrimonio': 'patrimonio',
              '/radiologia': 'radiologia',
              '/bi': 'bi',
              '/ages': 'ages',
            };
            
            const modulo = moduleMap[item.href];
            
            // Para módulo de disparos, verificar também permissões de captação
            if (modulo === 'disparos') {
              // Se tem permissão por role OU por captacao_permissoes_usuario, mostrar
              const hasRolePermission = isAdmin || hasPermission('disparos', 'visualizar');
              if (!hasRolePermission && !hasAnyCaptacaoAccess()) {
                return null;
              }
            } else if (modulo === 'workspace') {
              // Workspace é sempre visível para usuários autenticados
            } else {
              // Admin vê tudo, outros precisam de permissão
              if (!isAdmin && modulo && !hasPermission(modulo as any, 'visualizar')) {
                return null;
              }
            }
            
            const isActive = location.pathname === item.href;
            return (
              <SidebarMenuItem key={item.name} className={cn(!open && "flex justify-center")}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link
                    to={item.href}
                    className={cn(
                      "flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
                      open ? "gap-3 px-3 justify-start w-full" : "justify-center w-10 h-10 p-0",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {open && <span>{item.name}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        <SidebarMenu className={cn("space-y-1 mt-auto", open ? "px-2" : "px-1")}>
          {navigationBottom.map((item) => {
            // Esconder Configurações para não-admins
            if (item.name === "Configurações" && !isAdmin) {
              return null;
            }
            
            // Esconder Auditoria para quem não é admin nem líder
            if (item.name === "Auditoria" && !isAdmin && !isLeader) {
              return null;
            }
            
            // Para usuários externos, mostrar apenas Suporte e Comunicação
            if (isExterno && !isAdmin && item.name !== "Suporte" && item.name !== "Comunicação") {
              return null;
            }
            
            const isActive = location.pathname === item.href;
            return (
                <SidebarMenuItem key={item.name} className={cn(!open && "flex justify-center")}>
                  <SidebarMenuButton asChild isActive={isActive}>
                    <Link
                      to={item.href}
                      className={cn(
                        "flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
                        open ? "gap-3 px-3 justify-start w-full" : "justify-center w-10 h-10 p-0",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {open && <span>{item.name}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className={cn("border-t border-sidebar-border", open ? "p-2" : "p-1")}>
        <Button
          variant="ghost"
          className={cn(
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            open ? "w-full justify-start px-3" : "w-10 h-10 p-0 mx-auto"
          )}
          onClick={signOut}
        >
          <LogOut className={cn("h-5 w-5 flex-shrink-0", open && "mr-3")} />
          {open && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </SidebarUI>
  );
}
