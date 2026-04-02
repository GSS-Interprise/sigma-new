import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, action, medicoId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'process-external-link') {
      // Buscar documento com link externo
      const { data: doc, error: docError } = await supabase
        .from('medico_documentos')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError) throw docError;

      if (!doc.url_externa) {
        return new Response(
          JSON.stringify({ error: 'Documento não possui URL externa' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Tentar acessar a URL
      try {
        // Verificar se a URL é acessível
        const urlCheck = await fetch(doc.url_externa, { 
          method: 'HEAD',
          redirect: 'follow'
        });

        if (!urlCheck.ok) {
          return new Response(
            JSON.stringify({ 
              error: 'Não foi possível acessar o conteúdo. O link precisa estar configurado como público (qualquer pessoa com o link pode visualizar).',
              success: false
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Atualizar documento indicando que foi processado
        const { error: updateError } = await supabase
          .from('medico_documentos')
          .update({ 
            observacoes: (doc.observacoes || '') + '\n[Link processado e validado em ' + new Date().toISOString() + ']'
          })
          .eq('id', documentId);

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Link validado com sucesso. Os documentos estão acessíveis e prontos para análise.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (fetchError) {
        return new Response(
          JSON.stringify({ 
            error: 'Não foi possível acessar o link. Verifique se o link está correto e configurado como público.',
            success: false
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (action === 'extract-text') {
      // Buscar documento
      const { data: doc, error: docError } = await supabase
        .from('medico_documentos')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError) throw docError;

      // Baixar arquivo do storage
      const { data: fileData, error: fileError } = await supabase
        .storage
        .from('medicos-documentos')
        .download(doc.arquivo_path);

      if (fileError) throw fileError;

      // Simples extração de texto (para PDFs de texto)
      // Em produção, você usaria Tesseract, Google Vision ou AWS Textract
      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const text = new TextDecoder().decode(uint8Array);
      
      // Atualizar documento com texto extraído
      const { error: updateError } = await supabase
        .from('medico_documentos')
        .update({ texto_extraido: text })
        .eq('id', documentId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, texto: text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'generate-summary') {
      if (!medicoId) {
        return new Response(
          JSON.stringify({ error: 'medicoId é obrigatório para gerar resumo' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Buscar todos os documentos e informações do médico
      const { data: medico, error: medicoError } = await supabase
        .from('medicos')
        .select('nome_completo, crm, especialidade, rqe_numeros, estado')
        .eq('id', medicoId)
        .single();

      if (medicoError) throw medicoError;

      const { data: docs, error: docsError } = await supabase
        .from('medico_documentos')
        .select('tipo_documento, emissor, data_emissao, data_validade, arquivo_nome, observacoes')
        .eq('medico_id', medicoId);

      if (docsError) throw docsError;

      if (!docs || docs.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Nenhum documento anexado encontrado. Anexe documentos antes de gerar o resumo.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Criar descrição estruturada dos documentos e dados do médico
      const docsSummary = docs.map(d => {
        let info = `- ${d.tipo_documento}`;
        if (d.emissor) info += ` (${d.emissor})`;
        if (d.data_emissao) info += ` - Emitido em ${d.data_emissao}`;
        if (d.data_validade) info += ` - Validade: ${d.data_validade}`;
        if (d.observacoes) info += ` - Obs: ${d.observacoes}`;
        return info;
      }).join('\n');

      const medicoInfo = `
Nome: ${medico.nome_completo}
CRM: ${medico.crm} ${medico.estado || ''}
Especialidades: ${medico.especialidade?.join(', ') || 'Não informado'}
RQE: ${medico.rqe_numeros?.join(', ') || 'Não informado'}

Documentos anexados:
${docsSummary}
      `.trim();

      // Chamar IA para gerar resumo
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY não configurada');
      }

      const prompt = `Gere um resumo profissional objetivo (3–5 frases) a partir das informações abaixo. 
Inclua: formação (curso/universidade/ano se disponível nos documentos), especialidades/áreas de atuação, títulos/registro (CRM, RQE), e diferenciais encontrados na documentação. 
Evite opiniões, mantenha tom institucional.

Informações do profissional:
${medicoInfo}`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'Você é um especialista em análise de currículos e documentação profissional médica.' },
            { role: 'user', content: prompt }
          ],
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente mais tarde.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (aiResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao workspace.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw new Error('Erro ao chamar API de IA');
      }

      const aiData = await aiResponse.json();
      const summary = aiData.choices[0].message.content;

      // Buscar informações do usuário que está gerando
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token || '');

      // Atualizar médico com o resumo
      const { error: updateError } = await supabase
        .from('medicos')
        .update({
          resumo_ia: summary,
          resumo_ia_gerado_em: new Date().toISOString(),
          resumo_ia_gerado_por: user?.id,
          resumo_ia_aprovado: false
        })
        .eq('id', medicoId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ 
          success: true, 
          resumo: summary,
          fontes: docs.map(d => ({ tipo: d.tipo_documento, nome: d.arquivo_nome }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não reconhecida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro em process-doctor-document:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
