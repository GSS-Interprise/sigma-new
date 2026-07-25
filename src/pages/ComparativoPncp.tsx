import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ExternalLink, Loader2, MapPin, DollarSign, Calendar,
  CheckCircle2, TrendingUp, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

// Comparativo PNCP x Effecti. Responde duas perguntas de negócio:
//   "o robô pega tudo que a Effecti pega?"  -> balde so_effecti (risco do corte)
//   "o robô acha o que a Effecti não acha?" -> balde so_pncp (ganho do robô)
// Toda a lógica de casamento vive na RPC pncp_comparativo (SQL), pra bater
// exatamente com os números do pncp_cobertura_medir e nunca se contradizer.

type Balde = "so_pncp" | "casado" | "so_effecti";

interface Linha {
  balde: Balde;
  municipio: string | null;
  uf: string | null;
  numero: string | null;
  objeto: string | null;
  modalidade: string | null;
  valor: number | null;
  encerramento: string | null;
  score: number | null;
  link: string | null;
  card_id: string | null;
}

const JANELAS = [
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
  { label: "6 meses", dias: 180 },
];

const brl = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const dataBr = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "sem prazo";

export default function ComparativoPncp() {
  const [dias, setDias] = useState(90);
  const [aba, setAba] = useState<Balde>("so_pncp");
  const [soAbertas, setSoAbertas] = useState(true);

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["pncp-comparativo", dias, soAbertas],
    queryFn: async () => {
      const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc("pncp_comparativo", {
        p_desde: desde,
        p_ate: new Date().toISOString().slice(0, 10),
        p_score_min: 3,
        p_so_abertas: soAbertas,
      });
      if (error) throw error;
      return (data || []) as Linha[];
    },
  });

  const cont = {
    so_pncp: linhas.filter((l) => l.balde === "so_pncp").length,
    casado: linhas.filter((l) => l.balde === "casado").length,
    so_effecti: linhas.filter((l) => l.balde === "so_effecti").length,
  };
  const totalEffecti = cont.casado + cont.so_effecti;
  const cobertura = totalEffecti ? Math.round((cont.casado / totalEffecti) * 100) : null;

  // "só PNCP" ordenado por valor: as maiores oportunidades que a Effecti
  // não trouxe são o argumento comercial — precisam aparecer primeiro.
  const visiveis = linhas
    .filter((l) => l.balde === aba)
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
    .slice(0, 300);

  const KPI = ({ icone: Icone, valor, rotulo, hint, cor }: any) => (
    <Card className="p-3 sm:p-4 min-w-0">
      <div className="flex items-center gap-2">
        <Icone className={`h-4 w-4 shrink-0 ${cor}`} />
        <span className="text-xs text-muted-foreground truncate">{rotulo}</span>
      </div>
      <div className="text-xl sm:text-3xl font-bold mt-1">{valor}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{hint}</div>}
    </Card>
  );

  return (
    <AppLayout
      headerActions={
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold truncate">PNCP × Effecti</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Comparativo de cobertura — robô próprio contra o fornecedor pago
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {JANELAS.map((j) => (
              <Button
                key={j.dias}
                size="sm"
                variant={dias === j.dias ? "default" : "outline"}
                onClick={() => setDias(j.dias)}
              >
                {j.label}
              </Button>
            ))}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <KPI
            icone={TrendingUp} cor="text-emerald-600" valor={cont.so_pncp}
            rotulo="Só o robô achou"
            hint="oportunidades que a Effecti não entregou"
          />
          <KPI
            icone={CheckCircle2} cor="text-blue-600" valor={cont.casado}
            rotulo="Os dois acharam"
            hint="robô confirma a Effecti"
          />
          <KPI
            icone={AlertTriangle} cor="text-amber-600" valor={cont.so_effecti}
            rotulo="Só a Effecti achou"
            hint="o que se perde ao cortar"
          />
          <KPI
            icone={CheckCircle2} cor="text-primary"
            valor={cobertura == null ? "—" : `${cobertura}%`}
            rotulo="Cobertura do robô"
            hint="da entrega da Effecti"
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch id="abertas" checked={soAbertas} onCheckedChange={setSoAbertas} />
          <Label htmlFor="abertas" className="text-xs sm:text-sm cursor-pointer">
            Só com proposta aberta
          </Label>
        </div>

        <Tabs value={aba} onValueChange={(v) => setAba(v as Balde)}>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="w-max sm:w-full">
              <TabsTrigger value="so_pncp">Só o robô ({cont.so_pncp})</TabsTrigger>
              <TabsTrigger value="casado">Os dois ({cont.casado})</TabsTrigger>
              <TabsTrigger value="so_effecti">Só a Effecti ({cont.so_effecti})</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visiveis.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nada neste balde na janela escolhida.
          </Card>
        ) : (
          <div className="space-y-2">
            {visiveis.map((l, i) => (
              <Card key={`${l.numero}-${i}`} className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {l.numero && <Badge variant="outline" className="text-[11px]">nº {l.numero}</Badge>}
                      {l.modalidade && (
                        <Badge variant="secondary" className="text-[11px]">{l.modalidade}</Badge>
                      )}
                      {l.score != null && (
                        <Badge className="text-[11px]" variant={l.score >= 5 ? "default" : "outline"}>
                          score {l.score}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-snug line-clamp-3">{l.objeto || "—"}</p>
                    <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {l.municipio || "—"}{l.uf ? `/${l.uf}` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />{brl(l.valor)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{dataBr(l.encerramento)}
                      </span>
                    </div>
                  </div>
                  {l.link && (
                    <Button size="sm" variant="outline" asChild className="shrink-0">
                      <a href={l.link} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Abrir</span>
                      </a>
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {linhas.filter((l) => l.balde === aba).length > 300 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Mostrando as 300 de maior valor de {linhas.filter((l) => l.balde === aba).length}.
              </p>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
