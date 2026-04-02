import { useEffect, useRef, useCallback, useState } from "react";

// Som de notificação em base64 (um beep curto e agradável)
const NOTIFICATION_SOUND_DATA = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU" + 
  "NtT09ATk9UQVRJT05fU09VTkQ=";

// URL alternativa para som de notificação (mais confiável)
const NOTIFICATION_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

export function useNotificationSystem() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("sigma-notification-sound");
    return saved !== "false";
  });

  // Inicializar áudio
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 0.5;
    
    // Verificar permissão atual
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Salvar preferência de som
  useEffect(() => {
    localStorage.setItem("sigma-notification-sound", String(soundEnabled));
  }, [soundEnabled]);

  // Solicitar permissão para notificações
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      console.log("Este navegador não suporta notificações");
      return "denied" as NotificationPermission;
    }

    if (Notification.permission === "granted") {
      setPermission("granted");
      return "granted" as NotificationPermission;
    }

    if (Notification.permission !== "denied") {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    }

    return Notification.permission;
  }, []);

  // Tocar som de notificação
  const playSound = useCallback(() => {
    if (!soundEnabled || !audioRef.current) return;
    
    // Reset e tocar
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch((err) => {
      console.log("Não foi possível tocar som:", err);
    });
  }, [soundEnabled]);

  // Mostrar notificação do navegador
  const showBrowserNotification = useCallback(
    ({ title, body, icon, tag, onClick }: NotificationOptions) => {
      if (!("Notification" in window)) return;
      
      if (Notification.permission !== "granted") {
        requestPermission();
        return;
      }

      // Só mostrar se a aba não estiver em foco
      if (document.visibilityState === "hidden" || !document.hasFocus()) {
        const notification = new Notification(title, {
          body,
          icon: icon || "/favicon.ico",
          tag,
          badge: "/favicon.ico",
          requireInteraction: false,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
          onClick?.();
        };

        // Auto-fechar após 5 segundos
        setTimeout(() => notification.close(), 5000);
      }
    },
    [requestPermission]
  );

  // Notificar (som + browser notification)
  const notify = useCallback(
    (options: NotificationOptions) => {
      playSound();
      showBrowserNotification(options);
    },
    [playSound, showBrowserNotification]
  );

  // Atualizar título da página com contador
  const updatePageTitle = useCallback((count: number, originalTitle: string) => {
    if (count > 0) {
      document.title = `(${count}) ${originalTitle}`;
    } else {
      document.title = originalTitle;
    }
  }, []);

  return {
    notify,
    playSound,
    showBrowserNotification,
    requestPermission,
    permission,
    soundEnabled,
    setSoundEnabled,
    updatePageTitle,
  };
}
