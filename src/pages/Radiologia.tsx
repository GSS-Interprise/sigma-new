// Radiologia = SLA de laudos (22/11/2026: a pedido do Raul ficaram só as 4 abas do SLA). As abas antigas de importação
// (Agendas, Produção, Pendências e Atrasos, Revisão de Laudos, Controle de ECG, Histórico de Imports) estavam sem uso
// (tabelas vazias ou quase) e saíram da tela; os componentes continuam em src/components/radiologia/ se voltarem.
import { useSearchParams } from "react-router-dom";
import { BellRing, Timer, UserCheck, Users } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaSlaAoVivo } from "@/components/radiologia/sla/AbaSlaAoVivo";
import { AbaEscalaPlantao } from "@/components/radiologia/sla/AbaEscalaPlantao";
import { AbaAvisos } from "@/components/radiologia/sla/AbaAvisos";
import { AbaCoordenacao } from "@/components/radiologia/sla/AbaCoordenacao";
import { EstacaoDestinos } from "@/components/radiologia/sla/EstacaoDestinos";
import { UNIDADES, useUnidade } from "@/components/radiologia/sla/useSla";

const ABAS = ["sla", "escala-sla", "avisos-sla", "coordenacao-sla"];

export default function Radiologia() {
  // Aba na URL (?aba=) para o link do e-mail e do WhatsApp abrir direto no SLA; aba antiga cai no SLA ao vivo.
  const [params, setParams] = useSearchParams();
  const aba = ABAS.includes(params.get("aba") || "") ? params.get("aba")! : "sla";
  const porUnidade = aba === "sla" || aba === "escala-sla";
  const unidade = useUnidade();

  const headerActions = (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold">SLA de laudos</h1>
        <p className="text-sm text-muted-foreground">{porUnidade ? `Prazo de laudo dos exames do PACS · ${unidade.nome}` : "Vale para todas as unidades"}</p>
      </div>
      {porUnidade && (
        // Fila, estação e escala são por unidade; avisos e coordenação valem para todas.
        <div className="inline-flex shrink-0 rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="Unidade">
          {UNIDADES.map((u) => (
            <button key={u.id} type="button" role="radio" aria-checked={unidade.id === u.id} onClick={() => unidade.trocar(u.id)}
              className={`h-8 whitespace-nowrap rounded-md px-3 text-sm font-medium ${unidade.id === u.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {u.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="space-y-5 p-4">
        <Tabs value={aba} onValueChange={(v) => { const p = new URLSearchParams(params); p.set("aba", v); setParams(p, { replace: true }); }} className="w-full">
          <TabsList>
            <TabsTrigger value="sla" className="gap-2"><Timer className="h-4 w-4" />SLA ao vivo</TabsTrigger>
            <TabsTrigger value="escala-sla" className="gap-2"><UserCheck className="h-4 w-4" />Escala de plantão</TabsTrigger>
            <TabsTrigger value="avisos-sla" className="gap-2"><BellRing className="h-4 w-4" />Avisos</TabsTrigger>
            <TabsTrigger value="coordenacao-sla" className="gap-2"><Users className="h-4 w-4" />Coordenação</TabsTrigger>
          </TabsList>
          <TabsContent value="sla" className="mt-5" data-portao="sla"><AbaSlaAoVivo /></TabsContent>
          <TabsContent value="escala-sla" className="mt-5 space-y-6"><AbaEscalaPlantao /></TabsContent>
          <TabsContent value="avisos-sla" className="mt-5 space-y-6"><AbaAvisos /></TabsContent>
          <TabsContent value="coordenacao-sla" className="mt-5 space-y-6"><AbaCoordenacao /><EstacaoDestinos /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
