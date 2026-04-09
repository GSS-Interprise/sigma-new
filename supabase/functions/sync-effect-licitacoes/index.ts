import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EffectFavorito {
  id: string;
  titulo: string;
  codigo: string;
  municipio: string;
  uf: string;
  modalidade: string;
  orgao: string;
  valorEstimado: number;
  dataDisputa: string;
  tags?: string[];
  descricao?: string;
  pdfUrl?: string;
  imageUrls?: string[];
}

function inferTipo(modalidade: string | undefined): string | null {
  if (!modalidade) return null;
  const n = modalidade.trim().toUpperCase();
  if (n.includes('PREGÃO') || n.includes('PREGAO') || n.includes('CONCORRÊNCIA') || n.includes('CONCORRENCIA')) return 'MODALIDADE';
  if (n.includes('CREDENCIAMENTO') || n.includes('CHAMAMENTO')) return 'PROC. AUXILIAR';
  if (n.includes('DISPENSA') || n.includes('INEXIGIBILIDADE')) return 'CONTR. DIRETA';
  return null;
}

function inferSubtipo(modalidade: string | undefined): string | null {
  if (!modalidade) return null;
  const n = modalidade.trim().toUpperCase();
  if (n.includes('PREGÃO') || n.includes('PREGAO')) {
    if (n.includes('PRESENCIAL')) return 'Pregão Presencial';
    return 'Pregão Eletrônico';
  }
  if (n.includes('CONCORRÊNCIA') || n.includes('CONCORRENCIA')) return 'Concorrência';
  if (n.includes('CREDENCIAMENTO')) return 'Credenciamento';
  if (n.includes('CHAMAMENTO')) return 'Edital Chamamento';
  if (n.includes('DISPENSA')) return 'Dispensa';
  if (n.includes('INEXIGIBILIDADE')) return 'Inexigibilidade';
  return modalidade.trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const effectToken = Deno.env.get('EFFECT_API_TOKEN');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Obter usuário autenticado
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Verificar se a API Effect está configurada
    if (!effectToken) {
      console.warn('EFFECT_API_TOKEN não configurado - sincronização desativada');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'API Effect não configurada',
          message: 'A sincronização com o Effect está desativada. Configure o EFFECT_API_TOKEN para habilitar.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Iniciando sincronização com Effect...');

    // Chamar API real do Effect
    let favoritos: EffectFavorito[] = [];
    
    try {
      const effectResponse = await fetch('https://api.effect.com.br/v1/favoritos', {
        headers: { 
          'Authorization': `Bearer ${effectToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!effectResponse.ok) {
        const errorText = await effectResponse.text();
        console.error('Erro na API Effect:', effectResponse.status, errorText);
        throw new Error(`API Effect retornou ${effectResponse.status}: ${errorText}`);
      }
      
      const effectData = await effectResponse.json();
      
      // Adaptar resposta da API Effect (ajustar conforme formato real)
      favoritos = Array.isArray(effectData) ? effectData : (effectData.data || effectData.favoritos || []);
      
      console.log(`Effect API: ${favoritos.length} favoritos encontrados`);
    } catch (apiError: any) {
      console.error('Erro ao acessar API Effect:', apiError);
      return new Response(
        JSON.stringify({
          success: false,
          error: apiError?.message || 'Erro ao conectar com API Effect',
          message: 'Não foi possível sincronizar. Verifique a configuração da API Effect.',
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (favoritos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          results: { created: 0, updated: 0, ignored: 0, errors: 0 },
          message: 'Nenhum favorito encontrado na API Effect para sincronizar.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const results = {
      created: 0,
      updated: 0,
      ignored: 0,
      errors: 0,
    };

    for (const favorito of favoritos) {
      try {
        // Verificar se já existe (por código ou effectId)
        const { data: existing } = await supabase
          .from('licitacoes')
          .select('id, status, observacoes')
          .or(`licitacao_codigo.eq.${favorito.codigo},effect_id.eq.${favorito.id}`)
          .maybeSingle();

        if (existing) {
          // Card já existe - atualizar APENAS campos informativos, NUNCA o status
          // Isso preserva movimentos manuais no Kanban
          const updateData = {
            titulo: favorito.titulo,
            licitacao_codigo: favorito.codigo,
            municipio_uf: `${favorito.municipio}/${favorito.uf}`,
            subtipo_modalidade: inferSubtipo(favorito.modalidade),
            tipo_modalidade: inferTipo(favorito.modalidade),
            orgao: favorito.orgao,
            objeto: favorito.descricao || favorito.titulo,
            valor_estimado: favorito.valorEstimado,
            data_disputa: favorito.dataDisputa,
            etiquetas: favorito.tags || [],
            fonte: 'Effect',
            effect_id: favorito.id,
            numero_edital: favorito.codigo,
            // IMPORTANTE: NÃO incluímos 'status' aqui para preservar alterações manuais
          };

          const { data: updated, error: updateError } = await supabase
            .from('licitacoes')
            .update(updateData)
            .eq('id', existing.id)
            .select('id')
            .single();

          if (updateError) throw updateError;

          results.updated++;

          await supabase.from('effect_sync_logs').insert({
            tipo: 'updated',
            licitacao_id: updated.id,
            effect_id: favorito.id,
            licitacao_codigo: favorito.codigo,
            detalhes: { 
              favorito, 
              nota: 'Status preservado - apenas campos informativos atualizados',
              statusAtual: existing.status 
            },
            usuario_id: userId,
          });

          console.log(`Atualizado (status preservado): ${favorito.codigo}`);
        } else {
          // Card novo - criar com status inicial
          const licitacaoData = {
            titulo: favorito.titulo,
            licitacao_codigo: favorito.codigo,
            municipio_uf: `${favorito.municipio}/${favorito.uf}`,
            subtipo_modalidade: inferSubtipo(favorito.modalidade),
            tipo_modalidade: inferTipo(favorito.modalidade),
            orgao: favorito.orgao,
            objeto: favorito.descricao || favorito.titulo,
            valor_estimado: favorito.valorEstimado,
            data_disputa: favorito.dataDisputa,
            etiquetas: favorito.tags || [],
            observacoes: favorito.descricao?.substring(0, 2000),
            fonte: 'Effect',
            effect_id: favorito.id,
            status: 'captacao_edital' as const,
            numero_edital: favorito.codigo,
          };

          const { data: created, error: createError } = await supabase
            .from('licitacoes')
            .insert(licitacaoData)
            .select('id')
            .single();

          if (createError) throw createError;

          const licitacaoId = created.id;
          results.created++;

          // Criar tarefa na worklist
          const dataLimite = new Date();
          dataLimite.setDate(dataLimite.getDate() + 2);

          const dataDisputa = new Date(favorito.dataDisputa);
          const diasAteDisputa = Math.ceil(
            (dataDisputa.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          const prioridade = diasAteDisputa <= 10 ? 'alta' : 'media';

          await supabase.from('worklist_tarefas').insert({
            modulo: 'licitacoes',
            titulo: `Captação de edital – ${favorito.codigo}`,
            descricao: `Edital: ${favorito.titulo}`,
            status: 'captacao_edital',
            prioridade,
            data_limite: dataLimite.toISOString().split('T')[0],
            licitacao_id: licitacaoId,
            created_by: userId,
          });

          await supabase.from('effect_sync_logs').insert({
            tipo: 'created',
            licitacao_id: licitacaoId,
            effect_id: favorito.id,
            licitacao_codigo: favorito.codigo,
            detalhes: { favorito },
            usuario_id: userId,
          });

          console.log(`Criado: ${favorito.codigo}`);

          // Download e upload do PDF (com retry) - verifica duplicatas antes
          if (favorito.pdfUrl) {
            const baseFileName = favorito.codigo.replace(/[^a-zA-Z0-9]/g, '_');

            // Verificar se já existe PDF para esta licitação
            const { data: existingFiles } = await supabase.storage
              .from('editais-pdfs')
              .list(licitacaoId);

            const alreadyExists = existingFiles?.some(f => f.name.startsWith(baseFileName)) ?? false;

            if (alreadyExists) {
              console.log(`PDF já existe para ${favorito.codigo}, pulando upload`);
            } else {
              let retries = 3;
              let pdfUploaded = false;

              while (retries > 0 && !pdfUploaded) {
                try {
                  const pdfResponse = await fetch(favorito.pdfUrl);
                  if (!pdfResponse.ok) throw new Error('Falha ao baixar PDF');

                  const pdfBlob = await pdfResponse.blob();
                  const fileName = `${baseFileName}_${Date.now()}.pdf`;

                  const { error: uploadError } = await supabase.storage
                    .from('editais-pdfs')
                    .upload(`${licitacaoId}/${fileName}`, pdfBlob, {
                      contentType: 'application/pdf',
                      upsert: false,
                    });

                  if (uploadError && !uploadError.message.includes('already exists')) {
                    throw uploadError;
                  }

                  pdfUploaded = true;
                  console.log(`PDF anexado: ${fileName}`);
                } catch (pdfError) {
                  retries--;
                  if (retries === 0) {
                    console.error(`Falha ao anexar PDF após 3 tentativas: ${pdfError}`);
                    await supabase.from('effect_sync_logs').insert({
                      tipo: 'error',
                      licitacao_id: licitacaoId,
                      effect_id: favorito.id,
                      licitacao_codigo: favorito.codigo,
                      erro: `Falha ao baixar PDF: ${(pdfError as any)?.message || String(pdfError)}`,
                      usuario_id: userId,
                    });
                  } else {
                    await new Promise(resolve => setTimeout(resolve, 2000 * (4 - retries)));
                  }
                }
              }
            }
          }
        }
      } catch (itemError: any) {
        results.errors++;
        console.error(`Erro ao processar ${favorito.codigo}:`, itemError);

        await supabase.from('effect_sync_logs').insert({
          tipo: 'error',
          effect_id: favorito.id,
          licitacao_codigo: favorito.codigo,
          erro: itemError?.message || String(itemError),
          detalhes: { favorito },
          usuario_id: userId,
        });
      }
    }

    console.log('Sincronização concluída:', results);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        message: `Sincronização concluída: ${results.created} criados, ${results.updated} atualizados (status preservado), ${results.errors} erros`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Erro na sincronização:', error);
    return new Response(
      JSON.stringify({ error: error?.message || String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
