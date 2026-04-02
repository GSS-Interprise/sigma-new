import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";

interface MedicoListProps {
  medicos: any[];
  isLoading: boolean;
  onEdit: (medico: any) => void;
  onDelete: (id: string) => void;
}

type SortField = 'nome_completo' | 'especialidade' | 'crm' | 'estado' | 'status_medico';
type SortDirection = 'asc' | 'desc';

export function MedicoList({ medicos, isLoading, onEdit, onDelete }: MedicoListProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedMedicos = useMemo(() => {
    if (!sortField) return medicos;

    return [...medicos].sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      // Handle array values (especialidade)
      if (Array.isArray(aValue)) aValue = aValue.join(', ');
      if (Array.isArray(bValue)) bValue = bValue.join(', ');

      aValue = aValue || '';
      bValue = bValue || '';
      
      const comparison = aValue.toString().localeCompare(bValue.toString(), 'pt-BR');
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [medicos, sortField, sortDirection]);

  if (isLoading) {
    return <div>Carregando...</div>;
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Ativo':
        return 'default';
      case 'Inativo':
        return 'secondary';
      case 'Suspenso':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('nome_completo')}
                className="h-8 gap-1 font-semibold"
              >
                Nome
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('especialidade')}
                className="h-8 gap-1 font-semibold"
              >
                Especialidade
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('crm')}
                className="h-8 gap-1 font-semibold"
              >
                CRM
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('estado')}
                className="h-8 gap-1 font-semibold"
              >
                Estado
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('status_medico')}
                className="h-8 gap-1 font-semibold"
              >
                Status
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>Cliente Vinculado</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedMedicos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Nenhum médico encontrado
              </TableCell>
            </TableRow>
          ) : (
            sortedMedicos.map((medico) => (
              <TableRow key={medico.id}>
                <TableCell className="font-medium">{medico.nome_completo}</TableCell>
                <TableCell>
                  {Array.isArray(medico.especialidade) 
                    ? medico.especialidade.join(', ') 
                    : medico.especialidade || '-'}
                </TableCell>
                <TableCell>{medico.crm}</TableCell>
                <TableCell>{medico.estado || '-'}</TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(medico.status_medico)}>
                    {medico.status_medico}
                  </Badge>
                </TableCell>
                <TableCell>{medico.cliente?.nome_fantasia || '-'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(medico)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(medico.id)}
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
