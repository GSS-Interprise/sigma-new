// Recupera os arquivos (áudio, imagem, vídeo, documento, figurinha) das mensagens que chegaram
// pelos números oficiais da Chakra antes de 03/11, quando a caixa de entrada só guardava o tipo
// sem baixar o arquivo. A Meta guarda a mídia por 30 dias: o que passou disso devolve erro e
// fica registrado na resposta. Só service role (gateway valida o JWT; aqui conferimos o papel).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chakraMediaIdDoPayload, guardarMidiaChakra } from "../_shared/chakra.ts";

const TIPOS = ["image", "video", "audio", "document", "sticker"];

function papelDoToken(authHeader: string) {
  const parte = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
  if (!parte) return "";
  try {
    const b64 = parte.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)))?.role || "";
  } catch {
    return "";
  }
}

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (papelDoToken(req.headers.get("Authorization") || "") !== "service_role") {
    return json({ ok: false, error: "service_role_required" }, 403);
  }
  const input = await req.json().catch(() => ({}));
  const limite = Math.min(Math.max(Number(input.limite) || 40, 1), 100);
  const dias = Math.min(Math.max(Number(input.dias) || 31, 1), 60);
  // data real da mensagem (sent_at): o histórico do celular é gravado hoje com mensagens de meses atrás.
  // cursor: só mensagens mais antigas que esta data, para o arquivo que a Meta não tem mais (404)
  // não voltar no topo de todo lote.
  const antes = typeof input.antes === "string" && input.antes ? input.antes : new Date().toISOString();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: instancias, error: instErro } = await supabase.from("sigzap_instances")
    .select("id, external_ref").eq("provider", "chakra");
  if (instErro) return json({ ok: false, error: instErro.message }, 500);
  const refPorInstancia = new Map((instancias || []).map((i: any) => [i.id, String(i.external_ref || "")]));
  if (!refPorInstancia.size) return json({ ok: true, processadas: 0 });

  // O select para em 1.000 linhas: com o histórico do celular os números oficiais passaram de 8 mil
  // conversas e a recuperação só via as primeiras. Pagina até acabar.
  const instPorConversa = new Map<string, string>();
  for (let de = 0; ; de += 1000) {
    const { data: conversas, error: convErro } = await supabase.from("sigzap_conversations")
      .select("id, instance_id").in("instance_id", [...refPorInstancia.keys()])
      .order("id").range(de, de + 999);
    if (convErro) return json({ ok: false, error: convErro.message }, 500);
    for (const c of conversas || []) instPorConversa.set(c.id, c.instance_id);
    if (!conversas || conversas.length < 1000) break;
  }

  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();
  const ids = [...instPorConversa.keys()];
  let pendentes: any[] = [];
  // .in() com milhares de ids estoura a URL: busca em fatias. Cada fatia traz até `limite` e só
  // depois de juntar todas pega as mais recentes; parar na primeira fatia cheia fazia o cursor
  // pular mensagens novas de outras conversas. Só o pedaço do payload com o id da mídia.
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from("sigzap_messages")
      .select("id, conversation_id, wa_message_id, message_type, media_mime_type, media_filename, sent_at, msg:raw_payload->data->message")
      .in("conversation_id", ids.slice(i, i + 150)).in("message_type", TIPOS)
      .is("media_url", null).gte("sent_at", desde).lt("sent_at", antes)
      .order("sent_at", { ascending: false }).limit(limite);
    if (error) return json({ ok: false, error: error.message }, 500);
    pendentes.push(...(data || []));
  }
  pendentes.sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
  pendentes = pendentes.slice(0, limite);
  const resultado: any[] = [];
  for (const m of pendentes) {
    const mediaId = chakraMediaIdDoPayload({ data: { message: m.msg } });
    if (!mediaId) {
      resultado.push({ id: m.id, ok: false, erro: "sem_media_id" });
      continue;
    }
    const instanceId = instPorConversa.get(m.conversation_id) || "";
    try {
      const url = await guardarMidiaChakra(supabase, {
        mediaId,
        dica: refPorInstancia.get(instanceId) || "",
        instanceId,
        conversationId: m.conversation_id,
        messageId: String(m.wa_message_id || m.id),
        mime: m.media_mime_type || undefined,
        nomeArquivo: m.media_filename || undefined,
      });
      const { error } = await supabase.from("sigzap_messages").update({ media_url: url }).eq("id", m.id);
      resultado.push({ id: m.id, ok: !error, erro: error?.message });
    } catch (error) {
      resultado.push({ id: m.id, ok: false, erro: error instanceof Error ? error.message : String(error) });
    }
  }
  return json({
    ok: true,
    processadas: resultado.length,
    proximo_antes: pendentes.length ? pendentes[pendentes.length - 1].sent_at : null,
    salvas: resultado.filter((r) => r.ok).length,
    falhas: resultado.filter((r) => !r.ok),
  });
});
