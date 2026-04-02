import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SyncResult {
  locais: number;
  setores: number;
  plantoes: number;
  erros: number;
  inconsistencias: number;
  errosIntegracao: number;
}

interface LocalSetor {
  local_id: string;
  local_nome: string;
  setor_id: string;
  setor_nome: string;
}

interface Plantao {
  id?: string | number;
  id_plantao?: string | number;
  id_externo?: string | number;
  data?: string;
  data_plantao?: string;
  data_escala?: string;
  hora_inicio?: string;
  hora_fim?: string;
  horario_inicio?: string;
  horario_fim?: string;
  hora?: string;
  profissional?: { nome?: string; crm?: string };
  nome_profissional?: string;
  profissional_nome?: string;
  medico?: { nome?: string; crm?: string };
  nome_medico?: string;
  crm?: string;
  crm_profissional?: string;
  local_id?: string | number;
  setor_id?: string | number;
  local?: { id?: string | number; nome?: string; name?: string } | string;
  setor?: { id?: string | number; nome?: string; name?: string } | string;
  nome_local?: string;
  local_nome?: string;
  nomeLocal?: string;
  nome_setor?: string;
  setor_nome?: string;
  nomeSetor?: string;
  tipo_plantao?: string;
  status?: string;
  status_escala?: string;
}

// Função para normalizar nomes (trim, lowercase para comparação)
function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Função para limpar nome mantendo formatação original
function cleanName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.trim();
}

// Gerar chave única para identificar plantão (evitar duplicados)
function generatePlantaoKey(plantao: Plantao): string {
  const id = plantao.id_plantao || plantao.id_externo || plantao.id;
  const data = plantao.data || plantao.data_plantao || plantao.data_escala || "";
  const horaInicio = plantao.hora_inicio || plantao.horario_inicio || plantao.hora || "";
  const horaFim = plantao.hora_fim || plantao.horario_fim || "";
  const profissional = normalizeName(
    plantao.profissional?.nome || 
    plantao.nome_profissional || 
    plantao.profissional_nome ||
    plantao.medico?.nome ||
    plantao.nome_medico
  );
  
  // Se temos ID do plantão, usar como chave primária
  if (id) {
    return `plantao-${id}`;
  }
  
  // Caso contrário, criar chave composta
  return `${data}-${horaInicio}-${horaFim}-${profissional}`.replace(/\s+/g, "-");
}

