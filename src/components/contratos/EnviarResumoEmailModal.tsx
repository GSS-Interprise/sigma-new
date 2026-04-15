import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";

interface EnviarResumoEmailModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratoId: string;
  clienteNome: string;
  tiposServico: string[];
  statusAssinatura: string;
  valorTotal: number;
  dataInicio: string;
  codigoContrato?: string;
  objetoContrato?: string;
  prazoMeses?: number;
  condicaoPagamento?: string;
  documentosExistentes?: { arquivo_nome: string; arquivo_url: string }[];
}

export function EnviarResumoEmailModal({
  open,
  onOpenChange,
  contratoId,
  clienteNome,
  tiposServico,
  statusAssinatura,
  valorTotal,
  dataInicio,
  codigoContrato,
  objetoContrato,
  prazoMeses,
  condicaoPagamento,
  documentosExistentes,
}: EnviarResumoEmailModalProps) {
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const { data: usuarios } = useQuery({
    queryKey: ['usuarios-email-resumo-contrato'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          email, 
          nome_completo,
          user_roles!inner(role)
        `)
        .eq('status', 'ativo')
        .in('user_roles.role', ['admin', 'gestor_contratos', 'gestor_licitacoes', 'diretoria']);

      if (error) throw error;
      return data || [];
    },
  });

  const handleSend = async () => {
    if (selectedEmails.length === 0) {
      toast.warning("Selecione ao menos um destinatário.");
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-contract-email', {
        body: {
          emails: selectedEmails,
          contratoData: {
            cliente_nome: clienteNome,
            tipos_servico: tiposServico,
            status_assinatura: statusAssinatura,
            valor_total: valorTotal,
            data_vigencia: dataInicio,
            contrato_id: contratoId,
            codigo_contrato: codigoContrato,
            objeto_contrato: objetoContrato,
            prazo_meses: prazoMeses,
            condicao_pagamento: condicaoPagamento,
            anexos: documentosExistentes?.map(d => ({
              nome: d.arquivo_nome,
              url: d.arquivo_url,
            })) || [],
          },
        },
      });

      if (error) throw error;

      toast.success(`Resumo enviado para ${selectedEmails.length} destinatário(s)`);
      setSelectedEmails([]);
      onOpenChange(false);
    } catch (err: any) {
      console.error('Erro ao enviar email:', err);
      toast.error('Erro ao enviar resumo por email.');
    } finally {
      setSending(false);
    }
  };

  const toggleAll = () => {
    if (!usuarios) return;
    if (selectedEmails.length === usuarios.length) {
      setSelectedEmails([]);
    } else {
      setSelectedEmails(usuarios.map(u => u.email));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Enviar Resumo por E-mail
          </DialogTitle>
          <DialogDescription>
            Selecione os destinatários que receberão o resumo do contrato <strong>{codigoContrato}</strong> do cliente <strong>{clienteNome}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[350px] overflow-y-auto">
          <div className="flex items-center space-x-2 pb-2 border-b">
            <Checkbox
              id="select-all"
              checked={!!usuarios?.length && selectedEmails.length === usuarios.length}
              onCheckedChange={toggleAll}
            />
            <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
              Selecionar todos
            </label>
          </div>

          {usuarios?.map((usuario) => (
            <div key={usuario.email} className="flex items-center space-x-2">
              <Checkbox
                id={`resumo-${usuario.email}`}
                checked={selectedEmails.includes(usuario.email)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedEmails(prev => [...prev, usuario.email]);
                  } else {
                    setSelectedEmails(prev => prev.filter(e => e !== usuario.email));
                  }
                }}
              />
              <label htmlFor={`resumo-${usuario.email}`} className="text-sm cursor-pointer">
                {usuario.nome_completo} <span className="text-muted-foreground">({usuario.email})</span>
              </label>
            </div>
          ))}

          {(!usuarios || usuarios.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum usuário disponível.</p>
          )}
        </div>

        {documentosExistentes && documentosExistentes.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Anexos incluídos no e-mail:</p>
            <ul className="text-xs space-y-0.5">
              {documentosExistentes.map((doc, i) => (
                <li key={i} className="text-foreground">📎 {doc.arquivo_nome}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || selectedEmails.length === 0}>
            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : `Enviar para ${selectedEmails.length}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
