import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { format, subDays, subMonths } from "date-fns";
import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BiCombobox } from "@/components/bi/BiCombobox";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { Apresentacao } from "./Apresentacao";
import { BlocoFalas, BlocoGargalo, BlocoObjecoes, Fonte } from "./Blocos";
import { ModoGestao } from "./ModoGestao";
import { mil, useRaioXDestrava, useRaioXEsforco, useRaioXFunil, useRaioXObjecoes, ZENVIA_RAIOX, type FiltroRaioX } from "./useRaioX";

/**
 * Raio-X do mercado médico (plano GSS dono no comando, Fase 7).
 * Pergunta da tela: "por que é difícil preencher [especialidade] em [lugar], com prova?"
 * Modo apresentação vai para o hospital (sem nome de médico, PDF); modo gestão é só da GSS.
 * Filtros vivem na URL (?camp=&esp=&uf=&periodo=&modo=) para os atalhos da campanha e da vaga.
 * Campanha (26/11, Raul): vem antes da especialidade; escolher uma campanha leva a especialidade dela junto.
 */

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
const PERIODOS: Record<string, { rotulo: string; desde: () => Date | null }> = {
  tudo: { rotulo: "Desde o início", desde: () => null },
  "6m": { rotulo: "Últimos 6 meses", desde: () => subMonths(new Date(), 6) },
  "3m": { rotulo: "Últimos 3 meses", desde: () => subMonths(new Date(), 3) },
  "30d": { rotulo: "Últimos 30 dias", desde: () => subDays(new Date(), 30) },
};
// Quem vê o modo gestão (operação interna da GSS).
const PAPEIS_GESTAO = ["admin", "diretoria", "gestor_captacao", "lideres"];

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "por"]);
const titulo = (s: string) => s.toLowerCase().split(" ").map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");

