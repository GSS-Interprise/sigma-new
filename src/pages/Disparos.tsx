import { AppLayout } from "@/components/layout/AppLayout";
import { InstrucoesRespostas } from "@/components/disparos/InstrucoesRespostas";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Mail, LayoutDashboard, Users, Ban, MessageCircle, Settings, FileText, ShieldCheck, MapPin, Eye, Wrench, GraduationCap, Megaphone } from "lucide-react";
import { Link } from "react-router-dom";
import { useCaptacaoPermissions, CaptacaoPermission } from "@/hooks/useCaptacaoPermissions";
import { usePermissions } from "@/hooks/usePermissions";
import { useModulosManutencao } from "@/hooks/useModulosManutencao";
import { ManutencaoAdminModal } from "@/components/disparos/ManutencaoAdminModal";
import { ManutencaoBlockModal } from "@/components/disparos/ManutencaoBlockModal";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function Disparos() {
  const { hasCaptacaoPermission, canManageCaptadores, isLoading } = useCaptacaoPermissions();
  const { isAdmin } = usePermissions();
  const { isEmManutencao } = useModulosManutencao();
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [blockModal, setBlockModal] = useState<{ open: boolean; nome: string }>({ open: false, nome: "" });

  const headerActions = (
    <div className="flex items-center gap-3">
      <div>
        <h1 className="text-2xl font-bold">Disparos e Captação</h1>
        <p className="text-sm text-muted-foreground">Gerencie campanhas de captação de médicos</p>
      </div>
      {isAdmin && (
        <Button
          variant="outline"
          size="icon"
          className="ml-2"
          title="Modo Manutenção"
          onClick={() => setAdminModalOpen(true)}
        >
          <Wrench className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  const MANUTENCAO_KEY_MAP: Record<string, string> = {
    "/disparos/zap": "disparos_zap",
    "/disparos/email": "disparos_email",
    "/disparos/acompanhamento": "acompanhamento",
    "/disparos/leads": "leads",
    "/disparos/contratos": "contratos_servicos",
    "/disparos/blacklist": "blacklist",
    "/disparos/regiao-interesse": "regiao_interesse",
    "/disparos/sigzap": "sigzap",
    "/disparos/config": "config_instancia",
    "/disparos/captadores": "captadores",
    "/disparos/monitor": "monitor",
    "/disparos/residentes": "residentes",
  };

  const allModules = [
    { name: "Disparos Zap", href: "/disparos/zap", icon: Send, description: "Envie mensagens via WhatsApp", permission: "disparos_zap" as CaptacaoPermission, adminOnly: false },
    { name: "Disparos Email", href: "/disparos/email", icon: Mail, description: "Envie campanhas por email", permission: "disparos_email" as CaptacaoPermission, adminOnly: false },
    { name: "Acompanhamento", href: "/disparos/acompanhamento", icon: LayoutDashboard, description: "Acompanhe o funil de captação", permission: "acompanhamento" as CaptacaoPermission, adminOnly: false },
    { name: "Leads", href: "/disparos/leads", icon: Users, description: "Gerencie seus leads", permission: "leads" as CaptacaoPermission, adminOnly: false },
    { name: "Contratos Captação", href: "/disparos/contratos", icon: FileText, description: "Contratos, serviços e propostas", permission: "contratos_servicos" as CaptacaoPermission, adminOnly: false },
    { name: "Black List", href: "/disparos/blacklist", icon: Ban, description: "Contatos bloqueados", permission: "blacklist" as CaptacaoPermission, adminOnly: false },
    { name: "Banco de Interesse", href: "/disparos/regiao-interesse", icon: MapPin, description: "Gerencie leads por região de interesse", permission: "leads" as CaptacaoPermission, adminOnly: false },
    { name: "SIG Zap", href: "/disparos/sigzap", icon: MessageCircle, description: "Integração WhatsApp", permission: "seigzaps_config" as CaptacaoPermission, adminOnly: false },
    { name: "Config Instância", href: "/disparos/config", icon: Settings, description: "Configure chips e instâncias", permission: "seigzaps_config" as CaptacaoPermission, adminOnly: false },
    { name: "Captadores", href: "/disparos/captadores", icon: ShieldCheck, description: "Gerencie permissões do setor", permission: null, adminOnly: false },
    { name: "Monitor", href: "/disparos/monitor", icon: Eye, description: "Supervisão de captadores (ADM)", permission: null, adminOnly: true },
    { name: "Residentes", href: "/disparos/residentes", icon: GraduationCap, description: "Gerencie médicos residentes", permission: "leads" as CaptacaoPermission, adminOnly: false },
    { name: "Tráfego Pago", href: "/disparos/trafego-pago", icon: Megaphone, description: "Envie listas de prospecção via webhook", permission: "disparos_zap" as CaptacaoPermission, adminOnly: false },
  ];

  const visibleModules = allModules.filter((module) => {
    if (module.adminOnly) return isAdmin;
    if (module.permission === null) return canManageCaptadores;
    return hasCaptacaoPermission(module.permission);
  });

  if (isLoading) {
    return (
      <AppLayout headerActions={headerActions}>
        <div className="p-4 flex items-center justify-center">
          <p className="text-muted-foreground">Carregando permissões...</p>
        </div>
      </AppLayout>
    );
  }

  const handleModuleClick = (e: React.MouseEvent, module: typeof allModules[0]) => {
    const key = MANUTENCAO_KEY_MAP[module.href];
    if (key && isEmManutencao(key) && !isAdmin) {
      e.preventDefault();
      setBlockModal({ open: true, nome: module.name });
    }
  };

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-6">
        <InstrucoesRespostas />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map((module) => {
            const key = MANUTENCAO_KEY_MAP[module.href];
            const emManutencao = key ? isEmManutencao(key) : false;
            return (
              <Link
                key={module.href}
                to={emManutencao && !isAdmin ? "#" : module.href}
                onClick={(e) => handleModuleClick(e, module)}
              >
                <Card className={`hover:shadow-lg transition-shadow cursor-pointer h-full ${emManutencao && !isAdmin ? "opacity-50" : ""}`}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${emManutencao ? "bg-destructive/10" : "bg-primary/10"}`}>
                        <module.icon className={`h-6 w-6 ${emManutencao ? "text-destructive" : "text-primary"}`} />
                      </div>
                      <CardTitle className="text-lg">{module.name}</CardTitle>
                      {emManutencao ? (
                        <span className="ml-auto text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                          Manutenção
                        </span>
                      ) : (
                        <span className="ml-auto text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
                          Total Funcionamento
                        </span>
                      )}
                    </div>
                    <CardDescription>{module.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {isAdmin && (
        <ManutencaoAdminModal open={adminModalOpen} onOpenChange={setAdminModalOpen} />
      )}
      <ManutencaoBlockModal
        open={blockModal.open}
        onOpenChange={(v) => setBlockModal({ ...blockModal, open: v })}
        moduloNome={blockModal.nome}
      />
    </AppLayout>
  );
}
