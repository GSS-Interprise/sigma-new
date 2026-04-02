import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AgesLeadProntuarioDialog } from "./AgesLeadProntuarioDialog";

interface AgesProfissional {
  id: string;
  nome: string;
  cpf: string | null;
  profissao: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  status: string;
  created_at: string;
  lead_origem_id: string | null;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  ativo: { label: "Ativo", color: "bg-green-500" },
  inativo: { label: "Inativo", color: "bg-gray-500" },
  pendente_documentacao: { label: "Pend. Documentação", color: "bg-amber-500" },
  em_analise: { label: "Em Análise", color: "bg-blue-500" },
};

const AgesCadastroTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [prontuarioOpen, setProntuarioOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const { data: profissionais = [], isLoading } = useQuery({
    queryKey: ["ages-profissionais", search],
    queryFn: async () => {
      let query = supabase
        .from("ages_profissionais")
        .select("*")
        .order("nome");

      if (search) {
        query = query.or(`nome.ilike.%${search}%,profissao.ilike.%${search}%,cpf.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AgesProfissional[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ages_profissionais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-profissionais"] });
      toast.success("Profissional removido");
    },
    onError: () => {
      toast.error("Erro ao remover");
    },
  });

  const handleOpenProntuario = (p: AgesProfissional) => {
    if (p.lead_origem_id) {
      setSelectedLeadId(p.lead_origem_id);
      setProntuarioOpen(true);
    } else {
      toast.error("Este profissional não possui lead de origem vinculado");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, profissão ou CPF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Profissão</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : profissionais.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum profissional encontrado
                </TableCell>
              </TableRow>
            ) : (
              profissionais.map((p) => {
                const statusInfo = statusLabels[p.status] || { label: p.status, color: "bg-gray-400" };
                return (
                  <TableRow 
                    key={p.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleOpenProntuario(p)}
                  >
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.profissao}</TableCell>
                    <TableCell>{p.cpf || "-"}</TableCell>
                    <TableCell>{p.telefone || "-"}</TableCell>
                    <TableCell>
                      {p.cidade && p.uf ? `${p.cidade}/${p.uf}` : p.uf || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusInfo.color} text-white`}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenProntuario(p);
                          }}
                          title="Ver Prontuário"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Remover este profissional?")) {
                              deleteMutation.mutate(p.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {selectedLeadId && (
        <AgesLeadProntuarioDialog
          open={prontuarioOpen}
          onOpenChange={setProntuarioOpen}
          leadId={selectedLeadId}
        />
      )}
    </div>
  );
};

export default AgesCadastroTab;
