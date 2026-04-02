import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_LABELS: Record<string, string> = {
  captacao_edital: "Captação Edital",
  captacao_credenciamento: "Captação Credenciamento",
  edital_analise: "Edital em Análise",
  aguardando_sessao: "Aguardando Sessão",
  em_disputa: "Em Disputa",
  arrematados: "Arrematados",
  sessao_encerrada: "Sessão Encerrada",
  edital_suspenso: "Edital Suspenso",
  suspenso_revogado: "Suspenso/Revogado",
  perdidos: "Perdidos",
};

// Roles que devem receber notificações de licitações
const LICITACOES_ALLOWED_ROLES = [
  'admin',
  'diretoria',
  'gestor_contratos',
];

// Roles que precisam de verificação adicional de permissão
const ROLES_NEED_EXTRA_CHECK = ['lideres'];

export function useLicitacoesRealtimeNotifications() {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);

  // Verificar se o usuário tem acesso ao módulo de licitações
  useEffect(() => {
    if (!user) {
      setHasAccess(false);
      return;
    }

    const checkAccess = async () => {
      try {
        const { data: roles, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) {
          console.error('Erro ao verificar roles:', error);
          setHasAccess(false);
          return;
        }

        const userRoles = roles?.map(r => r.role) || [];
        
        // Acesso direto para roles principais
        const hasDirectAccess = userRoles.some(role => 
          LICITACOES_ALLOWED_ROLES.includes(role)
        );
        
        if (hasDirectAccess) {
          setHasAccess(true);
          return;
        }

        // Se for líder, verificar se tem permissão de captação ou contratos
        const isLider = userRoles.includes('lideres');
        if (isLider) {
          const { data: captacaoPerms } = await supabase
            .from('captacao_permissoes_usuario')
            .select('pode_acompanhamento, pode_leads, pode_contratos_servicos')
            .eq('user_id', user.id)
            .maybeSingle();

          const hasCaptacaoOrContratosAccess = captacaoPerms && (
            captacaoPerms.pode_acompanhamento || 
            captacaoPerms.pode_leads || 
            captacaoPerms.pode_contratos_servicos
          );

          setHasAccess(!!hasCaptacaoOrContratosAccess);
          return;
        }
        
        setHasAccess(false);
      } catch (err) {
        console.error('Erro ao verificar permissões:', err);
        setHasAccess(false);
      }
    };

    checkAccess();
  }, [user?.id]);

  useEffect(() => {
    // Só inscrever se o usuário tiver acesso ao módulo
    if (!user || !hasAccess) return;

    const channel = supabase
      .channel("licitacoes-notifications-global")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "licitacoes",
        },
        (payload) => {
          const newLicitacao = payload.new as {
            id: string;
            numero_edital?: string;
            orgao?: string;
            objeto?: string;
            subtipo_modalidade?: string;
          };

          const titulo = newLicitacao.numero_edital || newLicitacao.orgao || "Nova Licitação";
          const descricao = newLicitacao.objeto 
            ? newLicitacao.objeto.substring(0, 100) + (newLicitacao.objeto.length > 100 ? "..." : "")
            : newLicitacao.subtipo_modalidade || "Licitação criada no sistema";

          toast.info(`📋 ${titulo}`, {
            description: descricao,
            duration: 8000,
            action: {
              label: "Ver",
              onClick: () => {
                window.location.href = "/licitacoes";
              },
            },
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "licitacoes",
        },
        async (payload) => {
          const oldData = payload.old as { status?: string };
          const newData = payload.new as {
            id: string;
            numero_edital?: string;
            orgao?: string;
            status?: string;
          };

          // Only notify if status changed
          if (oldData.status && newData.status && oldData.status !== newData.status) {
            const titulo = newData.numero_edital || newData.orgao || "Licitação";
            const oldStatus = STATUS_LABELS[oldData.status] || oldData.status;
            const newStatus = STATUS_LABELS[newData.status] || newData.status;

            toast.info(`🔄 ${titulo}`, {
              description: `Movida de "${oldStatus}" para "${newStatus}"`,
              duration: 8000,
              action: {
                label: "Ver",
                onClick: () => {
                  window.location.href = "/licitacoes";
                },
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, hasAccess]);
}
