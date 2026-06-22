import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

/**
 * Alerta tarefas com horário definido: dispara toast quando faltam
 * ~10 minutos para o horário (janela 9–11 min). Cada tarefa só avisa
 * uma vez por sessão por dia.
 */
export type TarefaHoraAlerta = {
  id: string;
  titulo: string;
  data_limite_hora: string;
  diff: number;
};

export function useTarefasHoraAlerta() {
  const { user } = useAuth();

  const hojeISO = new Date().toISOString().slice(0, 10);
  const [pendentes, setPendentes] = useState<TarefaHoraAlerta[]>([]);

  const { data: tarefas = [] } = useQuery({
    queryKey: ["tarefas-hora-alerta", user?.id, hojeISO],
    enabled: !!user?.id,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const uid = user!.id;
      const [mencRes, finRes] = await Promise.all([
        supabase.from("worklist_tarefa_mencionados").select("tarefa_id").eq("user_id", uid),
        supabase.from("worklist_tarefa_finalizadores").select("tarefa_id").eq("user_id", uid),
      ]);
      const extraIds = Array.from(
        new Set([
          ...(mencRes.data ?? []).map((m: any) => m.tarefa_id),
          ...(finRes.data ?? []).map((m: any) => m.tarefa_id),
        ]),
      );
      const orParts = [`created_by.eq.${uid}`, `responsavel_id.eq.${uid}`];
      if (extraIds.length) orParts.push(`id.in.(${extraIds.join(",")})`);

      const { data } = await supabase
        .from("worklist_tarefas")
        .select("id, titulo, data_limite, data_limite_hora, status, modulo")
        .eq("modulo", "demandas")
        .neq("status", "concluida")
        .is("deleted_at", null)
        .eq("data_limite", hojeISO)
        .not("data_limite_hora", "is", null)
        .or(orParts.join(","));
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!tarefas.length) {
      setPendentes([]);
      return;
    }
    const storageKey = `tarefa-hora-alerta:${hojeISO}`;
    const avisadas: string[] = (() => {
      try {
        return JSON.parse(sessionStorage.getItem(storageKey) || "[]");
      } catch {
        return [];
      }
    })();

    const agora = new Date();
    const nowMin = agora.getHours() * 60 + agora.getMinutes();

    const novosPendentes: TarefaHoraAlerta[] = [];
    for (const t of tarefas as any[]) {
      const hora: string = t.data_limite_hora;
      const [hh, mm] = hora.split(":").map((n: string) => parseInt(n, 10));
      if (isNaN(hh) || isNaN(mm)) continue;
      const taskMin = hh * 60 + mm;
      const diff = taskMin - nowMin;
      // Janela: 0 a 15 min antes do horário => mostra modal grande
      if (diff >= 0 && diff <= 15) {
        novosPendentes.push({ id: t.id, titulo: t.titulo, data_limite_hora: hora, diff });
        if (!avisadas.includes(t.id)) {
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(`Tarefa em ${diff} min`, { body: `${t.titulo} • ${hora.slice(0, 5)}` });
            } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
              Notification.requestPermission();
            }
          } catch {
            /* ignore */
          }
          avisadas.push(t.id);
        }
      }
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(avisadas));
    } catch {
      /* ignore */
    }
    setPendentes(novosPendentes);
  }, [tarefas, hojeISO]);

  const dispensar = (id: string) => {
    setPendentes((p) => p.filter((t) => t.id !== id));
  };

  return { pendentes, dispensar };
}