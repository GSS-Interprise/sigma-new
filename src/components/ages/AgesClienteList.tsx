import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Building2, ChevronUp, ChevronDown } from "lucide-react";

interface AgesCliente {
  id: string;
  nome_empresa: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  cidade?: string | null;
  uf?: string | null;
  contato_principal?: string | null;
  status_cliente: string;
  especialidade_cliente?: string | null;
}

interface AgesClienteListProps {
  clientes: AgesCliente[];
  isLoading: boolean;
  onEdit: (cliente: AgesCliente) => void;
  onDelete: (id: string) => void;
  onManageUnidades: (cliente: AgesCliente) => void;
}

type SortField = 'nome_empresa' | 'cidade' | 'status_cliente' | 'especialidade_cliente';
type SortDirection = 'asc' | 'desc';

const formatCNPJ = (cnpj: string | null | undefined) => {
  if (!cnpj) return '-';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'Ativo': return 'default';
    case 'Inativo': return 'secondary';
    case 'Suspenso': return 'outline';
    case 'Cancelado': return 'destructive';
    default: return 'secondary';
  }
};

export function AgesClienteList({ clientes, isLoading, onEdit, onDelete, onManageUnidades }: AgesClienteListProps) {
  const [sortField, setSortField] = useState<SortField>('nome_empresa');
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
    return [...clientes].sort((a, b) => {
      const aValue = (a[sortField] || '').toLowerCase();
      const bValue = (b[sortField] || '').toLowerCase();
      if (sortDirection === 'asc') {
        return aValue.localeCompare(bValue);
      }
      return bValue.localeCompare(aValue);
    });
  }, [clientes, sortField, sortDirection]);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4 inline ml-1" /> : 
      <ChevronDown className="h-4 w-4 inline ml-1" />;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead 
            className="cursor-pointer hover:bg-muted/50" 
            onClick={() => handleSort('nome_empresa')}
          >
            Nome <SortIcon field="nome_empresa" />
          </TableHead>
          <TableHead>CNPJ</TableHead>
          <TableHead 
            className="cursor-pointer hover:bg-muted/50" 
            onClick={() => handleSort('cidade')}
          >
            Cidade/UF <SortIcon field="cidade" />
          </TableHead>
          <TableHead>Contato</TableHead>
          <TableHead 
            className="cursor-pointer hover:bg-muted/50" 
            onClick={() => handleSort('especialidade_cliente')}
          >
            Especialidade <SortIcon field="especialidade_cliente" />
          </TableHead>
          <TableHead 
            className="cursor-pointer hover:bg-muted/50" 
            onClick={() => handleSort('status_cliente')}
          >
            Status <SortIcon field="status_cliente" />
          </TableHead>
          <TableHead className="w-32">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedClientes.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
              Nenhum cliente encontrado
            </TableCell>
          </TableRow>
        ) : (
          sortedClientes.map((cliente) => (
            <TableRow key={cliente.id}>
              <TableCell className="font-medium">
                {cliente.nome_fantasia || cliente.nome_empresa}
              </TableCell>
              <TableCell>{formatCNPJ(cliente.cnpj)}</TableCell>
              <TableCell>
                {cliente.cidade ? `${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}` : '-'}
              </TableCell>
              <TableCell>{cliente.contato_principal || '-'}</TableCell>
              <TableCell>{cliente.especialidade_cliente || '-'}</TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(cliente.status_cliente)}>
                  {cliente.status_cliente}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onManageUnidades(cliente)}
                    title="Gerenciar Unidades"
                  >
                    <Building2 className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onEdit(cliente)}
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                      if (confirm('Remover este cliente?')) {
                        onDelete(cliente.id);
                      }
                    }}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export default AgesClienteList;
