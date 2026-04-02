import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Building2, Clock, User } from "lucide-react";
import { EscalaIntegrada } from "@/hooks/useEscalasData";

interface EscalasListaViewProps {
  escalas: EscalaIntegrada[];
}

export function EscalasListaView({ escalas }: EscalasListaViewProps) {
  const formatarData = (data: string) => {
    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano}`;
  };

  const formatarHora = (hora: string) => {
    return hora?.substring(0, 5) || "--:--";
  };

  if (escalas.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum plantão encontrado para os filtros selecionados.
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Data</TableHead>
            <TableHead className="w-[120px]">Horário</TableHead>
            <TableHead>Profissional</TableHead>
            <TableHead>Local</TableHead>
            <TableHead>Setor</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {escalas.map((escala) => (
            <TableRow key={escala.id} className={escala.dados_incompletos ? "bg-destructive/5" : ""}>
              <TableCell className="font-medium">
                {formatarData(escala.data_escala)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {formatarHora(escala.hora_inicio)} - {formatarHora(escala.hora_fim)}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p>{escala.profissional_nome}</p>
                    {escala.profissional_crm && (
                      <p className="text-xs text-muted-foreground">CRM: {escala.profissional_crm}</p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{escala.local_nome || escala.unidade || "Não informado"}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {escala.dados_incompletos && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  <span>{escala.setor_nome || escala.setor}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge 
                  variant={escala.status_escala === "confirmado" ? "default" : "secondary"}
                >
                  {escala.status_escala}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