// Baixar PDF imprime só o modo apresentação. Ele é uma camada fixa com rolagem própria: na impressão vira bloco
// normal, senão sai só a primeira tela.
const CSS_IMPRESSAO = `@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden !important; }
  #raiox-apresentacao, #raiox-apresentacao * { visibility: visible !important; }
  #raiox-apresentacao { position: absolute !important; inset: 0 auto auto 0 !important; width: 100%; height: auto !important; overflow: visible !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export function RaioXMercado() {
  const [sp, setSp] = useSearchParams();
  const { data: especialidades } = useEspecialidades();
  const { userRoles } = usePermissions();
  const podeGestao = userRoles.some((r: any) => PAPEIS_GESTAO.includes(r.role));

  const espPadrao = useMemo(() => (especialidades?.find((e) => e.nome === "PEDIATRIA") ?? especialidades?.[0])?.id ?? "", [especialidades]);
  const espId = sp.get("esp") || espPadrao;
  const campId = sp.get("camp") || null;
  const { data: campanhas = [] } = useQuery({
    queryKey: ["raiox-campanhas"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("campanhas").select("id, nome, especialidade_id, status")
        .eq("tipo_campanha", "prospeccao").neq("status", "rascunho").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; especialidade_id: string | null; status: string }[];
    },
  });
  const campNome = campId === ZENVIA_RAIOX ? "Zenvia" : campanhas.find((c) => c.id === campId)?.nome.trim() ?? null;
  const uf = sp.get("uf") || null;
  const periodo = PERIODOS[sp.get("periodo") || ""] ? (sp.get("periodo") as string) : "tudo";
  const modo = podeGestao && sp.get("modo") === "gestao" ? "gestao" : "apresentacao";
  const desdeData = PERIODOS[periodo].desde();
  const filtro: FiltroRaioX = { especialidadeId: espId, uf, desde: desdeData ? format(desdeData, "yyyy-MM-dd") : null, campanhaId: campId };
  const espNome = titulo(especialidades?.find((e) => e.id === espId)?.nome || "");

  const set = (k: string, v: string | null) => setSp((prev) => {
    const n = new URLSearchParams(prev);
    if (v) n.set(k, v); else n.delete(k);
    return n;
  }, { replace: true });

  const funil = useRaioXFunil(filtro);
  const objecoes = useRaioXObjecoes(filtro);
  const destrava = useRaioXDestrava(filtro);
  const f = funil.data;
  // ?apresentar=1 abre a camada do hospital; fica na URL para recarregar e para mandar o link.
  const apresentando = modo === "apresentacao" && sp.get("apresentar") === "1";
  const esforco = useRaioXEsforco(filtro, apresentando);
  const hospital = sp.get("hosp") || "";

  return (
    <div className="space-y-4">
      <style>{CSS_IMPRESSAO}</style>

      <div className="flex flex-wrap items-center gap-2">
        <BiCombobox
          className="w-60"
          value={campId ?? "todas"}
          onChange={(v) => setSp((prev) => {
            const n = new URLSearchParams(prev);
            if (v === "todas") n.delete("camp"); else n.set("camp", v);
            const esp = campanhas.find((c) => c.id === v)?.especialidade_id;
            if (esp) n.set("esp", esp);
            return n;
          }, { replace: true })}
          options={[
            { value: "todas", label: "Todas as campanhas" },
            { value: ZENVIA_RAIOX, label: "Zenvia (disparos de fora do Sigma)" },
            ...campanhas.map((c) => ({ value: c.id, label: `${c.nome.trim()}${c.status === "ativa" ? "" : ` (${c.status})`}` })),
          ]}
          placeholder="Campanha"
          searchPlaceholder="Buscar campanha..."
        />
        <BiCombobox
          className="w-60"
          value={espId}
          onChange={(v) => set("esp", v)}
          options={(especialidades ?? []).map((e) => ({ value: e.id, label: titulo(e.nome) }))}
          placeholder="Especialidade"
          searchPlaceholder="Buscar especialidade..."
        />
        <Select value={uf || "BR"} onValueChange={(v) => set("uf", v === "BR" ? null : v)}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="BR">Brasil</SelectItem>
            {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodo} onValueChange={(v) => set("periodo", v === "tudo" ? null : v)}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(PERIODOS).map(([k, p]) => <SelectItem key={k} value={k}>{p.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {podeGestao && (
            <div className="inline-flex rounded-md border p-0.5" role="tablist">
              {(["apresentacao", "gestao"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={modo === m}
                  onClick={() => set("modo", m === "gestao" ? "gestao" : null)}
                  className={cn("h-8 rounded px-3 text-sm", modo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {m === "gestao" ? "Gestão" : "Apresentação"}
                </button>
              ))}
            </div>
          )}
          {modo === "apresentacao" && (
            <Button size="sm" className="h-9" onClick={() => set("apresentar", "1")}>
              <Presentation className="mr-1.5 h-4 w-4" />Apresentar
            </Button>
          )}
        </div>
      </div>

      {modo === "gestao" ? (
        <ModoGestao filtro={filtro} />
      ) : funil.isError ? (
        <Card className="p-6 text-sm text-red-600">Não consegui montar o Raio-X. Recarregue a página.</Card>
      ) : f && f.alcancados === 0 ? (
        <Card className="p-6">
          <p className="font-medium">{campNome ? `A campanha ${campNome} não alcançou médicos de ${espNome}` : `Ainda não prospectamos ${espNome}`}{uf ? ` em ${uf}` : ""}{periodo !== "tudo" ? " neste período" : ""}.</p>
          <p className="mt-1 text-sm text-muted-foreground">{mil(f.base_crm)} especialistas na base da GSS prontos para a primeira campanha.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <BlocoGargalo f={f} esp={espNome} uf={uf} kicker={`Raio-X do mercado · ${[campNome, espNome, uf].filter(Boolean).join(" · ")}`} />
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <BlocoObjecoes o={objecoes.data} />
            <BlocoFalas o={objecoes.data} d={destrava.data} esp={espNome} uf={uf} />
          </div>
          {f && <Fonte f={f} esp={espNome} uf={uf} />}
        </div>
      )}

      {apresentando && (
        <Apresentacao
          f={f} o={objecoes.data} d={destrava.data} e={esforco.data}
          carregando={funil.isLoading || objecoes.isLoading || destrava.isLoading || esforco.isLoading}
          esp={espNome} uf={uf} periodo={PERIODOS[periodo].rotulo.toLowerCase()}
          hospital={hospital} onHospital={(v) => set("hosp", v || null)} onSair={() => set("apresentar", null)}
        />
      )}
    </div>
  );
}
