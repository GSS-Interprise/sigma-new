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
  Sparkles,
  GitCompare,
  Bot,
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
  Rocket,
  UserSearch,
  Newspaper,
  ClipboardCheck,
  Receipt,
  Footprints,
  ListTodo,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions, type Modulo } from "@/hooks/usePermissions";
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

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  modulo?: Modulo; // módulo de permissão (vazio = sempre visível p/ autenticado)
  adminOnly?: boolean;
  adminOrLeader?: boolean;
};

type NavGroup = {
  label?: string; // rótulo do grupo (não clicável). Vazio = sem cabeçalho
  items: NavItem[];
};

// Ordem aplica anchoring + activation energy: Prospecção (operação que mais roda) logo após Home.
// Agrupamento = mental accounting (usuário pensa por domínio). Permissões inalteradas — só muda o visual.
const navigationGroups: NavGroup[] = [
  {
    items: [{ name: "Home", href: "/", icon: LayoutDashboard, modulo: "dashboard" }],
  },
  {
    label: "Prospecção",
    items: [
      { name: "Campanhas", href: "/prospeccao", icon: Rocket, modulo: "disparos" },
      { name: "Listas", href: "/disparos/leads?tab=listas", icon: ListChecks, modulo: "disparos" },
      { name: "Templates WhatsApp", href: "/prospeccao/templates-whatsapp", icon: FileText, modulo: "disparos" },
      { name: "Minhas Tarefas", href: "/tarefas", icon: ListTodo, modulo: "disparos" },
      { name: "Conversas", href: "/disparos/sigzap", icon: MessageCircle, modulo: "disparos" },
      { name: "Leads", href: "/leads", icon: UserSearch, modulo: "disparos" },
      { name: "Notícias", href: "/noticias", icon: Newspaper, modulo: "disparos" },
      { name: "Disparos & Chips", href: "/disparos", icon: Send, modulo: "disparos" },
      { name: "Saúde dos Chips", href: "/disparos/chips-saude", icon: Activity, modulo: "disparos" },
    ],
  },
  {
    label: "Operação clínica",
    items: [
      { name: "Médicos", href: "/medicos", icon: Users, modulo: "medicos" },
      { name: "Pareceres", href: "/parecer", icon: ClipboardCheck, adminOrLeader: true },
      { name: "Relacionamento", href: "/relacionamento-medico", icon: Activity, modulo: "relacionamento" },
      { name: "Escalas", href: "/escalas", icon: Calendar, modulo: "escalas" },
      { name: "Clientes e Contratos", href: "/contratos", icon: FileText, modulo: "contratos" },
      { name: "Licitações", href: "/licitacoes", icon: Gavel, modulo: "licitacoes" },
      { name: "Licitações (Robô)", href: "/licitacoes/robo", icon: Bot, modulo: "licitacoes" },
      { name: "Triagem PNCP", href: "/licitacoes/triagem", icon: Sparkles, modulo: "licitacoes" },
      { name: "PNCP × Effecti", href: "/licitacoes/comparativo", icon: GitCompare, modulo: "licitacoes" },
      { name: "AGES", href: "/ages", icon: Building2, modulo: "ages" },
      { name: "Radiologia", href: "/radiologia", icon: Stethoscope, modulo: "radiologia" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { name: "BI", href: "/bi", icon: BarChart3, modulo: "bi" },
      { name: "Atividades de Campo", href: "/atividades-campo", icon: Footprints, adminOrLeader: true },
      { name: "Marketing", href: "/marketing", icon: Megaphone, modulo: "marketing" },
      { name: "Financeiro", href: "/financeiro", icon: DollarSign, modulo: "financeiro" },
      { name: "Aprovações", href: "/financeiro/aprovacoes", icon: ClipboardCheck, modulo: "financeiro" },
      { name: "Comprovantes", href: "/financeiro/comprovantes", icon: Receipt, modulo: "financeiro" },
      { name: "Patrimônio", href: "/patrimonio", icon: Package, modulo: "patrimonio" },
    ],
  },
];

const navigationSistema: NavItem[] = [
  { name: "Comunicação", href: "/comunicacao", icon: MessageSquare },
  { name: "Suporte", href: "/suporte", icon: Headset },
  { name: "Auditoria", href: "/auditoria", icon: Shield, adminOrLeader: true },
  { name: "Configurações", href: "/configuracoes", icon: Settings, adminOnly: true },
];

export function Sidebar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin, hasPermission, userRoles, isLeader } = usePermissions();
  const { hasAnyCaptacaoAccess } = useCaptacaoPermissions();
  const { open } = useSidebar();

  const isExterno = userRoles?.some((role) => role.role === "externos");

  // Mantém a semântica de permissão exata da versão chapada
  const canSee = (item: NavItem): boolean => {
    if (item.adminOnly) return isAdmin;
    if (item.adminOrLeader) return isAdmin || isLeader;
    const modulo = item.modulo;
    if (!modulo) return true;
    if (modulo === "dashboard") return true; // Home sempre visível
    if (modulo === "disparos") {
      return isAdmin || hasPermission("disparos", "visualizar") || hasAnyCaptacaoAccess();
    }
    return isAdmin || hasPermission(modulo, "visualizar");
  };

  const renderItem = (item: NavItem) => {
    const isActive = location.pathname === item.href;
    return (
      <SidebarMenuItem key={item.name} className={cn(!open && "flex justify-center")}>
        <SidebarMenuButton asChild isActive={isActive}>
          <Link
            to={item.href}
            title={item.name}
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
  };

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

      <SidebarContent>
        <div className={cn("py-4", open ? "px-2" : "px-1")}>
          {navigationGroups.map((group, gi) => {
            const visibleItems = group.items.filter(canSee);
            if (visibleItems.length === 0) return null; // esconde grupo vazio
            return (
              <div key={group.label ?? `g${gi}`} className={cn(gi > 0 && "mt-4")}>
                {group.label && open && (
                  <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                    {group.label}
                  </div>
                )}
                {group.label && !open && gi > 0 && (
                  <div className="mx-2 my-2 border-t border-sidebar-border/40" aria-hidden />
                )}
                <SidebarMenu className="space-y-1">{visibleItems.map(renderItem)}</SidebarMenu>
              </div>
            );
          })}
        </div>

        <SidebarMenu className={cn("space-y-1 mt-auto pb-2", open ? "px-2" : "px-1")}>
          {navigationSistema
            .filter((item) => {
              if (!canSee(item)) return false;
              // Externos só veem Suporte e Comunicação
              if (isExterno && !isAdmin && item.name !== "Suporte" && item.name !== "Comunicação") return false;
              return true;
            })
            .map(renderItem)}
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
