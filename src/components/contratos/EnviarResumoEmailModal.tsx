import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Loader2, Search, Paperclip, Send, Users } from "lucide-react";

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
  cnpj?: string;
  nomeUnidade?: string;
  endereco?: string;
  dataTermino?: string;
  qtdAditivos?: number;
  valorEstimado?: number;
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
  cnpj,
  nomeUnidade,
  endereco,
  dataTermino,
  qtdAditivos,
  valorEstimado,
}: EnviarResumoEmailModalProps) {
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");

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
        .in('user_roles.role' as any, ['admin', 'gestor_contratos']);

      if (error) throw error;
      return data || [];
    },
  });

  const filteredUsuarios = useMemo(() => {
    if (!usuarios) return [];
    if (!search.trim()) return usuarios;
    const q = search.toLowerCase();
    return usuarios.filter(
      u => u.nome_completo?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [usuarios, search]);

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
            cnpj: cnpj,
            nome_unidade: nomeUnidade,
            endereco: endereco,
            data_termino: dataTermino,
            qtd_aditivos: qtdAditivos || 0,
            valor_estimado: valorEstimado,
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
      setSearch("");
      onOpenChange(false);
    } catch (err: any) {
      console.error('Erro ao enviar email:', err);
      toast.error('Erro ao enviar resumo por email.');
    } finally {
      setSending(false);
    }
  };

  const toggleAll = () => {
    if (!filteredUsuarios.length) return;
    const allFilteredSelected = filteredUsuarios.every(u => selectedEmails.includes(u.email));
    if (allFilteredSelected) {
      setSelectedEmails(prev => prev.filter(e => !filteredUsuarios.some(u => u.email === e)));
    } else {
      setSelectedEmails(prev => [...new Set([...prev, ...filteredUsuarios.map(u => u.email)])]);
    }
  };

  const allFilteredSelected = filteredUsuarios.length > 0 && filteredUsuarios.every(u => selectedEmails.includes(u.email));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden rounded-xl">
        {/* Header com gradiente */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-4">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/15 text-primary">
                <Mail className="h-4.5 w-4.5" />
              </div>
              Enviar Resumo por E-mail
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Contrato <Badge variant="secondary" className="font-mono text-xs mx-0.5">{codigoContrato}</Badge> · {clienteNome}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Barra de busca */}
        <div className="px-6 py-3 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-background border-border/60 focus-visible:ring-primary/30"
            />
          </div>
        </div>

        {/* Lista de destinatários */}
        <div className="px-6 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Destinatários ({filteredUsuarios.length})
              </span>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              {allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          </div>

          <div className="space-y-0.5 max-h-[280px] overflow-y-auto -mx-2 px-2 scrollbar-thin">
            {filteredUsuarios.map((usuario) => {
              const isSelected = selectedEmails.includes(usuario.email);
              return (
                <label
                  key={usuario.email}
                  htmlFor={`resumo-${usuario.email}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150
                    ${isSelected
                      ? 'bg-primary/8 border border-primary/20'
                      : 'hover:bg-muted/50 border border-transparent'
                    }`}
                >
                  <Checkbox
                    id={`resumo-${usuario.email}`}
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedEmails(prev => [...prev, usuario.email]);
                      } else {
                        setSelectedEmails(prev => prev.filter(e => e !== usuario.email));
                      }
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{usuario.nome_completo}</p>
                    <p className="text-xs text-muted-foreground truncate">{usuario.email}</p>
                  </div>
                </label>
              );
            })}

            {filteredUsuarios.length === 0 && (
              <div className="text-center py-8">
                <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {search ? 'Nenhum resultado encontrado' : 'Nenhum usuário disponível'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Anexos */}
        {documentosExistentes && documentosExistentes.length > 0 && (
          <div className="px-6 py-3 border-t bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Anexos ({documentosExistentes.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {documentosExistentes.map((doc, i) => (
                <Badge key={i} variant="outline" className="text-xs font-normal py-1 gap-1.5">
                  <Paperclip className="h-3 w-3" />
                  {doc.arquivo_nome}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-muted/10">
          {selectedEmails.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{selectedEmails.length}</span> destinatário(s) selecionado(s)
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Selecione os destinatários</p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSend} disabled={sending || selectedEmails.length === 0} className="gap-2">
              {sending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
              ) : (
                <><Send className="h-3.5 w-3.5" /> Enviar</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
