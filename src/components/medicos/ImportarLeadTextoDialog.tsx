import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Clipboard, Loader2, Sparkles } from "lucide-react";
import { parseBirthDate } from "@/lib/dateUtils";

interface ImportarLeadTextoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (data: Partial<LeadData>) => void;
}

interface LeadData {
  nome: string;
  cpf: string;
  data_nascimento: string;
  crm: string;
  rqe: string;
  especialidade: string;
  telefone: string;
  email: string;
  endereco: string;
  cep: string;
  rg: string;
  nacionalidade: string;
  naturalidade: string;
  estado_civil: string;
  banco: string;
  agencia: string;
  conta_corrente: string;
  chave_pix: string;
  cnpj: string;
  observacoes: string;
}

export function ImportarLeadTextoDialog({ open, onOpenChange, onImport }: ImportarLeadTextoDialogProps) {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setTexto(clipboardText);
      toast.success("Texto colado da área de transferência");
    } catch (error) {
      toast.error("Não foi possível acessar a área de transferência");
    }
  };

  const handleImport = async () => {
    if (!texto.trim()) {
      toast.error("Cole ou digite os dados do lead");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('parse-medico-data', {
        body: { texto }
      });

      if (error) throw error;

      if (data && data.dados) {
        // Parseia a data de nascimento para garantir formato correto (YYYY-MM-DD)
        const parsedBirthDate = parseBirthDate(data.dados.data_nascimento);
        
        // Map the parsed data to lead fields
        const leadData: Partial<LeadData> = {
          nome: data.dados.nome || undefined,
          cpf: data.dados.cpf || undefined,
          data_nascimento: parsedBirthDate || undefined,
          crm: data.dados.crm || undefined,
          especialidade: data.dados.especialidade || undefined,
          telefone: data.dados.telefone || undefined,
          email: data.dados.email || undefined,
          endereco: data.dados.endereco || undefined,
          cep: data.dados.cep || undefined,
          rg: data.dados.rg || undefined,
          nacionalidade: data.dados.nacionalidade || undefined,
          naturalidade: data.dados.naturalidade || undefined,
          estado_civil: data.dados.estado_civil || undefined,
          banco: data.dados.banco || undefined,
          agencia: data.dados.agencia || undefined,
          conta_corrente: data.dados.conta_corrente || undefined,
          chave_pix: data.dados.chave_pix || undefined,
          cnpj: data.dados.cnpj || undefined,
          observacoes: data.dados.observacoes || undefined,
        };

        onImport(leadData);
        toast.success("Dados importados com sucesso!");
        setTexto("");
        onOpenChange(false);
      } else {
        toast.error("Não foi possível extrair dados do texto");
      }
    } catch (error: any) {
      console.error('Error parsing data:', error);
      toast.error("Erro ao processar dados: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Importar Dados do Lead
          </DialogTitle>
          <DialogDescription>
            Cole os dados do lead (texto livre) e a IA irá identificar automaticamente os campos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Dados do Lead</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePaste}
              >
                <Clipboard className="h-3.5 w-3.5 mr-1.5" />
                Colar
              </Button>
            </div>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Cole aqui os dados do lead (nome, CPF, CRM, telefone, email, endereço, dados bancários, etc.)..."
              className="min-h-[200px] font-mono text-sm"
              disabled={loading}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setTexto("");
                onOpenChange(false);
              }}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleImport}
              disabled={!texto.trim() || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Importar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
