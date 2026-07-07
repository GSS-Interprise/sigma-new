import { supabase } from "@/integrations/supabase/client";

// Chave pública VAPID (segura pra expor). A privada fica no secret do Supabase.
export const VAPID_PUBLIC_KEY =
  "BEWyzsNhmz3MmtX1eqPoXuS9LNTehYgmwnjih8CDhdAr1LL8jUjE9Mtr9AZf3RZPwt16nfQ4BwUX0Zsr0rwO0V0";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  const reg = existing ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  return reg;
}

// Ativa as notificações push no dispositivo atual (celular ou desktop).
export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!pushSupported()) return { ok: false, error: "Este navegador não suporta notificações push." };
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, error: "Permissão de notificação não concedida." };

    const reg = await ensureRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return { ok: false, error: "Usuário não autenticado." };

    const json = sub.toJSON();
    const { error } = await (supabase as any).from("push_subscriptions").upsert(
      { user_id: u.user.id, endpoint: json.endpoint, subscription: json, user_agent: navigator.userAgent },
      { onConflict: "endpoint" }
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}
