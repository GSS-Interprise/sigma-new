import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight } from "lucide-react";

interface ProfissionalData {
  nome: string;
  horas: number;
  plantoes: number;
}

interface ExpandableLoadDistributionProps {
  data: ProfissionalData[];
  limit?: number;
}

export function ExpandableLoadDistribution({ data, limit = 10 }: ExpandableLoadDistributionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasMore = data.length > limit;
  const displayData = data.slice(0, limit);

  if (data.length === 0) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Distribuição de Carga por Profissional</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">Sem dados disponíveis</p>
        </CardContent>
      </Card>
    );
  }

  const maxHoras = data[0]?.horas || 1;

  const renderList = (items: ProfissionalData[], showRank = false) => (
    <div className="space-y-2">
      {items.map((prof, idx) => {
        const percent = (prof.horas / maxHoras) * 100;
        return (
          <div key={idx} className="flex items-center gap-3">
            {showRank && <span className="w-6 text-xs text-muted-foreground">{idx + 1}.</span>}
            <span className={`${showRank ? 'w-36' : 'w-32'} text-sm truncate`} title={prof.nome}>
              {prof.nome}
            </span>
            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-sm font-medium w-16 text-right">{prof.horas}h</span>
            <span className="text-xs text-muted-foreground w-12 text-right">{prof.plantoes}x</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Distribuição de Carga por Profissional</CardTitle>
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
          {renderList(displayData)}
        </CardContent>
      </Card>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Distribuição de Carga por Profissional</SheetTitle>
            <SheetDescription>
              Exibindo todos os {data.length} profissionais
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            <div className="pr-4">
              {renderList(data, true)}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
