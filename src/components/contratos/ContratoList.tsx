import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, FileText, Download, Eye, ArrowUpDown, Check, Filter } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { useState, useMemo } from "react";
import { ContratoFileViewerDialog } from "./ContratoFileViewerDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import pdfIcon from "@/assets/file-icons/pdf.png";
import docIcon from "@/assets/file-icons/doc.png";
import docxIcon from "@/assets/file-icons/docx.png";
import xlsIcon from "@/assets/file-icons/xls.png";
import xlsxIcon from "@/assets/file-icons/xlsx.png";
import jpgIcon from "@/assets/file-icons/jpg.png";
import pngIcon from "@/assets/file-icons/png.png";
import gifIcon from "@/assets/file-icons/gif.png";
import bmpIcon from "@/assets/file-icons/bmp.png";

interface ContratoListProps {
  contratos: any[];
  isLoading: boolean;
  onEdit: (contrato: any) => void;
  onView: (contrato: any) => void;
  onDelete: (id: string) => void;
}

type SortField = 'cliente' | 'data_inicio' | 'data_fim' | 'assinado' | 'codigo_interno' | 'status_contrato';
type SortDirection = 'asc' | 'desc';

export function ContratoList({ contratos, isLoading, onEdit, onView, onDelete }: ContratoListProps) {
  const { toast } = useToast();
  const { isAdmin, canEdit, canDelete } = usePermissions();
  const [sortField, setSortField] = useState<SortField | null>('codigo_interno');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [statusContratoFilter, setStatusContratoFilter] = useState<string | null>(null);
  const [clienteFilter, setClienteFilter] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);

  const openFileViewer = async (url: string, name: string) => {
    const extension = name?.split('.').pop()?.toLowerCase() || '';

    if (extension === 'pdf') {
      try {
        // Detectar bucket pela URL
        const getBucket = (u: string): string => {
          if (u.includes('/contratos-documentos/')) return 'contratos-documentos';
          if (u.includes('/licitacoes-anexos/')) return 'licitacoes-anexos';
          if (u.includes('/contrato-rascunho-anexos/')) return 'contrato-rascunho-anexos';
          return 'contratos-documentos';
        };
        const bucket = getBucket(url);

        const key = url.startsWith('http')
          ? (() => {
              const marker = `/${bucket}/`;
              const idx = url.indexOf(marker);
              return idx !== -1 ? url.substring(idx + marker.length) : url;
            })()
          : url;

        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(key, 3600);

        if (error) throw error;
        window.open(data.signedUrl, '_blank');
      } catch (err) {
        console.error('Erro ao abrir PDF:', err);
        toast({ title: 'Erro ao abrir PDF', variant: 'destructive' });
      }
      return;
    }

    setViewerFile({ url, name });
    setViewerOpen(true);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get unique values for filters
  const uniqueClientes = useMemo(() => {
    const clientes = contratos.map(c => c.cliente?.nome_fantasia || c.medico?.nome_completo || '').filter(Boolean);
    return [...new Set(clientes)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [contratos]);

  const uniqueStatus = useMemo(() => {
    const statuses = contratos.map(c => c.assinado || '').filter(Boolean);
    return [...new Set(statuses)];
  }, [contratos]);

  const statusContratoWithCount = useMemo(() => {
    const countMap: Record<string, number> = {};
    contratos.forEach(c => {
      const status = c.status_contrato || '';
      if (status) {
        countMap[status] = (countMap[status] || 0) + 1;
      }
    });
    return Object.entries(countMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => a.status.localeCompare(b.status, 'pt-BR'));
  }, [contratos]);

  const uniqueStatusContrato = useMemo(() => {
    return statusContratoWithCount.map(s => s.status);
  }, [statusContratoWithCount]);

  const sortedContratos = useMemo(() => {
    let filtered = [...contratos];

    // Apply filters
    if (statusFilter) {
      filtered = filtered.filter(c => c.assinado === statusFilter);
    }
    if (statusContratoFilter) {
      filtered = filtered.filter(c => c.status_contrato === statusContratoFilter);
    }
    if (clienteFilter) {
      filtered = filtered.filter(c => 
        (c.cliente?.nome_fantasia || c.medico?.nome_completo || '') === clienteFilter
      );
    }

    if (!sortField) return filtered;

    return filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortField === 'cliente') {
        aValue = a.cliente?.nome_fantasia || a.medico?.nome_completo || '';
        bValue = b.cliente?.nome_fantasia || b.medico?.nome_completo || '';
        const comparison = aValue.toString().localeCompare(bValue.toString(), 'pt-BR');
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      if (sortField === 'data_inicio' || sortField === 'data_fim') {
        aValue = new Date(a[sortField]).getTime();
        bValue = new Date(b[sortField]).getTime();
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      if (sortField === 'assinado') {
        aValue = a.assinado || '';
        bValue = b.assinado || '';
        const comparison = aValue.toString().localeCompare(bValue.toString(), 'pt-BR');
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      if (sortField === 'status_contrato') {
        aValue = a.status_contrato || '';
        bValue = b.status_contrato || '';
        const comparison = aValue.toString().localeCompare(bValue.toString(), 'pt-BR');
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      if (sortField === 'codigo_interno') {
        aValue = a.codigo_interno || 0;
        bValue = b.codigo_interno || 0;
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });
  }, [contratos, sortField, sortDirection, statusFilter, statusContratoFilter, clienteFilter]);

  if (isLoading) {
    return <div>Carregando...</div>;
  }

  const getFileIconImage = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return pdfIcon;
      case 'doc': return docIcon;
      case 'docx': return docxIcon;
      case 'xls': return xlsIcon;
      case 'xlsx': return xlsxIcon;
      case 'jpg':
      case 'jpeg': return jpgIcon;
      case 'png': return pngIcon;
      case 'gif': return gifIcon;
      case 'bmp': return bmpIcon;
      default: return pdfIcon;
    }
  };

  const getKeyFromUrl = (urlOrKey: string) => {
    if (!urlOrKey) return '';
    if (urlOrKey.startsWith('http')) {
      const marker = '/contratos-documentos/';
      const idx = urlOrKey.indexOf(marker);
      return idx !== -1 ? urlOrKey.substring(idx + marker.length) : '';
    }
    return urlOrKey; // already a key
  };


  const toAbsoluteStorageUrl = (maybePath: string) =>
    maybePath.startsWith('http')
      ? maybePath
      : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${maybePath}`;

  const openSigned = async (urlOrKey: string) => {
    try {
      const key = getKeyFromUrl(urlOrKey);
      if (!key) throw new Error('Caminho do arquivo inválido');
      const { data, error } = await supabase.storage
        .from('contratos-documentos')
        .createSignedUrl(key, 60 * 10);
      if (error) throw error;
      if (data?.signedUrl) {
        const abs = toAbsoluteStorageUrl(data.signedUrl);
        window.open(abs, '_blank', 'noopener,noreferrer');
        return;
      }
      // Fallback via download
      const downloadRes = await supabase.storage.from('contratos-documentos').download(key);
      if ('error' in downloadRes && downloadRes.error) throw (downloadRes as any).error;
      const blobUrl = URL.createObjectURL((downloadRes as any).data as Blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      console.error('Erro ao abrir anexo', e);
      toast({ title: 'Não foi possível abrir o anexo', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    }
  };

  const downloadAttachment = async (urlOrKey: string, filename?: string) => {
    try {
      const key = getKeyFromUrl(urlOrKey);
      if (!key) throw new Error('Caminho do arquivo inválido');
      const { data, error } = await supabase.storage.from('contratos-documentos').download(key);
      if (error) throw error;
      const blob = data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || key;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Erro ao baixar anexo', e);
      toast({ title: 'Não foi possível baixar o anexo', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    }
  };
  return (
    <>
    <ContratoFileViewerDialog
      open={viewerOpen}
      onOpenChange={setViewerOpen}
      fileUrl={viewerFile?.url || null}
      fileName={viewerFile?.name || null}
    />
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('codigo_interno')}
                className="h-8 gap-1 font-semibold px-1"
              >
                ID
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 font-semibold">
                    Cliente/Médico
                    {clienteFilter && <Filter className="h-3 w-3 text-primary" />}
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-popover">
                  <DropdownMenuItem onClick={() => { setSortField('cliente'); setSortDirection('asc'); }}>
                    {sortField === 'cliente' && sortDirection === 'asc' && <Check className="h-4 w-4 mr-2" />}
                    <span className={sortField === 'cliente' && sortDirection === 'asc' ? 'font-medium' : ''}>Ordenar A-Z</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortField('cliente'); setSortDirection('desc'); }}>
                    {sortField === 'cliente' && sortDirection === 'desc' && <Check className="h-4 w-4 mr-2" />}
                    <span className={sortField === 'cliente' && sortDirection === 'desc' ? 'font-medium' : ''}>Ordenar Z-A</span>
                  </DropdownMenuItem>
                  {uniqueClientes.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setClienteFilter(null)}>
                        {!clienteFilter && <Check className="h-4 w-4 mr-2" />}
                        <span className={!clienteFilter ? 'font-medium' : ''}>Todos os clientes</span>
                      </DropdownMenuItem>
                      {uniqueClientes.map((cliente) => (
                        <DropdownMenuItem key={cliente} onClick={() => setClienteFilter(clienteFilter === cliente ? null : cliente)}>
                          {clienteFilter === cliente && <Check className="h-4 w-4 mr-2" />}
                          <span className={clienteFilter === cliente ? 'font-medium' : 'truncate'}>{cliente}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('data_inicio')}
                className="h-8 gap-1 font-semibold"
              >
                Data Início
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('data_fim')}
                className="h-8 gap-1 font-semibold"
              >
                Data Fim
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 font-semibold">
                    Status
                    {statusFilter && <Filter className="h-3 w-3 text-primary" />}
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 bg-popover">
                  <DropdownMenuItem onClick={() => { setSortField('assinado'); setSortDirection('asc'); }}>
                    {sortField === 'assinado' && sortDirection === 'asc' && <Check className="h-4 w-4 mr-2" />}
                    <span className={sortField === 'assinado' && sortDirection === 'asc' ? 'font-medium' : ''}>Ordenar A-Z</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortField('assinado'); setSortDirection('desc'); }}>
                    {sortField === 'assinado' && sortDirection === 'desc' && <Check className="h-4 w-4 mr-2" />}
                    <span className={sortField === 'assinado' && sortDirection === 'desc' ? 'font-medium' : ''}>Ordenar Z-A</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setStatusFilter(null)}>
                    {!statusFilter && <Check className="h-4 w-4 mr-2" />}
                    <span className={!statusFilter ? 'font-medium' : ''}>Todos os status</span>
                  </DropdownMenuItem>
                  {uniqueStatus.map((status) => (
                    <DropdownMenuItem key={status} onClick={() => setStatusFilter(statusFilter === status ? null : status)}>
                      {statusFilter === status && <Check className="h-4 w-4 mr-2" />}
                      <span className={statusFilter === status ? 'font-medium' : ''}>{status === 'Sim' ? 'Assinado' : 'Pendente'}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
            <TableHead>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 font-semibold">
                    Status Contrato
                    {statusContratoFilter && <Filter className="h-3 w-3 text-primary" />}
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-popover">
                  <DropdownMenuItem onClick={() => { setSortField('status_contrato'); setSortDirection('asc'); }}>
                    {sortField === 'status_contrato' && sortDirection === 'asc' && <Check className="h-4 w-4 mr-2" />}
                    <span className={sortField === 'status_contrato' && sortDirection === 'asc' ? 'font-medium' : ''}>Ordenar A-Z</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortField('status_contrato'); setSortDirection('desc'); }}>
                    {sortField === 'status_contrato' && sortDirection === 'desc' && <Check className="h-4 w-4 mr-2" />}
                    <span className={sortField === 'status_contrato' && sortDirection === 'desc' ? 'font-medium' : ''}>Ordenar Z-A</span>
                  </DropdownMenuItem>
                  {uniqueStatusContrato.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setStatusContratoFilter(null)}>
                        {!statusContratoFilter && <Check className="h-4 w-4 mr-2" />}
                        <span className={!statusContratoFilter ? 'font-medium' : ''}>Todos</span>
                      </DropdownMenuItem>
                      {statusContratoWithCount.map(({ status, count }) => (
                        <DropdownMenuItem key={status} onClick={() => setStatusContratoFilter(statusContratoFilter === status ? null : status)} className="flex justify-between">
                          <span className="flex items-center">
                            {statusContratoFilter === status && <Check className="h-4 w-4 mr-2" />}
                            <span className={statusContratoFilter === status ? 'font-medium' : ''}>{status}</span>
                          </span>
                          <span className="text-muted-foreground text-xs ml-2">({count})</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
            <TableHead>Anexo</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedContratos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                Nenhum contrato encontrado
              </TableCell>
            </TableRow>
          ) : (
            sortedContratos.map((contrato) => (
              <TableRow 
                key={contrato.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onView(contrato)}
              >
                <TableCell className="w-16 text-center">
                  {contrato.codigo_interno || '-'}
                </TableCell>
                <TableCell>
                  {contrato.cliente?.nome_fantasia || contrato.cliente?.razao_social || contrato.medico?.nome_completo || (
                    contrato.status_contrato === 'Pre-Contrato' ? (
                      <span className="text-muted-foreground italic text-xs">
                        {contrato.codigo_contrato || 'Pré-contrato sem cliente'}
                      </span>
                    ) : '-'
                  )}
                </TableCell>
                <TableCell>
                  {(() => {
                    try {
                      // Parse da data ISO sem conversão de timezone
                      const [year, month, day] = contrato.data_inicio.split('-').map(Number);
                      const date = new Date(year, month - 1, day);
                      return format(date, 'dd/MM/yyyy');
                    } catch {
                      return '-';
                    }
                  })()}
                </TableCell>
                <TableCell>
                  {(() => {
                    try {
                      // Se houver aditivos, pega a data_termino do último aditivo
                      if (contrato.contrato_aditivos_tempo && contrato.contrato_aditivos_tempo.length > 0) {
                        const ultimoAditivo = [...contrato.contrato_aditivos_tempo].sort(
                          (a: any, b: any) => new Date(b.data_termino).getTime() - new Date(a.data_termino).getTime()
                        )[0];
                        const [year, month, day] = ultimoAditivo.data_termino.split('-').map(Number);
                        const date = new Date(year, month - 1, day);
                        return format(date, 'dd/MM/yyyy');
                      }
                      // Caso contrário, usa a data_fim do contrato original
                      const [year, month, day] = contrato.data_fim.split('-').map(Number);
                      const date = new Date(year, month - 1, day);
                      return format(date, 'dd/MM/yyyy');
                    } catch {
                      return '-';
                    }
                  })()}
                </TableCell>
                <TableCell>
                  <Badge variant={contrato.assinado === 'Sim' ? 'default' : 'secondary'}>
                    {contrato.assinado === 'Sim' ? 'Assinado' : 'Pendente'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={contrato.status_contrato === 'Pre-Contrato' ? 'default' : 'outline'}
                    className={contrato.status_contrato === 'Pre-Contrato' ? 'bg-amber-500 hover:bg-amber-600' : ''}
                  >
                    {contrato.status_contrato || '-'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(() => {
                    const anexos: { id: string; name: string; url: string }[] = [];
                    
                    // Priorizar contrato_anexos sobre documento_url para evitar duplicação
                    if (contrato.contrato_anexos && contrato.contrato_anexos.length > 0) {
                      anexos.push(
                        ...contrato.contrato_anexos.map((a: any) => ({ id: a.id, name: a.arquivo_nome, url: a.arquivo_url }))
                      );
                    } else if (contrato.documento_url) {
                      // Só adicionar documento_url se não houver contrato_anexos
                      anexos.push({ id: 'principal', name: 'Documento principal', url: contrato.documento_url });
                    }
                    
                    const count = anexos.length;
                    if (count === 0) return <span className="text-xs text-muted-foreground">Sem anexo</span>;
                    return (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <FileText className="h-4 w-4" />
                            Anexos ({count})
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[600px] max-w-[700px] p-4">
                          <div className="grid grid-cols-3 gap-3" onClick={(e) => e.stopPropagation()}>
                            {anexos.map((ax) => (
                              <div 
                                key={ax.id} 
                                className="border rounded-lg p-3 flex flex-col items-center gap-2 hover:bg-muted/50 transition-colors cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); openFileViewer(ax.url, ax.name); }}
                              >
                                <img src={getFileIconImage(ax.name)} alt="" className="h-16 w-16 object-contain" />
                                <span className="text-xs font-medium text-center truncate w-full px-1" title={ax.name}>
                                  {ax.name}
                                </span>
                                <div className="flex gap-1 mt-auto">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => { e.stopPropagation(); openFileViewer(ax.url, ax.name); }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => { e.stopPropagation(); downloadAttachment(ax.url, ax.name); }}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })()}
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {contrato.motivo_pendente || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onView(contrato);
                      }}
                      title="Visualizar"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(isAdmin || canEdit('contratos')) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(contrato);
                        }}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {(isAdmin || canDelete('contratos')) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(contrato.id);
                        }}
                        title="Deletar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
    </>
  );
}
