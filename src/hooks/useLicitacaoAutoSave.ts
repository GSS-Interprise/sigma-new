import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

type LicitacaoUpdate = Database["public"]["Tables"]["licitacoes"]["Update"];

interface AutoSavePayload {
  id: string;
  data: LicitacaoUpdate;
  changedFields: string[];
  dataString: string;
  expectedUpdatedAt: string | null;
}

const DEBOUNCE_MS = 200;
const MAX_RETRIES = 3;

export function useLicitacaoAutoSave(licitacaoId: string | null, onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIdRef = useRef<string | null>(licitacaoId);
  const lastIdRef = useRef<string | null>(licitacaoId);

  const lastSavedDataRef = useRef<string>("");
  const pendingPayloadRef = useRef<AutoSavePayload | null>(null);
  const lastKnownUpdatedAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (licitacaoId && licitacaoId !== lastIdRef.current) {
      pendingPayloadRef.current = null;
      lastSavedDataRef.current = "";
      lastKnownUpdatedAtRef.current = null;
    }

    if (licitacaoId) {
      currentIdRef.current = licitacaoId;
      lastIdRef.current = licitacaoId;
      return;
    }

    if (pendingPayloadRef.current) return;

    currentIdRef.current = null;
    lastIdRef.current = null;
  }, [licitacaoId]);

  /**
   * Executa o UPDATE com retry automático em caso de conflito de updated_at.
   * Estratégia: fetch + rebase + retry (até 3x), depois fallback sem check.
   */
  const executeUpdateWithRetry = async (
    id: string,
    data: LicitacaoUpdate,
    changedFields: string[],
    expectedUpdatedAt: string | null,
    retryCount = 0
  ): Promise<{ id: string; updated_at: string }> => {
    const nextUpdatedAt = new Date().toISOString();

    let updateQuery = supabase
      .from("licitacoes")
      .update({ ...data, updated_at: nextUpdatedAt })
      .eq("id", id);

    // Na última tentativa (fallback), não verifica updated_at
    const isFallback = retryCount >= MAX_RETRIES;
    
    if (!isFallback && expectedUpdatedAt) {
      updateQuery = updateQuery.eq("updated_at", expectedUpdatedAt);
    } else if (!isFallback && !expectedUpdatedAt) {
      updateQuery = updateQuery.is("updated_at", null);
    }

    const { data: updatedRows, error } = await updateQuery.select("id, updated_at");
    if (error) throw error;

    // Se atualizou, sucesso!
    if (updatedRows && updatedRows.length > 0) {
      const saved = updatedRows[0];
      return { id: saved.id, updated_at: saved.updated_at as string };
    }

    // 0 rows = conflito de updated_at
    if (retryCount >= MAX_RETRIES) {
      // Fallback final: força update sem check (já foi feito acima com isFallback=true)
      // Se chegou aqui com isFallback=true e 0 rows, algo muito errado aconteceu
      throw new Error("Não foi possível salvar após múltiplas tentativas.");
    }

    // Fetch o updated_at atual e tenta novamente
    console.log(`[auto-save] Conflito detectado, retry ${retryCount + 1}/${MAX_RETRIES}`);
    
    const { data: currentRow, error: fetchErr } = await supabase
      .from("licitacoes")
      .select("updated_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !currentRow) {
      throw new Error("Erro ao buscar dados atuais para retry.");
    }

    const freshUpdatedAt = currentRow.updated_at as string;
    
    // Retry recursivo com o novo updated_at
    return executeUpdateWithRetry(id, data, changedFields, freshUpdatedAt, retryCount + 1);
  };

  // Ref para mutation (necessário para evitar closure stale em callbacks)
  const saveMutationRef = useRef<ReturnType<typeof useMutation<{ id: string; updated_at: string }, Error, AutoSavePayload>> | null>(null);

  const saveMutation = useMutation({
    mutationFn: async ({ id, data, changedFields, expectedUpdatedAt }: AutoSavePayload) => {
      if (!id) throw new Error("ID da licitação não fornecido");

      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Usuário não autenticado");

      // Executa update com retry automático
      const result = await executeUpdateWithRetry(id, data, changedFields, expectedUpdatedAt);

      // Monta descrição para atividade
      const camposLabels: Record<string, string> = {
        titulo: "Título",
        numero_edital: "Nº Edital",
        orgao: "Órgão",
        objeto: "Objeto",
        status: "Status",
        responsavel_id: "Responsável",
        data_disputa: "Data Disputa",
        valor_estimado: "Valor Est.",
        tipo_modalidade: "Tipo Mod.",
        subtipo_modalidade: "Subtipo Mod.",
        municipio_uf: "Município/UF",
        cnpj_orgao: "CNPJ",
        etiquetas: "Etiquetas",
        observacoes: "Observações",
        prioridade: "Prioridade",
        tipo_licitacao: "Tipo",
      };

      const camposAlterados = changedFields
        .filter((f) => camposLabels[f])
        .map((f) => camposLabels[f])
        .join(", ");

      const descricao = camposAlterados ? `editou: ${camposAlterados}` : "editou";

      await supabase.from("licitacoes_atividades").insert({
        licitacao_id: id,
        user_id: userData.user.id,
        tipo: "campo_atualizado",
        descricao,
      });

      return result;
    },
    onSuccess: (result, variables) => {
      if (result?.updated_at) {
        lastKnownUpdatedAtRef.current = result.updated_at;
      }

      lastSavedDataRef.current = variables.dataString;

      if (pendingPayloadRef.current?.dataString === variables.dataString) {
        pendingPayloadRef.current = null;
      }

      // Se o usuário digitou mais coisas enquanto salvava, agenda próximo save
      // Usa setTimeout para evitar chamar mutate dentro do callback (corrompe React queue)
      const pendingNow = pendingPayloadRef.current;
      if (pendingNow && pendingNow.dataString !== lastSavedDataRef.current) {
        console.log('[auto-save] replay pending after success', { id: pendingNow.id });
        setTimeout(() => {
          saveMutationRef.current?.mutate(pendingNow);
        }, 0);
      }

      queryClient.invalidateQueries({ queryKey: ["licitacoes-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
      if (result?.id) {
        queryClient.invalidateQueries({ queryKey: ["licitacoes-atividades", result.id] });
      }
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar. Tentando novamente...");
    },
  });

  // Sincroniza ref após criar mutation
  saveMutationRef.current = saveMutation;

  const triggerSaveIfIdle = useCallback(() => {
    const pending = pendingPayloadRef.current;
    if (!pending) return;

    if (pending.dataString === lastSavedDataRef.current) {
      pendingPayloadRef.current = null;
      return;
    }

    if (!saveMutationRef.current || saveMutationRef.current.isPending) return;

    console.log('[auto-save] save', { id: pending.id });
    saveMutationRef.current.mutate(pending);
  }, []);

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    triggerSaveIfIdle();
  }, [triggerSaveIfIdle]);

  const buildPayload = useCallback(
    (formData: any, previousData?: any): AutoSavePayload | null => {
      const currentId = currentIdRef.current;
      if (!currentId) {
        console.log("Save ignorado: sem ID de licitação");
        return null;
      }

      // Inicializa o updated_at conhecido apenas uma vez
      const prevUpdatedAt = previousData?.updated_at ?? null;
      if (!lastKnownUpdatedAtRef.current && prevUpdatedAt) {
        lastKnownUpdatedAtRef.current = prevUpdatedAt;
      }

      // DELTA ONLY: só envia campos que REALMENTE mudaram
      const dataToSave: LicitacaoUpdate = {};
      const changedFields: string[] = [];

      const normalize = (v: any) => (v === '' || v === undefined ? null : v);

      const checkAndAdd = (key: string, formValue: any, transform?: (v: any) => any) => {
        const finalValue = transform ? transform(formValue) : formValue;
        const normalizedFinal = normalize(finalValue);
        const normalizedPrev = normalize(previousData?.[key]);

        // Só adiciona se MUDOU
        if (JSON.stringify(normalizedFinal) !== JSON.stringify(normalizedPrev)) {
          (dataToSave as any)[key] = normalizedFinal;
          changedFields.push(key);
        }
      };

      checkAndAdd('titulo', formData.titulo);
      checkAndAdd('numero_edital', formData.numero_edital);
      checkAndAdd('orgao', formData.orgao);
      checkAndAdd('objeto', formData.objeto);
      checkAndAdd('status', formData.status);
      checkAndAdd('responsavel_id', formData.responsavel_id, (v) => 
        v && String(v).trim() !== '' ? String(v) : null
      );
      checkAndAdd('data_disputa', formData.data_disputa, (v) =>
        v?.toISOString?.() || v || null
      );
      checkAndAdd('valor_estimado', formData.valor_estimado, (v) =>
        v === '' || v === undefined ? null : v
      );
      checkAndAdd('tipo_modalidade', formData.tipo_modalidade);
      checkAndAdd('subtipo_modalidade', formData.subtipo_modalidade);
      checkAndAdd('municipio_uf', formData.municipio_uf);
      checkAndAdd('cnpj_orgao', formData.cnpj_orgao);
      checkAndAdd('etiquetas', formData.etiquetas);
      checkAndAdd('observacoes', formData.observacoes);
      checkAndAdd('tipo_licitacao', formData.tipo_licitacao);
      checkAndAdd('prioridade', formData.prioridade);

      // Campos customizados
      const dadosCustomizados: Record<string, any> = {};
      Object.keys(formData).forEach((key) => {
        if (key.startsWith("custom_") && formData[key] !== undefined && formData[key] !== "") {
          dadosCustomizados[key] = formData[key];
        }
      });
      if (Object.keys(dadosCustomizados).length > 0) {
        const prevCustom = previousData?.dados_customizados || {};
        if (JSON.stringify(dadosCustomizados) !== JSON.stringify(prevCustom)) {
          dataToSave.dados_customizados = dadosCustomizados;
          changedFields.push('dados_customizados');
        }
      }

      // Se não há campos alterados, não precisa salvar
      if (changedFields.length === 0) {
        return null;
      }

      const dataString = JSON.stringify(dataToSave);

      // Se já está salvo, não precisa
      if (dataString === lastSavedDataRef.current) return null;

      return {
        id: currentId,
        data: dataToSave,
        changedFields,
        dataString,
        expectedUpdatedAt: lastKnownUpdatedAtRef.current ?? prevUpdatedAt,
      };
    },
    []
  );

  const autoSave = useCallback(
    (formData: any, previousData?: any) => {
      const payload = buildPayload(formData, previousData);
      if (!payload) return;

      pendingPayloadRef.current = payload;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        triggerSaveIfIdle();
      }, DEBOUNCE_MS);
    },
    [buildPayload, triggerSaveIfIdle]
  );

  const saveNow = useCallback(
    async (formData: any, previousData?: any): Promise<{ updated_at: string } | false> => {
      const payload = buildPayload(formData, previousData);
      if (!payload) return false;

      pendingPayloadRef.current = payload;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      if (!saveMutationRef.current) return false;
      const result = await saveMutationRef.current.mutateAsync(payload);
      return result ? { updated_at: result.updated_at } : false;
    },
    [buildPayload]
  );

  useEffect(() => {
    return () => {
      try {
        flush();
      } catch {
        // ignore
      }
    };
  }, [flush]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("visibilitychange", onVisibility);
    return () => window.removeEventListener("visibilitychange", onVisibility);
  }, [flush]);

  const manualSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const pending = pendingPayloadRef.current;
    const hasPending = !!pending && pending.dataString !== lastSavedDataRef.current;

    if (hasPending) {
      console.log('[auto-save] manual save requested', { id: pending!.id });
      triggerSaveIfIdle();
    }

    return hasPending;
  }, [triggerSaveIfIdle]);

  const syncUpdatedAt = useCallback((updatedAt: string | null) => {
    lastKnownUpdatedAtRef.current = updatedAt;
  }, []);

  return {
    autoSave,
    saveNow,
    flush,
    manualSave,
    syncUpdatedAt,
    isSaving: saveMutation.isPending,
    hasPendingChanges: () => {
      const pending = pendingPayloadRef.current;
      return pending !== null && pending.dataString !== lastSavedDataRef.current;
    },
  };
}
