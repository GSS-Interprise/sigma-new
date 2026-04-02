import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const formSchema = z.object({
  destino: z.enum(["interno", "externo"], {
    required_error: "Selecione o destino do suporte",
  }),
  tipo: z.enum(["software", "hardware"], {
    required_error: "Selecione o tipo do suporte",
  }),
  fornecedor_externo: z.enum(["dr_escala", "infra_ti"]).optional(),
  descricao: z.string().min(10, "A descrição deve ter no mínimo 10 caracteres"),
  solicitante_id: z.string().optional(),
});

interface NovoTicketFormProps {
  onSuccess: (ticketId: string) => void;
}

export function NovoTicketForm({ onSuccess }: NovoTicketFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, isLoadingRoles } = usePermissions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ id: string; nome_completo: string; setor_id: string | null; setor_nome: string | null } | null>(null);
  const [userSearchOpen, setUserSearchOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*, setores(nome), user_roles(role)')
        .eq('id', user!.id)
        .single();
      return data;
    },
  });

  // Buscar todos os usuários para admins selecionarem
  const { data: allUsers } = useQuery({
    queryKey: ['all-users-for-ticket'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome_completo, setor_id, setores(nome)')
        .order('nome_completo');
      return data?.map(u => ({
        id: u.id,
        nome_completo: u.nome_completo || 'Sem nome',
        setor_id: u.setor_id,
        setor_nome: u.setores?.nome || null,
      })) || [];
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      destino: "interno",
      tipo: "software",
    },
  });

  const destino = form.watch("destino");

  // Habilitar cola de arquivos com Ctrl+V
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            if (file.size <= 10 * 1024 * 1024) {
              files.push(file);
            } else {
              toast({
                title: "Arquivo muito grande",
                description: `${file.name} excede o tamanho máximo de 10MB.`,
                variant: "destructive",
              });
            }
          }
        }
      }

      if (files.length > 0) {
        setSelectedFiles(prev => [...prev, ...files]);
        toast({
          title: "Arquivos colados",
          description: `${files.length} arquivo(s) adicionado(s) com sucesso.`,
        });
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles = files.filter(file => file.size <= 10 * 1024 * 1024);
      
      if (validFiles.length !== files.length) {
        toast({
          title: "Arquivo muito grande",
          description: "Alguns arquivos excederam o tamanho máximo de 10MB e foram ignorados.",
          variant: "destructive",
        });
      }
      
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !profile) return;

    setIsSubmitting(true);
    try {
      // Função para sanitizar nome do arquivo mantendo caracteres especiais
      const sanitizeFileName = (name: string) => {
        // Remove apenas caracteres que causam problemas no storage
        // Mantém acentos, números, letras e alguns caracteres especiais seguros
        return name
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Remove caracteres problemáticos
          .replace(/\s+/g, '_') // Substitui espaços por underline
          .substring(0, 200); // Limita o tamanho do nome
      };

      // Upload de arquivos se houver
      const anexos: string[] = [];
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const sanitizedName = sanitizeFileName(file.name);
          const fileName = `${user.id}/${Date.now()}_${sanitizedName}`;
          
          const { error: uploadError } = await supabase.storage
            .from('suporte-anexos')
            .upload(fileName, file, {
              contentType: file.type,
              upsert: false
            });

          if (!uploadError) {
            anexos.push(fileName);
          } else {
            console.error(`Erro ao fazer upload de ${file.name}:`, uploadError);
            toast({
              title: "Erro no upload",
              description: `Falha ao enviar arquivo: ${file.name}`,
              variant: "destructive",
            });
          }
        }
      }

      // Determinar o solicitante (admin pode abrir em nome de outro usuário)
      const ticketSolicitanteId = selectedUser?.id || user.id;
      const ticketSolicitanteNome = selectedUser?.nome_completo || profile.nome_completo;
      const ticketSetorId = selectedUser?.setor_id || profile.setor_id;
      const ticketSetorNome = selectedUser?.setor_nome || profile.setores?.nome || null;

      // Criar ticket
      const { data: ticket, error } = await supabase
        .from('suporte_tickets')
        .insert({
          solicitante_id: ticketSolicitanteId,
          solicitante_nome: ticketSolicitanteNome,
          setor_id: ticketSetorId,
          setor_nome: ticketSetorNome,
          destino: values.destino,
          tipo: values.tipo,
          fornecedor_externo: values.fornecedor_externo || null,
          descricao: values.descricao,
          anexos: anexos.length > 0 ? anexos : null,
          numero: '', // Será gerado pelo trigger
          status: "aberto" as const,
          setor_responsavel: "TI",
        })
        .select()
        .single();

      if (error) throw error;

      // Enviar email automático para o solicitante (sempre) e fornecedor externo (se aplicável)
      try {
        const { error: emailError } = await supabase.functions.invoke(
          "send-support-email",
          {
            body: {
              ticketId: ticket.id,
              ticketNumero: ticket.numero,
              solicitanteNome: ticket.solicitante_nome,
              solicitanteEmail: profile.email,
              setorNome: ticket.setor_nome || "Sem setor",
              dataAbertura: ticket.data_abertura,
              tipo: ticket.tipo,
              destino: ticket.destino,
              fornecedorExterno: ticket.fornecedor_externo || null,
              descricao: ticket.descricao,
              anexosCount: anexos.length,
              anexos: anexos,
            },
          }
        );

        if (emailError) {
          console.error("Erro ao enviar email:", emailError);
          toast({
            title: "Ticket criado com aviso",
            description: `Ticket ${ticket.numero} criado, mas houve erro ao enviar emails de confirmação.`,
            variant: "destructive",
          });
        } else {
          const msgExtra = values.destino === "externo" ? " e para o fornecedor externo" : "";
          toast({
            title: "Sucesso!",
            description: `Ticket ${ticket.numero} criado! Email de confirmação enviado${msgExtra}.`,
          });
        }
      } catch (emailError) {
        console.error("Erro ao invocar função de email:", emailError);
        toast({
          title: "Ticket criado",
          description: `Ticket ${ticket.numero} criado com sucesso! Emails serão enviados em breve.`,
        });
      }

      form.reset();
      setSelectedFiles([]);
      setSelectedUser(null);
      onSuccess(ticket.id);
    } catch (error: any) {
      toast({
        title: "Erro ao criar ticket",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }
  // Aguardar carregamento das permissões
  if (isLoadingRoles) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormItem>
            <FormLabel>Solicitante</FormLabel>
            {isAdmin ? (
              <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={userSearchOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedUser ? (
                      <span className="truncate">{selectedUser.nome_completo}</span>
                    ) : (
                      <span className="truncate">{profile?.nome_completo || 'Selecione um usuário'}</span>
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar usuário..." />
                    <CommandList>
                      <CommandEmpty>Nenhum usuário encontrado.</CommandEmpty>
                      <CommandGroup>
                        {/* Opção para voltar ao próprio usuário */}
                        <CommandItem
                          value={`${profile?.nome_completo || ''} (eu)`}
                          onSelect={() => {
                            setSelectedUser(null);
                            setUserSearchOpen(false);
                          }}
                        >
                          <span className="truncate">{profile?.nome_completo} (eu)</span>
                        </CommandItem>
                        {allUsers?.filter(u => u.id !== user?.id).map((u) => (
                          <CommandItem
                            key={u.id}
                            value={u.nome_completo}
                            onSelect={() => {
                              setSelectedUser(u);
                              setUserSearchOpen(false);
                            }}
                          >
                            <span className="truncate">{u.nome_completo}</span>
                            {u.setor_nome && (
                              <span className="ml-2 text-xs text-muted-foreground truncate">
                                ({u.setor_nome})
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <Input value={profile?.nome_completo || ''} disabled />
            )}
            {isAdmin && selectedUser && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-muted-foreground">
                  Abrindo ticket em nome de: {selectedUser.nome_completo}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => setSelectedUser(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </FormItem>

          <FormItem>
            <FormLabel>Data de Abertura</FormLabel>
            <Input value={new Date().toLocaleDateString('pt-BR')} disabled />
          </FormItem>
        </div>

        <FormField
          control={form.control}
          name="destino"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destino do Suporte *</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="interno" id="interno" />
                    <label htmlFor="interno" className="cursor-pointer">Interno</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="externo" id="externo" />
                    <label htmlFor="externo" className="cursor-pointer">Externo</label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tipo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo *</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="software" id="software" />
                    <label htmlFor="software" className="cursor-pointer">Software</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="hardware" id="hardware" />
                    <label htmlFor="hardware" className="cursor-pointer">Hardware</label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {destino === "externo" && (
          <FormField
            control={form.control}
            name="fornecedor_externo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fornecedor Externo *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o fornecedor" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="dr_escala">Dr. Escala</SelectItem>
                    <SelectItem value="infra_ti">Infraestrutura de TI</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="descricao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição do Pedido *</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Descreva o problema ou solicitação com detalhes..."
                  className="min-h-[120px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <FormLabel>Anexos</FormLabel>
          <div className="border-2 border-dashed rounded-lg p-4">
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.txt,.mp4,.mov,.avi,.webm,.mkv,video/*"
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="flex flex-col items-center gap-2 cursor-pointer">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Clique para selecionar arquivos, vídeos ou cole imagens (máx 10MB)
              </span>
            </label>
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-2 mt-4">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 border rounded">
                  <span className="text-sm truncate">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                  >
                    Remover
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Abrir Ticket
        </Button>
      </form>
    </Form>
  );
}
