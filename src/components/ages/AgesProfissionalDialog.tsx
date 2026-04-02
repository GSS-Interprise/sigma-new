import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import AgesProfissionalDocumentos from "./AgesProfissionalDocumentos";

interface AgesProfissionalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profissional: any;
}

const statusOptions = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "pendente_documentacao", label: "Pendente Documentação" },
  { value: "em_analise", label: "Em Análise" },
];

const ufOptions = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const AgesProfissionalDialog = ({ open, onOpenChange, profissional }: AgesProfissionalDialogProps) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dados");

  const [formData, setFormData] = useState({
    nome: "",
    cpf: "",
    rg: "",
    data_nascimento: "",
    profissao: "",
    registro_profissional: "",
    telefone: "",
    email: "",
    endereco: "",
    cidade: "",
    uf: "",
    cep: "",
    banco: "",
    agencia: "",
    conta_corrente: "",
    chave_pix: "",
    status: "pendente_documentacao",
    observacoes: "",
  });

  useEffect(() => {
    if (profissional) {
      setFormData({
        nome: profissional.nome || "",
        cpf: profissional.cpf || "",
        rg: profissional.rg || "",
        data_nascimento: profissional.data_nascimento || "",
        profissao: profissional.profissao || "",
        registro_profissional: profissional.registro_profissional || "",
        telefone: profissional.telefone || "",
        email: profissional.email || "",
        endereco: profissional.endereco || "",
        cidade: profissional.cidade || "",
        uf: profissional.uf || "",
        cep: profissional.cep || "",
        banco: profissional.banco || "",
        agencia: profissional.agencia || "",
        conta_corrente: profissional.conta_corrente || "",
        chave_pix: profissional.chave_pix || "",
        status: profissional.status || "pendente_documentacao",
        observacoes: profissional.observacoes || "",
      });
    } else {
      setFormData({
        nome: "",
        cpf: "",
        rg: "",
        data_nascimento: "",
        profissao: "",
        registro_profissional: "",
        telefone: "",
        email: "",
        endereco: "",
        cidade: "",
        uf: "",
        cep: "",
        banco: "",
        agencia: "",
        conta_corrente: "",
        chave_pix: "",
        status: "pendente_documentacao",
        observacoes: "",
      });
    }
    setActiveTab("dados");
  }, [profissional, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formData,
        data_nascimento: formData.data_nascimento || null,
      };

      if (profissional?.id) {
        const { error } = await supabase
          .from("ages_profissionais")
          .update(payload)
          .eq("id", profissional.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ages_profissionais")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-profissionais"] });
      toast.success(profissional ? "Profissional atualizado" : "Profissional cadastrado");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao salvar");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {profissional ? "Editar Profissional" : "Novo Profissional"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
            {profissional?.id && (
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome Completo *</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                />
              </div>

              <div>
                <Label>Profissão *</Label>
                <Input
                  value={formData.profissao}
                  onChange={(e) => setFormData({ ...formData, profissao: e.target.value })}
                  placeholder="Ex: Fisioterapeuta, Enfermeiro..."
                />
              </div>

              <div>
                <Label>Registro Profissional</Label>
                <Input
                  value={formData.registro_profissional}
                  onChange={(e) => setFormData({ ...formData, registro_profissional: e.target.value })}
                  placeholder="Ex: CREFITO, COREN..."
                />
              </div>

              <div>
                <Label>CPF</Label>
                <Input
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                />
              </div>

              <div>
                <Label>RG</Label>
                <Input
                  value={formData.rg}
                  onChange={(e) => setFormData({ ...formData, rg: e.target.value })}
                />
              </div>

              <div>
                <Label>Data de Nascimento</Label>
                <Input
                  type="date"
                  value={formData.data_nascimento}
                  onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                />
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Telefone</Label>
                <Input
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                />
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="col-span-2">
                <Label>Endereço</Label>
                <Input
                  value={formData.endereco}
                  onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                />
              </div>

              <div>
                <Label>Cidade</Label>
                <Input
                  value={formData.cidade}
                  onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                />
              </div>

              <div>
                <Label>UF</Label>
                <Select
                  value={formData.uf}
                  onValueChange={(v) => setFormData({ ...formData, uf: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {ufOptions.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>CEP</Label>
                <Input
                  value={formData.cep}
                  onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-3">Dados Bancários</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Banco</Label>
                  <Input
                    value={formData.banco}
                    onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Agência</Label>
                  <Input
                    value={formData.agencia}
                    onChange={(e) => setFormData({ ...formData, agencia: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Conta Corrente</Label>
                  <Input
                    value={formData.conta_corrente}
                    onChange={(e) => setFormData({ ...formData, conta_corrente: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Chave PIX</Label>
                  <Input
                    value={formData.chave_pix}
                    onChange={(e) => setFormData({ ...formData, chave_pix: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !formData.nome || !formData.profissao}
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </TabsContent>

          {profissional?.id && (
            <TabsContent value="documentos" className="mt-4">
              <AgesProfissionalDocumentos profissionalId={profissional.id} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AgesProfissionalDialog;
