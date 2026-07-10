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
import { subscribeToPush, pushSupported, isPushSubscribed, pushEligible, isIOS, isStandalone } from "@/lib/webPush";
import { Smartphone, Share } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const ORIGINAL_TITLE = "Sigma - GSS";

export function NotificacoesSino() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prevCountRef = useRef<number>(0);
  const [isOpen, setIsOpen] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => { isPushSubscribed().then(setPushOn); }, []);

  const handleAtivarPush = async () => {
    setPushBusy(true);
    const r = await subscribeToPush();
    setPushBusy(false);
    if (r.ok) { setPushOn(true); toast.success("Notificações no celular ativadas neste dispositivo."); }
    else toast.error(r.error || "Não foi possível ativar as notificações.");
  };
  
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

  // Refs to avoid re-subscribing when callbacks change
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  // Setup realtime com notificações
  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    const channel = supabase
      .channel(`notificacoes-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comunicacao_notificacoes",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          queryClientRef.current.invalidateQueries({ queryKey: ["notificacoes-comunicacao"] });
          
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

            notifyRef.current({
              title: `Nova mensagem em #${canalNome}`,
              body: `${userNome}: ${mensagem.substring(0, 100)}`,
              tag: `sigma-msg-${payload.new.id}`,
              onClick: () => navigateRef.current("/comunicacao"),
            });

            // Sempre mostrar toast na tela (independente de foco)
            toast.info(`Nova mensagem em #${canalNome}`, {
              description: `${userNome}: ${mensagem.substring(0, 50)}...`,
              duration: 8000,
              action: {
                label: "Ver",
                onClick: () => navigateRef.current("/comunicacao"),
              },
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "comunicacao_notificacoes",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClientRef.current.invalidateQueries({ queryKey: ["notificacoes-comunicacao"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "system_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Notificações de SISTEMA (avisos, financeiro, suporte, etc.) só atualizam o
          // contador do sino — SEM pop-up/toast/som. Só mensagens de canal (Comunicação)
          // disparam notificação ativa, pra não floodar. (Mesma regra do Web Push.)
          queryClientRef.current.invalidateQueries({ queryKey: ["notificacoes-sistema"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "system_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClientRef.current.invalidateQueries({ queryKey: ["notificacoes-sistema"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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

        {/* Link pra página dedicada */}
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              setIsOpen(false);
              navigate("/notificacoes");
            }}
          >
            Ver todas as notificações
          </Button>
        </div>

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

          {pushOn ? (
            <p className="text-xs text-emerald-700 flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5" /> Notificações no celular ativas neste dispositivo
            </p>
          ) : pushEligible() ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={handleAtivarPush}
              disabled={pushBusy}
            >
              <Smartphone className="h-3.5 w-3.5 mr-1.5" />
              {pushBusy ? "Ativando..." : "Ativar notificações no celular"}
            </Button>
          ) : isIOS() && !isStandalone() ? (
            <div className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Smartphone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Para receber notificações no iPhone, instale o app: toque em{" "}
                <Share className="inline h-3 w-3 align-text-bottom" /> <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.
              </span>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
