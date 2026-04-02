import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mediaUrl = url.searchParams.get('url');

    if (!mediaUrl) {
      return new Response(JSON.stringify({ error: 'URL de mídia não fornecida' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('📥 Fazendo proxy de mídia:', mediaUrl.substring(0, 100) + '...');

    // Fazer fetch da mídia do WhatsApp
    const response = await fetch(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,video/*,audio/*,*/*',
      },
    });

    if (!response.ok) {
      console.error('❌ Erro ao buscar mídia:', response.status, response.statusText);
      return new Response(JSON.stringify({ error: 'Erro ao buscar mídia', status: response.status }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();

    console.log('✅ Mídia obtida com sucesso, tipo:', contentType, 'tamanho:', arrayBuffer.byteLength);

    return new Response(arrayBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('❌ Erro no proxy de mídia:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: 'Erro interno', details: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
