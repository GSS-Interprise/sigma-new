import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, Users, Plug, FileClock } from "lucide-react";
import { UsuariosTab } from "@/components/configuracoes/UsuariosTab";
import { PermissoesTab } from "@/components/configuracoes/PermissoesTab";
import { HistoricoTab } from "@/components/configuracoes/HistoricoTab";
import { NumerosOficiaisTab } from "@/components/configuracoes/NumerosOficiaisTab";
import { LogPermissoesTab } from "@/components/configuracoes/LogPermissoesTab";
import { ApiTokensTab } from "@/components/configuracoes/ApiTokensTab";
import { SetoresTab } from "@/components/configuracoes/SetoresTab";
import { MatrizPermissoesTab } from "@/components/configuracoes/MatrizPermissoesTab";
import { WebhookCentralTab } from "@/components/configuracoes/WebhookCentralTab";
import { RedesSociaisTab } from "@/components/configuracoes/RedesSociaisTab";
import { MotorIaTab } from "@/components/configuracoes/MotorIaTab";
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
    desc: "WhatsApp, LinkedIn, Instagram, motor de IA, APIs externas e webhooks",
    abas: [
      // Só API oficial (Chakra) desde 08/11: a aba de chips Evolution e o formulário antigo da Meta saíram.
      { value: "whatsapp", label: "WhatsApp", Component: NumerosOficiaisTab },
      // Fase 9.2: LinkedIn e Instagram da equipe pela Unipile (Hosted Auth).
      { value: "linkedin", label: "LinkedIn e Instagram", Component: RedesSociaisTab },
      // Hermes na VPS da GSS pela assinatura Max do Claude (docs/arquitetura/motor-ia-hermes-claude.md).
      { value: "motor-ia", label: "Motor de IA (Claude)", Component: MotorIaTab },
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
  // ?tab=<aba> abre direto na aba (o menu lateral leva para ?tab=whatsapp).
  const [searchParams] = useSearchParams();
  const abaInicial = searchParams.get("tab");
  const grupoInicial = (Object.keys(GRUPOS) as GrupoKey[]).find((key) =>
    GRUPOS[key].abas.some((aba) => aba.value === abaInicial)) ?? "acesso";
  const [grupoAtivo, setGrupoAtivo] = useState<GrupoKey>(grupoInicial);
  const [abaAtiva, setAbaAtiva] = useState<string>(
    GRUPOS[grupoInicial].abas.some((aba) => aba.value === abaInicial) ? abaInicial! : GRUPOS[grupoInicial].abas[0].value,
  );

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
                  className="flex min-w-0 flex-col items-start gap-0.5 whitespace-normal py-2.5 px-2 sm:px-3 text-left data-[state=active]:bg-background"
                >
                  <span className="flex min-w-0 items-center gap-2 font-medium leading-tight">
                    <Icon className="h-4 w-4 shrink-0" />
                    {g.label}
                  </span>
                  <span className="hidden md:block text-[11px] text-muted-foreground font-normal leading-tight">
                    {g.desc}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Sub-abas do grupo ativo */}
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
          {/* no celular as sub-abas rolam de lado em vez de espremer o texto */}
          <TabsList
            className="flex w-full justify-start overflow-x-auto sm:grid"
            style={{ gridTemplateColumns: `repeat(${grupo.abas.length}, minmax(0, 1fr))` }}
          >
            {grupo.abas.map((aba) => (
              <TabsTrigger key={aba.value} value={aba.value} className="shrink-0 sm:shrink">
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
