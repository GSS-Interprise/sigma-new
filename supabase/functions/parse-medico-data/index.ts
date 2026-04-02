import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const text = body.texto || body.text; // Aceita ambos os nomes
    
    console.log("Received text length:", text?.length || 0);
    
    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Texto vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em extrair dados de médicos/leads de textos desestruturados.
Extraia os seguintes campos se encontrados:
- nome: Nome completo
- cpf: CPF (formato: 000.000.000-00)
- data_nascimento: Data de nascimento (formato: YYYY-MM-DD)
- crm: Número do CRM com UF (ex: CRM/SP 123456)
- telefone: Telefone principal (formato: (00) 00000-0000)
- email: E-mail
- endereco: Endereço completo
- cep: CEP (formato: 00000-000)
- rg: RG
- nacionalidade: Nacionalidade
- naturalidade: Naturalidade (cidade/estado de nascimento)
- estado_civil: Estado civil
- banco: Nome do banco
- agencia: Número da agência
- conta_corrente: Número da conta corrente
- chave_pix: Chave PIX
- cnpj: CNPJ (formato: 00.000.000/0000-00)
- especialidade: Especialidade médica

IMPORTANTE: Qualquer informação que NÃO se encaixe nos campos acima DEVE ser incluída no campo "observacoes". 
Inclua em observacoes: telefones adicionais, informações bancárias extras, comentários, notas, qualquer texto que sobrar.`
          },
          {
            role: "user",
            content: `Extraia os dados do médico do seguinte texto:\n\n${text}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_medico_data",
              description: "Extrai dados estruturados de um médico a partir de texto",
              parameters: {
                type: "object",
                properties: {
                  nome: { type: "string", description: "Nome completo" },
                  cpf: { type: "string", description: "CPF no formato 000.000.000-00" },
                  data_nascimento: { type: "string", description: "Data de nascimento no formato YYYY-MM-DD" },
                  crm: { type: "string", description: "CRM com UF (ex: CRM/SP 123456)" },
                  telefone: { type: "string", description: "Telefone principal no formato (00) 00000-0000" },
                  email: { type: "string", description: "Endereço de e-mail" },
                  endereco: { type: "string", description: "Endereço completo" },
                  cep: { type: "string", description: "CEP no formato 00000-000" },
                  rg: { type: "string", description: "Número do RG" },
                  nacionalidade: { type: "string", description: "Nacionalidade" },
                  naturalidade: { type: "string", description: "Naturalidade (cidade/estado)" },
                  estado_civil: { type: "string", description: "Estado civil" },
                  banco: { type: "string", description: "Nome do banco" },
                  agencia: { type: "string", description: "Número da agência" },
                  conta_corrente: { type: "string", description: "Número da conta corrente" },
                  chave_pix: { type: "string", description: "Chave PIX" },
                  cnpj: { type: "string", description: "CNPJ no formato 00.000.000/0000-00" },
                  especialidade: { type: "string", description: "Especialidade médica" },
                  observacoes: { type: "string", description: "TODAS as informações que não se encaixam nos outros campos devem vir aqui" }
                },
                required: [],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_medico_data" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Erro ao processar com IA");
    }

    const result = await response.json();
    
    // Extract the function call arguments
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "extract_medico_data") {
      throw new Error("Resposta inesperada da IA");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log("Extracted data:", extractedData);

    return new Response(
      JSON.stringify({ dados: extractedData }), // Frontend espera 'dados'
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in parse-medico-data:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
