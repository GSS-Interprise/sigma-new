import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import {
  AlertCircle,
  Gavel,
  FileText,
  UserSearch,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { usePendenciasSetor } from "@/hooks/useDemandas";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";
import { URGENCIA_CLASS, URGENCIA_LABEL } from "@/lib/setoresAccess";

const ICONES: Record<string, any> = {
  lead: UserSearch,
  contrato: FileText,
  licitacao: Gavel,
};

export function ColunaPendenciasSetor() {
  const { setorId, setorNome } = useUserSetor();
  const { isAdmin } = usePermissions();
  const [adminSetorFiltro, setAdminSetorFiltro] = useState<string>("todos");
  const setorEfetivo = isAdmin
    ? (adminSetorFiltro === "todos" ? null : adminSetorFiltro)
    : setorId;
  const { data: pendencias = [], isLoading } = usePendenciasSetor(setorEfetivo, isAdmin);

  const { data: setores = [] } = useQuery({
    queryKey: ["setores-pendencias-filter"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setores")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card className="flex flex-col h-full bg-gradient-to-b from-card to-card/60 backdrop-blur-sm">
      <div className="p-3 border-b flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-orange-500" />
        <h3 className="font-semibold text-sm">Pendências do setor</h3>
        {!isAdmin && (
          <span className="text-[11px] text-muted-foreground">
            {setorNome ? `· ${setorNome}` : ""}
          </span>
        )}
        {isAdmin && (
          <div className="ml-auto">
            <Select value={adminSetorFiltro} onValueChange={setAdminSetorFiltro}>
              <SelectTrigger className="h-7 text-[11px] w-[180px]">
                <SelectValue placeholder="Setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os setores</SelectItem>
                {setores.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {isLoading && (
            <div className="text-xs text-muted-foreground text-center py-6">
              Carregando…
            </div>
          )}
          {!isLoading && pendencias.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-10">
              🎉 Nenhuma pendência automática agora.
            </div>
          )}
          {pendencias.map((p) => {
            const Icon = ICONES[p.origem] ?? AlertCircle;
            return (
              <Link
                key={p.id}
                to={p.link}
                className="block group"
                target="_blank"
              >
                <div
                  className={cn(
                    "rounded-lg border p-2.5 bg-card/50 hover:bg-muted/50 hover:shadow-sm transition border-l-[3px]",
                    p.urgencia === "alta"
                      ? "border-l-destructive"
                      : p.urgencia === "media"
                      ? "border-l-orange-500"
                      : "border-l-muted-foreground/40",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold truncate">
                          {p.titulo}
                        </h4>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1 py-0 shrink-0",
                            URGENCIA_CLASS[p.urgencia] ?? "",
                          )}
                        >
                          {URGENCIA_LABEL[p.urgencia] ?? p.urgencia}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {p.descricao}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {p.origem}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
