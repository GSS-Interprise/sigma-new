import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownTextarea } from "@/components/ui/markdown-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload } from "lucide-react";
import { TIPO_MODALIDADE_OPTIONS, getSubtiposForTipo } from "@/lib/modalidadeConfig";

interface LicitacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  licitacao?: any;
}

const MODALIDADES = [
  "Pregão Eletrônico",
  "Pregão Presencial",
  "Concorrência",
  "Tomada de Preços",
  "Convite",
  "Dispensa",
  "Inexigibilidade",
];

export function LicitacaoDialog({ open, onOpenChange, onSuccess, licitacao }: LicitacaoDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Habilitar cola de PDF com Ctrl+V
  useEffect(() => {
    if (!open) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && file.type === 'application/pdf') {
            setPdfFile(file);
            toast.success(`PDF colado: ${file.name}`);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open]);

  const form = useForm({
    defaultValues: {
      titulo: "",
      licitacao_codigo: "",
      numero_edital: "",
      orgao: "",
      objeto: "",
      municipio_uf: "",
      tipo_modalidade: "",
      subtipo_modalidade: "",
      valor_estimado: "",
      data_disputa: "",
      data_limite: "",
      observacoes: "",
      etiquetas: "",
    },
  });

  // Preencher formulário ao editar
  useEffect(() => {
    if (licitacao && open) {
      const dataDisputa = licitacao.data_disputa 
        ? new Date(licitacao.data_disputa).toISOString().slice(0, 16)
        : "";
      const dataLimite = licitacao.data_limite
        ? new Date(licitacao.data_limite).toISOString().split('T')[0]
        : "";

      form.reset({
        titulo: licitacao.titulo || "",
        licitacao_codigo: licitacao.licitacao_codigo || "",
        numero_edital: licitacao.numero_edital || "",
        orgao: licitacao.orgao || "",
        objeto: licitacao.objeto || "",
        municipio_uf: licitacao.municipio_uf || "",
        tipo_modalidade: licitacao.tipo_modalidade || "",
        subtipo_modalidade: licitacao.subtipo_modalidade || "",
        valor_estimado: licitacao.valor_estimado?.toString() || "",
        data_disputa: dataDisputa,
        data_limite: dataLimite,
        observacoes: licitacao.observacoes || "",
        etiquetas: licitacao.etiquetas?.join(", ") || "",
      });
    } else if (!licitacao && open) {
      form.reset({
        titulo: "",
        licitacao_codigo: "",
        numero_edital: "",
        orgao: "",
        objeto: "",
        municipio_uf: "",
        tipo_modalidade: "",
        subtipo_modalidade: "",
        valor_estimado: "",
        data_disputa: "",
        data_limite: "",
        observacoes: "",
        etiquetas: "",
      });
    }
  }, [licitacao, open, form]);

  const onSubmit = async (values: any) => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      // Preparar dados
      const licitacaoData = {
        titulo: values.titulo,
        licitacao_codigo: values.licitacao_codigo,
        numero_edital: values.numero_edital || values.licitacao_codigo,
        orgao: values.orgao,
        objeto: values.objeto || values.titulo,
        municipio_uf: values.municipio_uf,
        subtipo_modalidade: values.subtipo_modalidade || values.modalidade,
        tipo_modalidade: values.tipo_modalidade,
        valor_estimado: values.valor_estimado ? parseFloat(values.valor_estimado) : null,
        data_disputa: values.data_disputa || null,
        data_limite: values.data_limite || null,
        observacoes: values.observacoes || null,
        etiquetas: values.etiquetas ? values.etiquetas.split(',').map((t: string) => t.trim()) : [],
        fonte: "Manual",
        status: "captacao_edital" as const,
        responsavel_id: userId,
      };

      let licitacaoResult;

      // Inserir ou atualizar licitação
      if (licitacao?.id) {
        const { data, error: licitacaoError } = await supabase
          .from("licitacoes")
          .update(licitacaoData)
          .eq("id", licitacao.id)
          .select()
          .single();

        if (licitacaoError) throw licitacaoError;
        licitacaoResult = data;
      } else {
        const { data, error: licitacaoError } = await supabase
          .from("licitacoes")
          .insert([licitacaoData])
          .select()
          .single();

        if (licitacaoError) throw licitacaoError;
        licitacaoResult = data;
      }

      // Upload do PDF se fornecido
      if (pdfFile && licitacaoResult) {
        const fileName = `${licitacaoResult.licitacao_codigo.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("editais-pdfs")
          .upload(`${licitacaoResult.id}/${fileName}`, pdfFile);

        if (uploadError) {
          console.error("Erro ao fazer upload do PDF:", uploadError);
          toast.warning("Licitação salva, mas houve erro ao anexar o PDF");
        }
      }

      // Criar tarefa na worklist apenas se for nova licitação
      if (!licitacao?.id) {
        const dataLimite = values.data_limite || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        let prioridade = "media";
        if (values.data_disputa) {
          const diasAteDisputa = Math.ceil(
            (new Date(values.data_disputa).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          prioridade = diasAteDisputa <= 10 ? "alta" : "media";
        }

        await supabase.from("worklist_tarefas").insert({
          modulo: "licitacoes",
          titulo: `Captação de edital – ${values.licitacao_codigo}`,
          descricao: values.titulo,
          status: "captacao_edital",
          prioridade,
          data_limite: dataLimite,
          licitacao_id: licitacaoResult.id,
          created_by: userId,
        });
      }

      toast.success(licitacao?.id ? "Licitação atualizada com sucesso!" : "Licitação criada com sucesso!");
      form.reset();
      setPdfFile(null);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Erro ao criar licitação:", error);
      toast.error(error.message || "Erro ao criar licitação");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{licitacao ? "Editar Licitação" : "Inserir Edital (Manual)"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="titulo"
              rules={{ required: "Título é obrigatório" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: PE 90049/2025 - Ourizona/PR" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="licitacao_codigo"
                rules={{ required: "Código é obrigatório" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código da Licitação *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: PE 90049/2025" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numero_edital"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número do Edital</FormLabel>
                    <FormControl>
                      <Input placeholder="Se diferente do código" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="orgao"
              rules={{ required: "Órgão é obrigatório" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Órgão Solicitante *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Prefeitura de Ourizona - PR" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="objeto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Objeto (suporta Markdown)</FormLabel>
                  <FormControl>
                    <MarkdownTextarea
                      placeholder="Descreva o objeto da licitação... Use **negrito**, *itálico*, # títulos, - listas"
                      className="min-h-[150px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="municipio_uf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Município/UF</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Ourizona/PR" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tipo_modalidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Modalidade</FormLabel>
                    <Select onValueChange={(value) => { field.onChange(value); form.setValue('subtipo_modalidade', ''); }} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIPO_MODALIDADE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subtipo_modalidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subtipo Modalidade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getSubtiposForTipo(form.watch('tipo_modalidade')).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="valor_estimado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Estimado (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0,00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="data_disputa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data da Disputa</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="data_limite"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Limite (SLA)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="etiquetas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etiquetas (separadas por vírgula)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: gss, dr joão" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição/Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Resumo do edital..."
                      className="min-h-[100px]"
                      maxLength={2000}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Anexar PDF do Edital</FormLabel>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="flex-1"
                />
                {pdfFile && (
                  <span className="text-sm text-muted-foreground">{pdfFile.name}</span>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                <Upload className="mr-2 h-4 w-4" />
                {isLoading ? "Salvando..." : (licitacao ? "Atualizar" : "Salvar Licitação")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
