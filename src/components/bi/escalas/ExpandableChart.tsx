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

interface DataItem {
  nome: string;
  [key: string]: string | number;
}

interface ExpandableChartProps {
  title: string;
  icon?: React.ReactNode;
  data: DataItem[];
  dataKey: string;
  color: string;
  layout?: "horizontal" | "vertical";
  height?: number;
  labelWidth?: number;
  tooltipFormatter?: (value: number) => string;
  limit?: number;
}

export function ExpandableChart({
  title,
  icon,
  data,
  dataKey,
  color,
  layout = "vertical",
  height = 300,
  labelWidth = 120,
  tooltipFormatter,
  limit = 10,
}: ExpandableChartProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasMore = data.length > limit;
  const displayData = data.slice(0, limit);

  const formatTooltip = tooltipFormatter
    ? (v: number) => [tooltipFormatter(v), title.split(" ").pop()]
    : undefined;

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
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
            <CardTitle className="text-base flex items-center gap-2">
              {icon}
              {title}
            </CardTitle>
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
          <ResponsiveContainer width="100%" height={height}>
            {layout === "vertical" ? (
              <BarChart data={displayData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="nome" type="category" width={labelWidth} tick={{ fontSize: 11 }} />
                <RechartsTooltip formatter={formatTooltip} />
                <Bar dataKey={dataKey} fill={color} name={dataKey} />
              </BarChart>
            ) : (
              <BarChart data={displayData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <RechartsTooltip formatter={formatTooltip} />
                <Bar dataKey={dataKey} fill={color} name={dataKey} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {icon}
              {title}
            </SheetTitle>
            <SheetDescription>
              Exibindo todos os {data.length} registros
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            <div className="space-y-2 pr-4">
              {data.map((item, idx) => {
                const value = item[dataKey] as number;
                const maxValue = data[0]?.[dataKey] as number || 1;
                const percent = (value / maxValue) * 100;
                
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-6 text-xs text-muted-foreground">{idx + 1}.</span>
                    <span className="w-40 text-sm truncate" title={item.nome}>{item.nome}</span>
                    <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percent}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-sm font-medium w-16 text-right">
                      {tooltipFormatter ? tooltipFormatter(value) : value}
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
