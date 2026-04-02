import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get webhook URL from supabase_config
    const { data: configData, error: configError } = await supabase
      .from("supabase_config")
      .select("valor")
      .eq("chave", "licitacao_webhook_url")
      .maybeSingle();

    if (configError || !configData?.valor) {
      return new Response(JSON.stringify({ error: "Webhook URL não configurada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = configData.valor;

    // Parse JSON body with array of files
    const body = await req.json();
    const { licitacao_id, files } = body as {
      licitacao_id: string;
      files: { bucket_name: string; file_path: string; file_name: string }[];
    };

    if (!licitacao_id || !files || files.length === 0) {
      return new Response(JSON.stringify({ error: "licitacao_id e files são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download all files and build a single FormData
    const outgoingForm = new FormData();
    outgoingForm.append("licitacao_id", licitacao_id);
    outgoingForm.append("enviado_em", new Date().toISOString());
    outgoingForm.append("total_arquivos", String(files.length));

    for (const file of files) {
      const { data: fileData, error: fileError } = await supabase.storage
        .from(file.bucket_name)
        .download(file.file_path);

      if (fileError || !fileData) {
        console.error(`Erro ao baixar ${file.file_name}:`, fileError?.message);
        continue;
      }

      outgoingForm.append("files", fileData, file.file_name);
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "X-Licitacao-Id": licitacao_id,
      },
      body: outgoingForm,
    });

    if (!webhookResponse.ok) {
      const text = await webhookResponse.text();
      return new Response(JSON.stringify({ success: false, status: webhookResponse.status, body: text }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Webhook proxy error:", error);
    return new Response(JSON.stringify({ error: error?.message ?? String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
