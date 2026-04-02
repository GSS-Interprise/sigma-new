import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileText, 
  Building2, 
  DollarSign, 
  MapPin, 
  Calendar,
  ArrowRight,
  Trash2,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useContratosRascunho } from "@/hooks/useContratoRascunho";
import { ContratoRascunhoDialog } from "./ContratoRascunhoDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ContratosRascunhoTabProps {
  onConsolidado?: (contratoId: string) => void;
}

export function ContratosRascunhoTab({ onConsolidado }: ContratosRascunhoTabProps) {
  const { rascunhos, isLoading, cancelar } = useContratosRascunho();
  const [selectedRascunhoId, setSelectedRascunhoId] = useState<string | null>(null);
  const [rascunhoParaCancelar, setRascunhoParaCancelar] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!rascunhos || rascunhos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nenhum contrato rascunho</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Contratos rascunho são criados automaticamente quando uma licitação é arrematada.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ScrollArea className="h-[calc(100vh-250px)]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rascunhos.map((rascunho: any) => {
            const overlay = rascunho.overlay_json || {};
            const licitacao = rascunho.licitacoes;

            return (
              <Card key={rascunho.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base line-clamp-2">
                      {overlay.titulo || overlay.numero_edital || 'Sem título'}
                    </CardTitle>
                    <Badge variant="secondary">Rascunho</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overlay.orgao && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      <span className="line-clamp-1">{overlay.orgao}</span>
                    </div>
                  )}

                  {overlay.municipio_uf && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{overlay.municipio_uf}</span>
                    </div>
                  )}

                  {overlay.valor_estimado && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <DollarSign className="h-4 w-4" />
                      <span>
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(overlay.valor_estimado)}
                      </span>
                    </div>
                  )}

                  {rascunho.precontrato_codigo_interno && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      <span className="font-mono font-medium">Pré-Contrato #{rascunho.precontrato_codigo_interno}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>
                      Criado em {format(new Date(rascunho.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedRascunhoId(rascunho.id)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Ver
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedRascunhoId(rascunho.id)}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Consolidar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRascunhoParaCancelar(rascunho.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Dialog de visualização/consolidação */}
      {selectedRascunhoId && (
        <ContratoRascunhoDialog
          open={!!selectedRascunhoId}
          onOpenChange={(open) => !open && setSelectedRascunhoId(null)}
          rascunhoId={selectedRascunhoId}
          onConsolidado={onConsolidado}
        />
      )}

      {/* Dialog de confirmação para cancelar */}
      <AlertDialog open={!!rascunhoParaCancelar} onOpenChange={(open) => !open && setRascunhoParaCancelar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Rascunho?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá cancelar o contrato rascunho. Você poderá criar um novo a partir da licitação se necessário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rascunhoParaCancelar) {
                  cancelar(rascunhoParaCancelar);
                  setRascunhoParaCancelar(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar Rascunho
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
