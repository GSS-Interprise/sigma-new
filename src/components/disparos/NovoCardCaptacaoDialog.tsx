import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { FileText, Building2, Search, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface NovoCardCaptacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NovoCardCaptacaoDialog({ open, onOpenChange }: NovoCardCaptacaoDialogProps) {
  const [contratoId, setContratoId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Buscar contratos ativos
  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ["contratos-para-captacao"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select(`
          id,
          codigo_interno,
          codigo_contrato,
          objeto_contrato,
          status_contrato,
          clientes (
            nome_empresa
          )
        `)
        .in("status_contrato", ["Ativo", "Pendente", "Em Análise", "ativo", "pendente", "em_analise", "Assinado", "assinado"])
        .order("codigo_interno", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Criar novo card de captação
  const createCard = useMutation({
    mutationFn: async () => {
      if (!contratoId) throw new Error("Selecione um contrato");

      const contrato = contratos.find((c) => c.id === contratoId);
      if (!contrato) throw new Error("Contrato não encontrado");

      // Como o card já está vinculado a um contrato real existente,
      // ele nasce como "consolidado" — não é um pré-contrato em rascunho.
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("contrato_rascunho").insert({
        contrato_id: contratoId,
        status: "consolidado",
        status_kanban: "prospectar",
        overlay_json: {
          origem: "manual",
          contrato_codigo: contrato.codigo_contrato,
          codigo_interno: contrato.codigo_interno,
          objeto: contrato.objeto_contrato,
          cliente: contrato.clientes?.nome_empresa,
        },
        servicos_json: [],
        created_by: user?.id,
        consolidado_em: nowIso,
        consolidado_por: user?.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Card de captação criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["contratos-temporarios"] });
      onOpenChange(false);
      setContratoId("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar card");
    },
  });

  const handleSubmit = () => {
    if (!contratoId) {
      toast.error("Selecione um contrato");
      return;
    }
    createCard.mutate();
  };

  const selectedContrato = contratos.find((c) => c.id === contratoId);

  // Filtrar contratos pela busca (por ID interno, código ou cliente)
  const filteredContratos = useMemo(() => {
    if (!searchTerm.trim()) return contratos;
    const term = searchTerm.toLowerCase();
    return contratos.filter((c) =>
      c.codigo_interno?.toString().includes(term) ||
      c.codigo_contrato?.toLowerCase().includes(term) ||
      c.clientes?.nome_empresa?.toLowerCase().includes(term)
    );
  }, [contratos, searchTerm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Novo Card de Captação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Buscar Contrato</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID, código ou cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Selecione o Contrato {filteredContratos.length > 0 && `(${filteredContratos.length})`}</Label>
            <ScrollArea className="h-[200px] border rounded-md">
              {isLoading ? (
                <div className="p-4 text-center text-muted-foreground">
                  Carregando...
                </div>
              ) : filteredContratos.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {searchTerm ? "Nenhum contrato encontrado" : "Nenhum contrato disponível"}
                </div>
              ) : (
                <div className="p-1">
                  {filteredContratos.map((contrato) => (
                    <button
                      key={contrato.id}
                      type="button"
                      onClick={() => setContratoId(contrato.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-md transition-colors flex items-center justify-between gap-2",
                        contratoId === contrato.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          {contrato.codigo_interno && (
                            <span className={cn(
                              "text-xs px-1.5 py-0.5 rounded font-mono",
                              contratoId === contrato.id 
                                ? "bg-primary-foreground/20" 
                                : "bg-muted"
                            )}>
                              #{contrato.codigo_interno}
                            </span>
                          )}
                          <span className="font-medium truncate">
                            {contrato.codigo_contrato || "Sem código"}
                          </span>
                        </div>
                        <span className={cn(
                          "text-xs truncate",
                          contratoId === contrato.id ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}>
                          {contrato.clientes?.nome_empresa || "Sem cliente"}
                        </span>
                      </div>
                      {contratoId === contrato.id && (
                        <Check className="h-4 w-4 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {selectedContrato && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {selectedContrato.clientes?.nome_empresa || "Sem cliente"}
                </span>
              </div>
              {selectedContrato.objeto_contrato && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {selectedContrato.objeto_contrato}
                </p>
              )}
              <Badge variant="outline" className="text-xs">
                Status: {selectedContrato.status_contrato}
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!contratoId || createCard.isPending}
          >
            {createCard.isPending ? "Criando..." : "Criar Card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
