import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageUrl } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(
        JSON.stringify({ error: "É necessário enviar uma imagem (imageBase64 ou imageUrl)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY não configurada");
      return new Response(
        JSON.stringify({ error: "Configuração de IA não encontrada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare image content for the API
    const imageContent = imageBase64 
      ? { type: "image_url", image_url: { url: imageBase64 } }
      : { type: "image_url", image_url: { url: imageUrl } };

    const systemPrompt = `Você é um assistente MUITO PRECISO especializado em extrair dados de folhas de ponto/frequência mensal.

INSTRUÇÕES CRÍTICAS PARA CÁLCULO DE HORAS:

1. LEIA CADA LINHA DA TABELA DO DIA 1 AO DIA 30/31
2. Para CADA dia com registro, calcule:
   - Turno MANHÃ: (Hora Saída Manhã) - (Hora Entrada Manhã) = X horas
   - Turno TARDE: (Hora Saída Tarde) - (Hora Entrada Tarde) = Y horas
   - Total do dia = X + Y

3. EXEMPLOS DE CÁLCULO:
   - 08:00 até 13:00 = 5 horas (13-8=5)
   - 13:30 até 18:30 = 5 horas
   - 13:30 até 19:30 = 6 horas
   - 14:00 até 21:00 = 7 horas
   - 08:00-13:00 (manhã) + 14:00-21:00 (tarde) = 5+7 = 12 horas no dia

4. IGNORE completamente linhas marcadas como:
   - SÁBADO, DOMINGO, FERIADO
   - Linhas com "-" ou sem qualquer registro

5. SOME TODOS os dias trabalhados para obter o TOTAL MENSAL

EXTRAIA:
- Nome completo do profissional
- Cargo/Profissão (ex: PSICÓLOGA, ENFERMEIRO)
- Registro profissional com prefixo (ex: CRP: 08/37751)
- Unidade/Local de trabalho
- Mês e Ano de referência
- TOTAL DE HORAS (soma precisa de todos os turnos)
- Lista detalhada de cada dia trabalhado com as horas

ATENÇÃO: Seja EXTREMAMENTE preciso no cálculo. Verifique cada linha da tabela.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados desta folha de ponto:" },
              imageContent
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_folha_ponto",
              description: "Extrai os dados estruturados de uma folha de ponto",
              parameters: {
                type: "object",
                properties: {
                  nome_profissional: { 
                    type: "string", 
                    description: "Nome completo do profissional" 
                  },
                  cargo: { 
                    type: "string", 
                    description: "Cargo ou profissão (ex: Psicóloga, Enfermeiro, Médico)" 
                  },
                  registro_profissional: { 
                    type: "string", 
                    description: "Número do registro profissional com prefixo (ex: CRP 08/37751, CRM 12345)" 
                  },
                  unidade: { 
                    type: "string", 
                    description: "Nome da unidade ou local de trabalho" 
                  },
                  mes_referencia: { 
                    type: "number", 
                    description: "Mês de referência (1-12)" 
                  },
                  ano_referencia: { 
                    type: "number", 
                    description: "Ano de referência (ex: 2025)" 
                  },
                  total_horas: { 
                    type: "number", 
                    description: "Total de horas trabalhadas no mês (soma de todos os turnos)" 
                  },
                  detalhes_dias: {
                    type: "array",
                    description: "Detalhes de cada dia trabalhado",
                    items: {
                      type: "object",
                      properties: {
                        dia: { type: "number" },
                        entrada_manha: { type: "string" },
                        saida_manha: { type: "string" },
                        entrada_tarde: { type: "string" },
                        saida_tarde: { type: "string" },
                        horas_dia: { type: "number" }
                      }
                    }
                  },
                  observacoes: { 
                    type: "string", 
                    description: "Observações adicionais extraídas do documento" 
                  }
                },
                required: ["nome_profissional", "mes_referencia", "ano_referencia", "total_horas"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_folha_ponto" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro da API:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes para processamento de IA." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Erro ao processar imagem com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Resposta da IA:", JSON.stringify(data, null, 2));

    // Extract the function call arguments
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "extract_folha_ponto") {
      console.error("Resposta inesperada da IA:", data);
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair os dados da folha de ponto" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extractedData = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: extractedData 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erro ao processar folha de ponto:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erro desconhecido ao processar" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
