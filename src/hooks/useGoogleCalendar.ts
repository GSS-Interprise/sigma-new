import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email: string; responseStatus?: string }[];
  conferenceData?: any;
}

async function readFunctionError(error: any) {
  const status = error?.context?.status;
  let body = "";
  try {
    body = typeof error?.context?.text === "function" ? await error.context.text() : "";
  } catch {
    body = "";
  }
  const message = `${error?.message ?? ""} ${status ?? ""} ${body}`;
  return {
    status,
    message,
    isReconnectRequired:
      status === 412 ||
      status === 401 ||
      message.includes("not_connected") ||
      message.includes("no_refresh_token") ||
      message.includes("no_config") ||
      message.includes("refresh_failed"),
  };
}

function markGoogleDisconnected(qc: ReturnType<typeof useQueryClient>) {
  qc.setQueryData(["google-calendar-connection"], (prev: any) => ({
    ...(prev ?? {}),
    connected: false,
    needsReauth: true,
  }));
  qc.invalidateQueries({ queryKey: ["google-calendar-connection"] });
  toast.warning(
    "Sua conexão com o Google expirou. Faça login novamente para ver a agenda.",
    { id: "google-reauth" },
  );
}

export function useGoogleConnection() {
  return useQuery({
    queryKey: ["google-calendar-connection"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        return {
          hasConfig: false,
          connected: false,
          email: null as string | null,
          mode: "oauth" as "dwd" | "oauth",
          dwdConfigured: false,
          dwdIntendedButInvalid: false,
          dwdIssues: [] as { code: string; message: string }[],
        };
      }
      // Try the edge function first (handles DWD detection server-side).
      try {
        const { data, error } = await supabase.functions.invoke("google-connection-status", { body: {} });
        if (!error && data) {
          return {
            hasConfig: !!data.hasConfig,
            connected: !!data.connected,
            email: (data.email as string | null) ?? null,
            mode: (data.mode as "dwd" | "oauth") ?? "oauth",
            dwdConfigured: !!data.dwdConfigured,
            dwdIntendedButInvalid: !!data.dwdIntendedButInvalid,
            dwdIssues: (data.dwdIssues as { code: string; message: string }[]) ?? [],
          };
        }
      } catch {
        // fall through to legacy direct query
      }
      const [{ data: cfg }, { data: tok }] = await Promise.all([
        supabase.from("user_google_oauth_config").select("user_id").eq("user_id", uid).maybeSingle(),
        supabase.from("user_google_calendar_tokens").select("google_email,expires_at").eq("user_id", uid).maybeSingle(),
      ]);
      return {
        hasConfig: !!cfg,
        connected: !!tok,
        email: tok?.google_email ?? null,
        mode: "oauth" as "dwd" | "oauth",
        dwdConfigured: false,
        dwdIntendedButInvalid: false,
        dwdIssues: [] as { code: string; message: string }[],
      };
    },
    staleTime: 30_000,
  });
}

export function useStartGoogleOAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-oauth-start", { body: {} });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.message || "Sem URL de autorização");
      const w = window.open(data.url, "google-oauth", "width=520,height=640");
      // Poll for connection update every 2s while popup is open
      const start = Date.now();
      await new Promise<void>((resolve) => {
        const t = setInterval(async () => {
          if (w?.closed || Date.now() - start > 5 * 60_000) {
            clearInterval(t);
            resolve();
          }
        }, 1500);
      });
      await qc.invalidateQueries({ queryKey: ["google-calendar-connection"] });
    },
    onError: (e: any) => toast.error(e.message || "Falha ao iniciar login Google"),
  });
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("user_google_calendar_tokens")
        .delete()
        .eq("user_id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google-calendar-connection"] });
      qc.invalidateQueries({ queryKey: ["google-calendar-events"] });
      toast.success("Conta Google desconectada");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao desconectar"),
  });
}

export function useGoogleCalendarEvents(
  enabled: boolean,
  timeMin: Date,
  timeMax: Date,
) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["google-calendar-events", timeMin.toISOString(), timeMax.toISOString()],
    enabled,
    queryFn: async (): Promise<GCalEvent[]> => {
      const { data, error } = await supabase.functions.invoke("google-calendar-events", {
        body: { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() },
      });
      if (error) {
        const details = await readFunctionError(error);
        if (details.isReconnectRequired) {
          markGoogleDisconnected(qc);
          return [];
        }
        throw error;
      }
      if (data?.needsReauth) {
        markGoogleDisconnected(qc);
        return [];
      }
      return (data?.events ?? []) as GCalEvent[];
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useCreateGoogleEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      summary: string;
      description?: string;
      start: Date;
      end: Date;
      withMeet?: boolean;
      attendees?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke("google-calendar-create", {
        body: {
          ...input,
          start: input.start.toISOString(),
          end: input.end.toISOString(),
        },
      });
      if (error) throw error;
      return data?.event;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google-calendar-events"] });
      toast.success("Evento criado no Google Calendar");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar evento"),
  });
}