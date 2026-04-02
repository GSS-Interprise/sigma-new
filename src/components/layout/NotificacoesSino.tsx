import { Bell, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useNotificationSystem } from "@/hooks/useNotificationSystem";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const ORIGINAL_TITLE = "Sigma - GSS";

export function NotificacoesSino() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prevCountRef = useRef<number>(0);
  const [isOpen, setIsOpen] = useState(false);
  
  const { 
    notify, 
    requestPermission, 
    permission, 
    soundEnabled, 
    setSoundEnabled,
    updatePageTitle 
  } = useNotificationSystem();

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  // Notificações de comunicação (mensagens de canal)
  const { data: notificacoesComunicacao } = useQuery({
    queryKey: ["notificacoes-comunicacao", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("comunicacao_notificacoes")
        .select(`
          *,
          comunicacao_canais(nome),
          comunicacao_mensagens(mensagem, user_nome)
        `)
        .eq("user_id", user.id)
        .eq("lida", false)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data?.map(n => ({ ...n, source: 'comunicacao' as const })) || [];
    },
    enabled: !!user,
  });

  // Notificações do sistema (kanban, licitações, etc.)
  const { data: notificacoesSistema } = useQuery({
    queryKey: ["notificacoes-sistema", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("system_notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("lida", false)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data?.map(n => ({ ...n, source: 'sistema' as const })) || [];
    },
    enabled: !!user,
  });

  // Combinar e ordenar notificações
  const notificacoes = [
    ...(notificacoesComunicacao || []),
    ...(notificacoesSistema || [])
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const naoLidas = notificacoes?.length || 0;

  // Atualizar título da página
  useEffect(() => {
    updatePageTitle(naoLidas, ORIGINAL_TITLE);
    return () => {
      document.title = ORIGINAL_TITLE;
    };
  }, [naoLidas, updatePageTitle]);

  // Setup realtime com notificações
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notificacoes-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comunicacao_notificacoes",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          queryClient.invalidateQueries({ queryKey: ["notificacoes-comunicacao"] });
          
          // Buscar detalhes da notificação
          const { data: notifDetails } = await supabase
            .from("comunicacao_notificacoes")
            .select(`
              *,
              comunicacao_canais(nome),
              comunicacao_mensagens(mensagem, user_nome)
            `)
            .eq("id", payload.new.id)
            .single();

          if (notifDetails) {
            const canalNome = notifDetails.comunicacao_canais?.nome || "Canal";
            const userNome = notifDetails.comunicacao_mensagens?.user_nome || "Usuário";
            const mensagem = notifDetails.comunicacao_mensagens?.mensagem || "";

            // Notificação completa (som + browser)
            notify({
              title: `Nova mensagem em #${canalNome}`,
              body: `${userNome}: ${mensagem.substring(0, 100)}`,
              tag: `sigma-msg-${payload.new.id}`,
              onClick: () => navigate("/comunicacao"),
            });

            // Toast se estiver na página
            if (document.hasFocus()) {
              toast.info(`Nova mensagem em #${canalNome}`, {
                description: `${userNome}: ${mensagem.substring(0, 50)}...`,
                action: {
                  label: "Ver",
                  onClick: () => navigate("/comunicacao"),
                },
              });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "comunicacao_notificacoes",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notificacoes-comunicacao"] });
        }
      )
      // Notificações do sistema
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "system_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          queryClient.invalidateQueries({ queryKey: ["notificacoes-sistema"] });
          
          const newNotif = payload.new as any;
          
          // Notificação completa (som + browser)
          notify({
            title: newNotif.titulo || "Nova notificação",
            body: newNotif.mensagem || "",
            tag: `sigma-sys-${newNotif.id}`,
            onClick: () => {
              if (newNotif.link) {
                if (newNotif.tipo?.startsWith('suporte_') && newNotif.referencia_id) {
                  navigate(`${newNotif.link}?ticket=${newNotif.referencia_id}`);
                } else {
                  navigate(newNotif.link);
                }
              }
            },
          });

          // Toast se estiver na página
          if (document.hasFocus()) {
            const toastLink = newNotif.tipo?.startsWith('suporte_') && newNotif.referencia_id
              ? `${newNotif.link}?ticket=${newNotif.referencia_id}`
              : newNotif.link;
            toast.info(newNotif.titulo, {
              description: newNotif.mensagem?.substring(0, 80),
              action: toastLink ? {
                label: "Ver",
                onClick: () => navigate(toastLink),
              } : undefined,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "system_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notificacoes-sistema"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient, notify, navigate]);

  // Solicitar permissão ao abrir popover
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && permission === "default") {
      requestPermission();
    }
  };

  const handleNotificacaoClick = async (notif: any) => {
    // Marcar como lida baseado no tipo
    if (notif.source === 'comunicacao') {
      await supabase
        .from("comunicacao_notificacoes")
        .update({ lida: true })
        .eq("id", notif.id);
      queryClient.invalidateQueries({ queryKey: ["notificacoes-comunicacao"] });
      navigate(`/comunicacao?canal=${notif.canal_id}`);
    } else {
      await supabase
        .from("system_notifications")
        .update({ lida: true })
        .eq("id", notif.id);
      queryClient.invalidateQueries({ queryKey: ["notificacoes-sistema"] });
      if (notif.link) {
        // For ticket notifications, append ticket ID as query param
        if (notif.tipo?.startsWith('suporte_') && notif.referencia_id) {
          navigate(`${notif.link}?ticket=${notif.referencia_id}`);
        } else {
          navigate(notif.link);
        }
      }
    }
    setIsOpen(false);
  };

  const handleMarcarTodasLidas = async () => {
    if (!user || !notificacoes?.length) return;
    
    // Marcar comunicacao como lidas
    await supabase
      .from("comunicacao_notificacoes")
      .update({ lida: true })
      .eq("user_id", user.id)
      .eq("lida", false);
    
    // Marcar sistema como lidas
    await supabase
      .from("system_notifications")
      .update({ lida: true })
      .eq("user_id", user.id)
      .eq("lida", false);
    
    queryClient.invalidateQueries({ queryKey: ["notificacoes-comunicacao"] });
    queryClient.invalidateQueries({ queryKey: ["notificacoes-sistema"] });
    toast.success("Todas notificações marcadas como lidas");
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={`h-5 w-5 ${naoLidas > 0 ? "animate-pulse" : ""}`} />
          {naoLidas > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs animate-bounce"
            >
              {naoLidas > 9 ? "9+" : naoLidas}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Notificações</h3>
            {naoLidas > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs h-7"
                onClick={handleMarcarTodasLidas}
              >
                Marcar todas como lidas
              </Button>
            )}
          </div>
          {naoLidas > 0 && (
            <p className="text-sm text-muted-foreground">
              {naoLidas} {naoLidas === 1 ? "nova mensagem" : "novas mensagens"}
            </p>
          )}
        </div>
        
        <ScrollArea className="h-[350px]">
          {!notificacoes || notificacoes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            <div className="divide-y">
              {notificacoes.map((notif: any) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificacaoClick(notif)}
                  className="w-full p-4 hover:bg-accent transition-colors text-left"
                >
                  {notif.source === 'comunicacao' ? (
                    <>
                      <div className="font-medium text-sm">
                        #{notif.comunicacao_canais?.nome}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        <span className="font-medium">
                          {notif.comunicacao_mensagens?.user_nome}:
                        </span>{" "}
                        {notif.comunicacao_mensagens?.mensagem?.substring(0, 50)}
                        {(notif.comunicacao_mensagens?.mensagem?.length || 0) > 50 && "..."}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-sm">
                        {notif.titulo}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {notif.mensagem?.substring(0, 80)}
                        {(notif.mensagem?.length || 0) > 80 && "..."}
                      </div>
                    </>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(new Date(notif.created_at), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />
        
        {/* Configurações de notificação */}
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-muted-foreground" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
              <Label htmlFor="sound-toggle" className="text-sm cursor-pointer">
                Som de notificação
              </Label>
            </div>
            <Switch
              id="sound-toggle"
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
            />
          </div>
          
          {permission !== "granted" && (
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full text-xs"
              onClick={requestPermission}
            >
              Ativar notificações do navegador
            </Button>
          )}
          
          {permission === "denied" && (
            <p className="text-xs text-destructive">
              Notificações bloqueadas. Ative nas configurações do navegador.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
