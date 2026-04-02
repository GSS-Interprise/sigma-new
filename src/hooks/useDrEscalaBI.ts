import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Local {
  id: number;
  nome: string;
}

interface Setor {
  id: number;
  nome: string;
}

interface Plantao {
  data: string;
  hora: string;
  nome_profissional: string;
}

interface LocaisSetoresResponse {
  locais: Local[];
  setores: Setor[];
}

export function useDrEscalaBI(mes: number, ano: number, localId?: number, setorId?: number) {
  // Buscar locais e setores
  const locaisSetoresQuery = useQuery<LocaisSetoresResponse>({
    queryKey: ["drescala-locais-setores"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("drescala-bi", {
        body: null,
        headers: {},
      });
      
      // Use GET with query params via URL
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drescala-bi?action=locais-setores`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao buscar locais/setores: ${errorText}`);
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 30, // 30 min cache
  });

  // Buscar plantões
  const plantoesQuery = useQuery<Plantao[]>({
    queryKey: ["drescala-plantoes", mes, ano, localId, setorId],
    queryFn: async () => {
      let url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drescala-bi?action=plantoes&mes=${mes}&ano=${ano}`;
      if (localId) url += `&local_id=${localId}`;
      if (setorId) url += `&setor_id=${setorId}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao buscar plantões: ${errorText}`);
      }

      return response.json();
    },
    enabled: !!mes && !!ano,
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  // Agregar dados por profissional
  const profissionaisAgregados = (() => {
    if (!plantoesQuery.data) return [];
    
    const map = new Map<string, { nome: string; totalPlantoes: number; datasPlantoes: string[] }>();
    
    for (const p of plantoesQuery.data) {
      const existing = map.get(p.nome_profissional);
      if (existing) {
        existing.totalPlantoes++;
        if (!existing.datasPlantoes.includes(p.data)) {
          existing.datasPlantoes.push(p.data);
        }
      } else {
        map.set(p.nome_profissional, {
          nome: p.nome_profissional,
          totalPlantoes: 1,
          datasPlantoes: [p.data],
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalPlantoes - a.totalPlantoes);
  })();

  // Agregar por dia
  const plantoesPorDia = (() => {
    if (!plantoesQuery.data) return [];
    
    const map = new Map<string, number>();
    
    for (const p of plantoesQuery.data) {
      map.set(p.data, (map.get(p.data) || 0) + 1);
    }

    return Array.from(map.entries())
      .map(([data, count]) => ({ data, count }))
      .sort((a, b) => a.data.localeCompare(b.data));
  })();

  return {
    locais: locaisSetoresQuery.data?.locais || [],
    setores: locaisSetoresQuery.data?.setores || [],
    plantoes: plantoesQuery.data || [],
    profissionaisAgregados,
    plantoesPorDia,
    totalPlantoes: plantoesQuery.data?.length || 0,
    totalProfissionais: profissionaisAgregados.length,
    isLoading: locaisSetoresQuery.isLoading || plantoesQuery.isLoading,
    isError: locaisSetoresQuery.isError || plantoesQuery.isError,
    error: locaisSetoresQuery.error || plantoesQuery.error,
  };
}
