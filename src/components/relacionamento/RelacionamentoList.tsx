import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RelacionamentoListProps {
  relacionamentos: any[];
  isLoading: boolean;
  onEdit: (relacionamento: any) => void;
  onDelete: (id: string) => void;
}

export function RelacionamentoList({ relacionamentos, isLoading, onEdit, onDelete }: RelacionamentoListProps) {
  if (isLoading) {
    return <div>Carregando...</div>;
  }

  const getTipoPrincipalBadgeVariant = (tipoPrincipal: string) => {
    return tipoPrincipal === 'Reclamação' ? 'destructive' : 'default';
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      aberta: 'Aberta',
      em_analise: 'Em Análise',
      concluida: 'Concluída',
    };
    return statusMap[status] || status;
  };

  const getStatusVariant = (status: string) => {
    const variantMap: Record<string, 'default' | 'secondary' | 'outline'> = {
      aberta: 'outline',
      em_analise: 'secondary',
      concluida: 'default',
    };
    return variantMap[status] || 'outline';
  };

  const getGravidadeBadgeVariant = (gravidade: string) => {
    const variantMap: Record<string, string> = {
      baixa: 'bg-blue-500/10 text-blue-500',
      media: 'bg-yellow-500/10 text-yellow-500',
      alta: 'bg-orange-500/10 text-orange-500',
      critica: 'bg-red-500/10 text-red-500',
    };
    return variantMap[gravidade] || '';
  };

  const getGravidadeLabel = (gravidade: string) => {
    const labelMap: Record<string, string> = {
      baixa: 'Baixa',
      media: 'Média',
      alta: 'Alta',
      critica: 'Crítica',
    };
    return labelMap[gravidade] || gravidade;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo Principal</TableHead>
            <TableHead>Subtipo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Gravidade</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Médico</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {relacionamentos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                Nenhum registro encontrado
              </TableCell>
            </TableRow>
          ) : (
            relacionamentos.map((rel) => (
              <TableRow key={rel.id}>
                <TableCell>
                  <Badge variant={getTipoPrincipalBadgeVariant(rel.tipo_principal)}>
                    {rel.tipo_principal}
                  </Badge>
                </TableCell>
                <TableCell>{rel.tipo}</TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(rel.status)}>
                    {getStatusLabel(rel.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {rel.tipo_principal === 'Reclamação' && rel.gravidade ? (
                    <Badge className={getGravidadeBadgeVariant(rel.gravidade)}>
                      {getGravidadeLabel(rel.gravidade)}
                    </Badge>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="max-w-md truncate">{rel.descricao}</TableCell>
                <TableCell>{rel.cliente_vinculado?.nome_fantasia || '-'}</TableCell>
                <TableCell>{rel.medico_vinculado?.nome_completo || '-'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(rel)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(rel.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
