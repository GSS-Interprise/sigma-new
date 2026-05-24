import { useState } from "react";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, Users, Plug, FileClock } from "lucide-react";
import { UsuariosTab } from "@/components/configuracoes/UsuariosTab";
import { PermissoesTab } from "@/components/configuracoes/PermissoesTab";
import { HistoricoTab } from "@/components/configuracoes/HistoricoTab";
import { ChipsTab } from "@/components/configuracoes/ChipsTab";
import { WhatsAppTab } from "@/components/configuracoes/WhatsAppTab";
import { LogPermissoesTab } from "@/components/configuracoes/LogPermissoesTab";
import { ApiTokensTab } from "@/components/configuracoes/ApiTokensTab";
import { SetoresTab } from "@/components/configuracoes/SetoresTab";
import { MatrizPermissoesTab } from "@/components/configuracoes/MatrizPermissoesTab";
import { WebhookCentralTab } from "@/components/configuracoes/WebhookCentralTab";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Fase C — Configurações agrupadas em 3 grupos (antes 10 abas paralelas).
 * Reduz carga cognitiva (heurística de Krug: chunking) e torna a navegação
 * escaneável. Cada grupo tem subtabs verticais.
 */

const GRUPOS = {
  acesso: {
    label: "Pessoas & Acesso",
    icon: Users,
    desc: "Quem entra no sistema e o que cada um pode fazer",
    abas: [
      { value: "usuarios", label: "Usuários", Component: UsuariosTab },
      { value: "permissoes", label: "Permissões", Component: PermissoesTab },
      { value: "matriz", label: "Matriz de permissões", Component: MatrizPermissoesTab },
      { value: "setores", label: "Setores", Component: SetoresTab },
    ],
  },
  integracoes: {
    label: "Canais & Integrações",
    icon: Plug,
    desc: "Chips de WhatsApp, APIs externas e webhooks",
    abas: [
      { value: "chips", label: "Chips WhatsApp", Component: ChipsTab },
      { value: "whatsapp", label: "WhatsApp API", Component: WhatsAppTab },
      { value: "tokens", label: "API Tokens", Component: ApiTokensTab },
      { value: "webhooks", label: "Webhooks", Component: WebhookCentralTab },
    ],
  },
  auditoria: {
    label: "Auditoria & Histórico",
    icon: FileClock,
    desc: "Rastreamento de quem mudou o quê",
    abas: [
      { value: "log-permissoes", label: "Log de permissões", Component: LogPermissoesTab },
      { value: "historico", label: "Histórico geral", Component: HistoricoTab },
    ],
  },
} as const;

type GrupoKey = keyof typeof GRUPOS;

export default function Configuracoes() {
  const { isAdmin } = usePermissions();
  const [grupoAtivo, setGrupoAtivo] = useState<GrupoKey>("acesso");
  const [abaAtiva, setAbaAtiva] = useState<string>(GRUPOS.acesso.abas[0].value);

  if (!isAdmin) {
    return (
      <AppLayout>
        <Alert variant="destructive" className="m-8">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Acesso restrito a administradores. Você será redirecionado para a página inicial.
          </AlertDescription>
        </Alert>
        <Navigate to="/" replace />
      </AppLayout>
    );
  }

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Configurações</h1>
      <p className="text-sm text-muted-foreground">
        Gerencie usuários, integrações e histórico
      </p>
    </div>
  );

  const grupo = GRUPOS[grupoAtivo];

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-4">
        {/* Grupo primário — 3 tabs grandes */}
        <Tabs
          value={grupoAtivo}
          onValueChange={(v) => {
            const g = v as GrupoKey;
            setGrupoAtivo(g);
            setAbaAtiva(GRUPOS[g].abas[0].value);
          }}
        >
          <TabsList className="grid w-full grid-cols-3 h-auto p-1">
            {(Object.keys(GRUPOS) as GrupoKey[]).map((key) => {
              const g = GRUPOS[key];
              const Icon = g.icon;
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex flex-col items-start gap-0.5 py-2.5 px-3 text-left data-[state=active]:bg-background"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Icon className="h-4 w-4" />
                    {g.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-normal leading-tight">
                    {g.desc}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Sub-abas do grupo ativo */}
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
          <TabsList
            className="grid w-full"
            style={{ gridTemplateColumns: `repeat(${grupo.abas.length}, minmax(0, 1fr))` }}
          >
            {grupo.abas.map((aba) => (
              <TabsTrigger key={aba.value} value={aba.value}>
                {aba.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {grupo.abas.map((aba) => {
            const Comp = aba.Component;
            return (
              <TabsContent key={aba.value} value={aba.value} className="space-y-4 mt-4">
                <Comp />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </AppLayout>
  );
}
