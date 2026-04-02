import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts";
import { ChevronRight } from "lucide-react";

interface ProfissionalData {
  nome: string;
  horas: number;
  plantoes: number;
}

interface ExpandableProfessionalChartProps {
  title: string;
  data: ProfissionalData[];
  dataKey: "horas" | "plantoes";
  color: string;
  limit?: number;
}

export function ExpandableProfessionalChart({
  title,
  data,
  dataKey,
  color,
  limit = 10,
}: ExpandableProfessionalChartProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasMore = data.length > limit;
  const displayData = data.slice(0, limit);

  const formatValue = (v: number) => dataKey === "horas" ? `${v}h` : String(v);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">Sem dados disponíveis</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{title}</CardTitle>
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
              >
                Ver todos ({data.length})
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <RechartsTooltip formatter={(v) => [formatValue(v as number), dataKey === "horas" ? "Horas" : "Plantões"]} />
              <Bar dataKey={dataKey} fill={color} name={dataKey === "horas" ? "Horas" : "Plantões"} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              Exibindo todos os {data.length} profissionais
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            <div className="space-y-2 pr-4">
              {data.map((prof, idx) => {
                const value = prof[dataKey];
                const maxValue = data[0]?.[dataKey] || 1;
                const percent = (value / maxValue) * 100;
                
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-6 text-xs text-muted-foreground">{idx + 1}.</span>
                    <span className="w-36 text-sm truncate" title={prof.nome}>{prof.nome}</span>
                    <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percent}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-sm font-medium w-14 text-right">{formatValue(value)}</span>
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {dataKey === "horas" ? `${prof.plantoes}x` : `${prof.horas}h`}
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
