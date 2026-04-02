import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ArrowUpDown, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";

interface ClienteListProps {
  clientes: any[];
  isLoading: boolean;
  onEdit: (cliente: any) => void;
  onDelete: (id: string) => void;
  onManageUnidades?: (cliente: any) => void;
}

type SortField = 'nome_fantasia' | 'razao_social' | 'estado' | 'status_cliente' | 'especialidade_cliente';
type SortDirection = 'asc' | 'desc';

export function ClienteList({ clientes, isLoading, onEdit, onDelete, onManageUnidades }: ClienteListProps) {
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

  const sortedClientes = useMemo(() => {
    if (!sortField) return clientes;

    return [...clientes].sort((a, b) => {
      const aValue = a[sortField] || '';
      const bValue = b[sortField] || '';
      
      const comparison = aValue.toString().localeCompare(bValue.toString(), 'pt-BR');
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [clientes, sortField, sortDirection]);

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
      case 'Cancelado':
        return 'outline';
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
                onClick={() => handleSort('nome_fantasia')}
                className="h-8 gap-1 font-semibold"
              >
                Nome Fantasia
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('razao_social')}
                className="h-8 gap-1 font-semibold"
              >
                Razão Social
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
                onClick={() => handleSort('status_cliente')}
                className="h-8 gap-1 font-semibold"
              >
                Status
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('especialidade_cliente')}
                className="h-8 gap-1 font-semibold"
              >
                Especialidade
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedClientes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Nenhum cliente encontrado
              </TableCell>
            </TableRow>
          ) : (
            sortedClientes.map((cliente) => (
              <TableRow key={cliente.id}>
                <TableCell className="font-medium">{cliente.nome_fantasia}</TableCell>
                <TableCell>{cliente.razao_social}</TableCell>
                <TableCell>{cliente.estado || '-'}</TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(cliente.status_cliente)}>
                    {cliente.status_cliente}
                  </Badge>
                </TableCell>
                <TableCell>{cliente.especialidade_cliente}</TableCell>
                <TableCell className="text-right">
                  {onManageUnidades && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onManageUnidades(cliente)}
                      title="Gerenciar Unidades"
                    >
                      <Building2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(cliente)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(cliente.id)}
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