export function useEscalasSyncDrEscala() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");

  const syncLocaisSetores = async (): Promise<LocalSetor[]> => {
    setSyncProgress("Buscando locais e setores do Dr. Escala...");
    
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || "";

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drescala-bi?action=locais-setores`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Erro ao buscar locais/setores: ${response.status}`);
    }

    const data = await response.json();
    console.log("[DrEscala Sync] Locais/Setores recebidos:", data);
    
    // A API pode retornar um array diretamente ou um objeto com os dados
    const locaisSetores: LocalSetor[] = Array.isArray(data) ? data : (data.data || data.locais_setores || []);
    
    return locaisSetores;
  };

  const persistirLocaisSetores = async (locaisSetores: LocalSetor[]): Promise<{ locais: number; setores: number }> => {
    setSyncProgress("Salvando locais e setores...");
    
    // Agrupar por local
    const locaisMap = new Map<string, { nome: string; setores: Array<{ id: string; nome: string }> }>();
    
    for (const item of locaisSetores) {
      const localId = String(item.local_id);
      const localNome = cleanName(item.local_nome) || `Local ${localId}`;
      
      if (!locaisMap.has(localId)) {
        locaisMap.set(localId, { 
          nome: localNome, 
          setores: [] 
        });
      }
      
      const setorNome = cleanName(item.setor_nome) || `Setor ${item.setor_id}`;
      locaisMap.get(localId)?.setores.push({
        id: String(item.setor_id),
        nome: setorNome,
      });
    }

    let locaisCount = 0;
    let setoresCount = 0;

    // Inserir/atualizar locais
    for (const [localIdExterno, localData] of locaisMap) {
      const { data: localInserted, error: localError } = await supabase
        .from("escalas_locais")
        .upsert({
          id_externo: localIdExterno,
          nome: localData.nome,
          sincronizado_em: new Date().toISOString(),
        }, { onConflict: "id_externo" })
        .select("id")
        .single();

      if (localError) {
        console.error(`Erro ao inserir local ${localIdExterno}:`, localError);
        continue;
      }
      
      locaisCount++;
      const localUuid = localInserted.id;

      // Inserir setores do local
      for (const setor of localData.setores) {
        const { error: setorError } = await supabase
          .from("escalas_setores")
          .upsert({
            id_externo: setor.id,
            local_id: localUuid,
            local_id_externo: localIdExterno,
            nome: setor.nome,
            sincronizado_em: new Date().toISOString(),
          }, { onConflict: "id_externo,local_id_externo" });

        if (setorError) {
          console.error(`Erro ao inserir setor ${setor.id}:`, setorError);
        } else {
          setoresCount++;
        }
      }
    }

    return { locais: locaisCount, setores: setoresCount };
  };

  const syncPlantoes = async (mes: number, ano: number): Promise<{ 
    plantoes: number; 
    erros: number; 
    inconsistencias: number;
    errosIntegracao: number;
  }> => {
    setSyncProgress(`Buscando plantões de ${mes}/${ano}...`);
    
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || "";

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drescala-bi?action=plantoes&mes=${mes}&ano=${ano}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Erro ao buscar plantões: ${response.status}`);
    }

    const data = await response.json();
    const plantoes: Plantao[] = Array.isArray(data) ? data : (data.data || data.plantoes || []);
    
    console.log(`[DrEscala Sync] ${plantoes.length} plantões recebidos`);
    if (plantoes.length > 0) {
      console.log("[DrEscala Sync] Estrutura do primeiro plantão:", JSON.stringify(plantoes[0], null, 2));
    }

    // LIMPAR dados antigos do mês ANTES de inserir novos (evita acúmulo/duplicação)
    const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const endDate = new Date(ano, mes, 0).toISOString().split("T")[0];
    
    setSyncProgress(`Limpando dados antigos de ${mes}/${ano}...`);
    const { error: deleteError } = await supabase
      .from("escalas_integradas")
      .delete()
      .eq("sistema_origem", "DR_ESCALA")
      .gte("data_escala", startDate)
      .lte("data_escala", endDate);
    
    if (deleteError) {
      console.error("[DrEscala Sync] Erro ao limpar dados antigos:", deleteError);
    } else {
      console.log(`[DrEscala Sync] Dados de ${mes}/${ano} limpos com sucesso`);
    }

    let sucesso = 0;
    let erros = 0;
    let inconsistencias = 0;
    let errosIntegracao = 0;

    // Rastrear chaves já processadas para evitar duplicatas no mesmo batch
    const processedKeys = new Set<string>();
    
    // Preparar dados em lote para inserção
    const plantoesToInsert: Array<Record<string, unknown>> = [];
    const errosDeIntegracao: Array<{ 
      tipo: string; 
      mensagem: string; 
      dados_payload: unknown;
      plantao_key: string;
    }> = [];

    setSyncProgress(`Processando ${plantoes.length} plantões...`);

    // PRÉ-CARREGAR todos os locais e setores em memória para evitar N+1 queries
    const locaisMap = new Map<string, string>(); // id_externo -> uuid
    const setoresMap = new Map<string, string>(); // "id_externo|local_id_externo" -> uuid

    const { data: allLocais } = await supabase
      .from("escalas_locais")
      .select("id, id_externo");
    if (allLocais) {
      for (const l of allLocais) {
        locaisMap.set(l.id_externo, l.id);
      }
    }

    const { data: allSetores } = await supabase
      .from("escalas_setores")
      .select("id, id_externo, local_id_externo");
    if (allSetores) {
      for (const s of allSetores) {
        setoresMap.set(`${s.id_externo}|${s.local_id_externo}`, s.id);
      }
    }

    console.log(`[DrEscala Sync] Cache: ${locaisMap.size} locais, ${setoresMap.size} setores`);

    for (const plantao of plantoes) {
      try {
        // Gerar chave única para o plantão
        const plantaoKey = generatePlantaoKey(plantao);
        
        // Verificar se já processamos este plantão neste batch
        if (processedKeys.has(plantaoKey)) {
          continue;
        }
        processedKeys.add(plantaoKey);
        
        // Usar id_plantao como chave primária (única e imutável)
        const idPlantao = plantao.id_plantao || plantao.id_externo || plantao.id;
        const idExterno = idPlantao ? String(idPlantao) : plantaoKey;
        
        // Extrair IDs do local e setor
        let localIdExterno: string | null = null;
        let setorIdExterno: string | null = null;
        let localNome: string | null = null;
        let setorNome: string | null = null;

        if (plantao.local_id) {
          localIdExterno = String(plantao.local_id);
        } else if (plantao.local && typeof plantao.local === "object" && plantao.local.id) {
          localIdExterno = String(plantao.local.id);
        }

        if (plantao.setor_id) {
          setorIdExterno = String(plantao.setor_id);
        } else if (plantao.setor && typeof plantao.setor === "object" && plantao.setor.id) {
          setorIdExterno = String(plantao.setor.id);
        }

        localNome = cleanName(plantao.nome_local) || cleanName(plantao.local_nome) || cleanName(plantao.nomeLocal);
        if (!localNome && plantao.local) {
          if (typeof plantao.local === "object") {
            localNome = cleanName(plantao.local.nome || plantao.local.name);
          } else if (typeof plantao.local === "string") {
            localNome = cleanName(plantao.local);
          }
        }

        setorNome = cleanName(plantao.nome_setor) || cleanName(plantao.setor_nome) || cleanName(plantao.nomeSetor);
        if (!setorNome && plantao.setor) {
          if (typeof plantao.setor === "object") {
            setorNome = cleanName(plantao.setor.nome || plantao.setor.name);
          } else if (typeof plantao.setor === "string") {
            setorNome = cleanName(plantao.setor);
          }
        }

        const dadosIncompletos = !localIdExterno || !setorIdExterno;
        let motivoIncompleto: string | null = null;
        
        if (!localIdExterno && !setorIdExterno) {
          motivoIncompleto = "Sem local e setor";
        } else if (!localIdExterno) {
          motivoIncompleto = "Sem local";
        } else if (!setorIdExterno) {
          motivoIncompleto = "Sem setor";
        }

        if (dadosIncompletos) {
          errosIntegracao++;
          errosDeIntegracao.push({
            tipo: motivoIncompleto || "Dados incompletos",
            mensagem: `Payload sem ${motivoIncompleto?.toLowerCase()}: id_externo=${idExterno}`,
            dados_payload: plantao,
            plantao_key: plantaoKey,
          });
        }

        const profissionalNomeRaw = plantao.profissional?.nome || 
          plantao.nome_profissional || 
          plantao.profissional_nome ||
          plantao.medico?.nome ||
          plantao.nome_medico;
        const profissionalNome = cleanName(profissionalNomeRaw) || "Profissional Não Informado";
        
        const profissionalCrm = plantao.profissional?.crm || 
          plantao.crm || 
          plantao.medico?.crm ||
          plantao.crm_profissional ||
          null;

        let dataEscala = plantao.data || plantao.data_plantao || plantao.data_escala;
        if (dataEscala && dataEscala.includes("/")) {
          const parts = dataEscala.split("/");
          if (parts.length === 3) {
            dataEscala = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          }
        }

        let horaInicio = plantao.hora_inicio || plantao.horario_inicio || plantao.hora || "00:00";
        let horaFim = plantao.hora_fim || plantao.horario_fim || "00:00";
        horaInicio = horaInicio.trim();
        horaFim = horaFim.trim();
        if (horaInicio.length === 5) horaInicio += ":00";
        if (horaFim.length === 5) horaFim += ":00";

        // Buscar UUIDs do cache em memória (sem queries individuais)
        const escalaLocalId = localIdExterno ? (locaisMap.get(localIdExterno) || null) : null;
        const escalaSetorId = (setorIdExterno && localIdExterno) 
          ? (setoresMap.get(`${setorIdExterno}|${localIdExterno}`) || null) 
          : null;

        plantoesToInsert.push({
          id_externo: idExterno,
          sistema_origem: "DR_ESCALA",
          profissional_nome: profissionalNome,
          profissional_crm: profissionalCrm,
          setor: setorNome || "Setor Não Informado",
          unidade: localNome,
          data_escala: dataEscala,
          hora_inicio: horaInicio,
          hora_fim: horaFim,
          tipo_plantao: plantao.tipo_plantao || null,
          status_escala: plantao.status || plantao.status_escala || "confirmado",
          local_id_externo: localIdExterno,
          setor_id_externo: setorIdExterno,
          local_nome: localNome,
          setor_nome: setorNome,
          escala_local_id: escalaLocalId,
          escala_setor_id: escalaSetorId,
          dados_incompletos: dadosIncompletos,
          motivo_incompleto: motivoIncompleto,
          sincronizado_em: new Date().toISOString(),
          dados_originais: plantao as unknown as Record<string, unknown>,
        });

        if (dadosIncompletos) {
          inconsistencias++;
        }
      } catch (err) {
        console.error("Erro ao processar plantão:", err);
        erros++;
      }
    }

    // Inserir em lotes de 100 para melhor performance
    const BATCH_SIZE = 100;
    for (let i = 0; i < plantoesToInsert.length; i += BATCH_SIZE) {
      const batch = plantoesToInsert.slice(i, i + BATCH_SIZE);
      setSyncProgress(`Salvando plantões ${i + 1}-${Math.min(i + BATCH_SIZE, plantoesToInsert.length)} de ${plantoesToInsert.length}...`);
      
      const { error } = await supabase
        .from("escalas_integradas")
        .upsert(batch as never[], { 
          onConflict: "id_externo,sistema_origem",
          ignoreDuplicates: false 
        });

      if (error) {
        console.error(`Erro ao inserir lote ${i / BATCH_SIZE + 1}:`, error);
        erros += batch.length;
      } else {
        sucesso += batch.length;
      }
    }

    // Registrar log de sincronização
    if (plantoes.length > 0) {
      await supabase.from("escalas_integracao_logs").insert({
        sistema_origem: "DR_ESCALA",
        tipo_operacao: "sync",
        registros_processados: plantoes.length,
        registros_sucesso: sucesso,
        registros_erro: erros,
        detalhes: { 
          mes, 
          ano, 
          inconsistencias,
          erros_integracao: errosIntegracao,
          motivos_erro: errosDeIntegracao.slice(0, 10).map(e => e.tipo),
        },
      } as never);
    }

    // Registrar erros de integração detalhados (primeiros 50)
    if (errosDeIntegracao.length > 0) {
      console.warn(`[DrEscala Sync] ${errosDeIntegracao.length} erros de integração (payload incompleto)`);
      console.warn("[DrEscala Sync] Exemplos de payloads incompletos:", errosDeIntegracao.slice(0, 3));
    }

    return { plantoes: sucesso, erros, inconsistencias, errosIntegracao };
  };

  // Extrair locais/setores diretamente dos dados já sincronizados (fallback)
  const extrairLocaisSetoresDosPlantoes = async (): Promise<{ locais: number; setores: number }> => {
    setSyncProgress("Extraindo locais e setores dos plantões sincronizados...");
    
    // Buscar combinações únicas de local/setor dos dados já sincronizados
    const { data: registros, error } = await supabase
      .from("escalas_integradas")
      .select("local_id_externo, local_nome, setor_id_externo, setor_nome")
      .eq("sistema_origem", "DR_ESCALA")
      .not("local_id_externo", "is", null);
    
    if (error || !registros) {
      console.error("[DrEscala Sync] Erro ao buscar locais/setores:", error);
      return { locais: 0, setores: 0 };
    }

    // Deduplicar por local_id
    const locaisMap = new Map<string, { nome: string; setores: Map<string, string> }>();
    
    for (const reg of registros) {
      if (!reg.local_id_externo) continue;
      
      const localId = String(reg.local_id_externo);
      const localNome = cleanName(reg.local_nome) || `Local ${localId}`;
      
      if (!locaisMap.has(localId)) {
        locaisMap.set(localId, { nome: localNome, setores: new Map() });
      }
      
      if (reg.setor_id_externo) {
        const setorId = String(reg.setor_id_externo);
        const setorNome = cleanName(reg.setor_nome) || `Setor ${setorId}`;
        locaisMap.get(localId)?.setores.set(setorId, setorNome);
      }
    }

    let locaisCount = 0;
    let setoresCount = 0;

    // Inserir/atualizar locais
    for (const [localIdExterno, localData] of locaisMap) {
      const { data: localInserted, error: localError } = await supabase
        .from("escalas_locais")
        .upsert({
          id_externo: localIdExterno,
          nome: localData.nome,
          ativo: true,
          sincronizado_em: new Date().toISOString(),
        }, { onConflict: "id_externo" })
        .select("id")
        .single();

      if (localError) {
        console.error(`Erro ao inserir local ${localIdExterno}:`, localError);
        continue;
      }
      
      locaisCount++;
      const localUuid = localInserted.id;

      // Inserir setores do local
      for (const [setorId, setorNome] of localData.setores) {
        const { error: setorError } = await supabase
          .from("escalas_setores")
          .upsert({
            id_externo: setorId,
            local_id: localUuid,
            local_id_externo: localIdExterno,
            nome: setorNome,
            ativo: true,
            sincronizado_em: new Date().toISOString(),
          }, { onConflict: "id_externo,local_id_externo" });

        if (setorError) {
          console.error(`Erro ao inserir setor ${setorId}:`, setorError);
        } else {
          setoresCount++;
        }
      }
    }

    console.log(`[DrEscala Sync] Locais/setores extraídos: ${locaisCount} locais, ${setoresCount} setores`);
    return { locais: locaisCount, setores: setoresCount };
  };

  const sync = async (mes: number, ano: number): Promise<SyncResult> => {
    setIsSyncing(true);
    const startTime = Date.now();
    try {
      // 1. Primeiro tentar sincronizar locais e setores via endpoint
      let locais = 0;
      let setores = 0;
      
      try {
        const locaisSetores = await syncLocaisSetores();
        if (locaisSetores.length > 0) {
          const result = await persistirLocaisSetores(locaisSetores);
          locais = result.locais;
          setores = result.setores;
        }
      } catch (e) {
        console.warn("[DrEscala Sync] Endpoint locais-setores falhou, usando fallback:", e);
      }
      
      // 2. Sincronizar plantões
      const { plantoes, erros, inconsistencias, errosIntegracao } = await syncPlantoes(mes, ano);
      
      // 3. Se não conseguiu locais via endpoint, extrair dos dados sincronizados
      if (locais === 0) {
        const fallbackResult = await extrairLocaisSetoresDosPlantoes();
        locais = fallbackResult.locais;
        setores = fallbackResult.setores;
      }
      
      setSyncProgress("");
      
      const result = { locais, setores, plantoes, erros, inconsistencias, errosIntegracao };
      
      // 4. Registrar log de sincronização
      const totalRegistros = plantoes + erros + inconsistencias;
      const status = erros > 0 ? "parcial" : "sucesso";
      const mensagem = `Sincronização ${mes.toString().padStart(2, "0")}/${ano}: ${plantoes} plantões, ${locais} locais, ${setores} setores`;
      
      await supabase.from("escalas_integracao_logs").insert({
        sistema_origem: "DR_ESCALA",
        tipo_operacao: "sync_manual",
        status,
        total_registros: totalRegistros,
        registros_sucesso: plantoes,
        registros_erro: erros + inconsistencias,
        mensagem,
      });
      
      if (erros > 0 || inconsistencias > 0) {
        toast.warning(`Sincronização concluída com alertas`, {
          description: `${plantoes} plantões, ${inconsistencias} com dados incompletos, ${errosIntegracao} erros de payload, ${erros} erros`,
        });
      } else {
        toast.success(`Sincronização concluída`, {
          description: `${locais} locais, ${setores} setores, ${plantoes} plantões`,
        });
      }
      
      return result;
    } catch (error) {
      console.error("Erro na sincronização:", error);
      
      // Registrar log de erro
      await supabase.from("escalas_integracao_logs").insert({
        sistema_origem: "DR_ESCALA",
        tipo_operacao: "sync_manual",
        status: "erro",
        total_registros: 0,
        registros_sucesso: 0,
        registros_erro: 0,
        mensagem: error instanceof Error ? error.message : "Erro desconhecido",
      });
      
      toast.error("Erro na sincronização", {
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
      throw error;
    } finally {
      setIsSyncing(false);
      setSyncProgress("");
    }
  };

  return {
    sync,
    isSyncing,
    syncProgress,
  };
}
