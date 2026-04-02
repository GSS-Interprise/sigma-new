import React from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ExternalLink, Clock, DollarSign, AlertTriangle, Lightbulb, ShieldAlert, MapPin, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AlertaLicitacao } from '@/hooks/useLicitacoesBI';

interface LicitacaoDrilldown {
  id: string;
  numero_edital: string;
  objeto: string;
  orgao: string;
  status: string;
  valor_estimado: number | null;
  updated_at: string | null;
  created_at: string | null;
  municipio_uf: string | null;
  tipo_modalidade: string | null;
  subtipo_modalidade: string | null;
}

interface AlertaDrilldownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alerta: (AlertaLicitacao & { licitacoes?: LicitacaoDrilldown[] }) | null;
  statusLabels?: Record<string, string>;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const getDiasParado = (updated_at: string | null, created_at: string | null): number => {
  const data = updated_at || created_at;
  if (!data) return 0;
  return differenceInDays(new Date(), new Date(data));
};

const getUrgenciaBadge = (dias: number) => {
  if (dias > 30) return <Badge variant="destructive" className="text-xs">Crítico</Badge>;
  if (dias > 20) return <Badge className="bg-amber-500 text-white text-xs">Alto</Badge>;
  if (dias > 15) return <Badge variant="secondary" className="text-xs">Moderado</Badge>;
  return null;
};

export function AlertaDrilldownDialog({ 
  open, 
  onOpenChange, 
  alerta,
  statusLabels = {}
}: AlertaDrilldownDialogProps) {
  const navigate = useNavigate();

  if (!alerta) return null;

  const licitacoes = alerta.licitacoes || [];
  
  const Icon = alerta.tipo === 'risco' 
    ? ShieldAlert 
    : alerta.tipo === 'oportunidade' 
      ? Lightbulb 
      : AlertTriangle;
  
  const iconClass = alerta.tipo === 'risco'
    ? 'text-red-600'
    : alerta.tipo === 'oportunidade'
      ? 'text-emerald-600'
      : 'text-amber-600';

  const handleVerNoKanban = (licitacaoId?: string) => {
    onOpenChange(false);
    if (licitacaoId) {
      navigate(`/licitacoes?highlight=${licitacaoId}`);
    } else {
      navigate('/licitacoes');
    }
  };

  const valorTotal = licitacoes.reduce((sum, l) => sum + (Number(l.valor_estimado) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${iconClass}`} />
            {alerta.titulo}
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span>{alerta.descricao}</span>
            {licitacoes.length > 0 && (
              <Badge variant="outline" className="ml-2">
                {licitacoes.length} licitações • {formatCurrency(valorTotal)}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        {licitacoes.length > 0 ? (
          <ScrollArea className="max-h-[60vh] pr-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Edital</TableHead>
                  <TableHead>Órgão / Objeto</TableHead>
                  <TableHead className="w-[100px] text-right">Valor</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[90px] text-center">Dias Parado</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licitacoes
                  .sort((a, b) => getDiasParado(b.updated_at, b.created_at) - getDiasParado(a.updated_at, a.created_at))
                  .map((licitacao) => {
                    const diasParado = getDiasParado(licitacao.updated_at, licitacao.created_at);
                    const statusLabel = statusLabels[licitacao.status] || licitacao.status;
                    
                    return (
                      <TableRow key={licitacao.id} className="group hover:bg-muted/50">
                        <TableCell className="font-mono text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{licitacao.numero_edital || '—'}</span>
                            {licitacao.subtipo_modalidade && (
                              <span className="text-muted-foreground text-[10px]">{[licitacao.tipo_modalidade, licitacao.subtipo_modalidade].filter(Boolean).join(' / ')}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm line-clamp-1">{licitacao.orgao}</span>
                            <span className="text-xs text-muted-foreground line-clamp-1">
                              {licitacao.objeto?.substring(0, 80)}{licitacao.objeto?.length > 80 ? '...' : ''}
                            </span>
                            {licitacao.municipio_uf && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {licitacao.municipio_uf}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {licitacao.valor_estimado ? formatCurrency(licitacao.valor_estimado) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-sm">{diasParado}d</span>
                            {getUrgenciaBadge(diasParado)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleVerNoKanban(licitacao.id)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Nenhuma licitação disponível para detalhar este alerta.</p>
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {alerta.acao}
          </p>
          <Button onClick={() => handleVerNoKanban()} variant="default">
            <ExternalLink className="h-4 w-4 mr-2" />
            Ver no Kanban
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
