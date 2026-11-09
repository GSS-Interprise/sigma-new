import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, subDays, subMonths } from "date-fns";
import { Download, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BiCombobox } from "@/components/bi/BiCombobox";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { BlocoDestrava, BlocoEsforco, BlocoFunil, BlocoMercado, BlocoObjecoes } from "./Blocos";
import { ModoGestao } from "./ModoGestao";
import { mil, useRaioXDestrava, useRaioXFunil, useRaioXObjecoes, type FiltroRaioX } from "./useRaioX";

/**
 * Raio-X do mercado médico (plano GSS dono no comando, Fase 7).
 * Pergunta da tela: "por que é difícil preencher [especialidade] em [lugar], com prova?"
 * Modo apresentação vai para o hospital (sem nome de médico, PDF); modo gestão é só da GSS.
 * Filtros vivem na URL (?esp=&uf=&periodo=&modo=) para os atalhos da campanha e da vaga.
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

// Imprime só o modo apresentação (Baixar PDF = imprimir e salvar como PDF).
const CSS_IMPRESSAO = `@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden !important; }
  #raiox-apresentacao, #raiox-apresentacao * { visibility: visible !important; }
  #raiox-apresentacao { position: absolute; left: 0; top: 0; width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export function RaioXMercado() {
  const [sp, setSp] = useSearchParams();
  const { data: especialidades } = useEspecialidades();
  const { userRoles } = usePermissions();
  const podeGestao = userRoles.some((r: any) => PAPEIS_GESTAO.includes(r.role));
  const ref = useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);

  const espPadrao = useMemo(() => (especialidades?.find((e) => e.nome === "PEDIATRIA") ?? especialidades?.[0])?.id ?? "", [especialidades]);
  const espId = sp.get("esp") || espPadrao;
  const uf = sp.get("uf") || null;
  const periodo = PERIODOS[sp.get("periodo") || ""] ? (sp.get("periodo") as string) : "tudo";
  const modo = podeGestao && sp.get("modo") === "gestao" ? "gestao" : "apresentacao";
  const desdeData = PERIODOS[periodo].desde();
  const filtro: FiltroRaioX = { especialidadeId: espId, uf, desde: desdeData ? format(desdeData, "yyyy-MM-dd") : null };
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

  useEffect(() => {
    const aoMudar = () => setTelaCheia(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);
  const apresentar = () => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen());

  const subtitulo = [espNome, uf || "Brasil", PERIODOS[periodo].rotulo.toLowerCase()].join(" · ");

  return (
    <div className="space-y-4">
      <style>{CSS_IMPRESSAO}</style>

      <div className="flex flex-wrap items-center gap-2">
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
            <>
              <Button variant="outline" size="sm" className="h-9" onClick={apresentar}><Maximize2 className="mr-1.5 h-4 w-4" />Apresentar</Button>
              <Button variant="outline" size="sm" className="h-9" onClick={() => window.print()}><Download className="mr-1.5 h-4 w-4" />Baixar PDF</Button>
            </>
          )}
        </div>
      </div>

      {modo === "gestao" ? (
        <ModoGestao filtro={filtro} />
      ) : (
        <div ref={ref} id="raiox-apresentacao" className={cn("space-y-4 bg-background", telaCheia && "overflow-auto p-10")}>
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">GSS · Gestão Serviço Saúde</p>
              <h2 className="text-xl font-semibold">Raio-X do mercado: {subtitulo}</h2>
            </div>
            {telaCheia && (
              <Button variant="ghost" size="sm" onClick={apresentar}><Minimize2 className="mr-1.5 h-4 w-4" />Sair</Button>
            )}
          </div>

          {funil.isError ? (
            <Card className="p-6 text-sm text-red-600">Não consegui montar o Raio-X. Recarregue a página.</Card>
          ) : (
            <>
              <BlocoMercado f={f} esp={espNome} uf={uf} />
              {f && (f.alcancados === 0 ? (
                <Card className="p-5">
                  <p className="font-medium">Ainda não prospectamos {espNome}{uf ? ` em ${uf}` : ""}{periodo !== "tudo" ? " neste período" : ""}.</p>
                  <p className="mt-1 text-sm text-muted-foreground">{mil(f.base_crm)} especialistas na base da GSS prontos para a primeira campanha.</p>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
                    <BlocoEsforco f={f} />
                    <BlocoFunil f={f} />
                  </div>
                  <BlocoObjecoes o={objecoes.data} />
                  <BlocoDestrava d={destrava.data} esp={espNome} uf={uf} />
                </>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
