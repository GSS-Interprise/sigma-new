import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Users, Send, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DisparoLista,
  useDeleteDisparoLista,
  useDisparoListaItens,
  useDisparoListas,
  useRemoveLeadFromLista,
} from "@/hooks/useDisparoListas";
import { ListaDisparoFormDialog } from "./ListaDisparoFormDialog";
import { ListaLeadsPickerDialog } from "./ListaLeadsPickerDialog";
import { useNavigate } from "react-router-dom";

const modoLabels: Record<string, { label: string; color: string }> = {
  manual: { label: "Manual", color: "bg-blue-500" },
  dinamica: { label: "Dinâmica", color: "bg-purple-500" },
  mista: { label: "Mista", color: "bg-amber-500" },
};

export function ListasDisparoTab() {
  const navigate = useNavigate();
  const { data: listas = [], isLoading } = useDisparoListas();
  const del = useDeleteDisparoLista();
  const [formOpen, setFormOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selecionada, setSelecionada] = useState<DisparoLista | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleNova = () => {
    setSelecionada(null);
    setFormOpen(true);
  };
  const handleEditar = (lista: DisparoLista) => {
    setSelecionada(lista);
    setFormOpen(true);
  };
  const handleAddLeads = (lista: DisparoLista) => {
    setSelecionada(lista);
    setPickerOpen(true);
  };
  const handleDisparar = (lista: DisparoLista) => {
    navigate(`/disparos/zap?lista=${lista.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Listas para disparo</h2>
          <p className="text-sm text-muted-foreground">
            Prepare listas reutilizáveis para campanhas de WhatsApp
          </p>
        </div>
        <Button onClick={handleNova} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova lista
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Nome</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>Filtros</TableHead>
              <TableHead>Criado por</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-48 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Carregando...</TableCell></TableRow>
            ) : listas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhuma lista criada ainda
                </TableCell>
              </TableRow>
            ) : (
              listas.map((lista) => {
                const m = modoLabels[lista.modo] || modoLabels.manual;
                const isOpen = expanded === lista.id;
                const filtros: string[] = [];
                if (lista.filtro_ufs?.length) filtros.push(`UFs: ${lista.filtro_ufs.join(", ")}`);
                if (lista.filtro_cidades?.length) filtros.push(`Cidades: ${lista.filtro_cidades.length}`);
                if (lista.filtro_especialidades?.length) filtros.push(`Esp: ${lista.filtro_especialidades.length}`);
                return (
                  <FragmentRow key={lista.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : lista.id)}>
                      <TableCell>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-medium">
                        {lista.nome}
                        {lista.descricao && <p className="text-xs text-muted-foreground">{lista.descricao}</p>}
                      </TableCell>
                      <TableCell><Badge className={`${m.color} text-white`}>{m.label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {filtros.length > 0 ? filtros.join(" · ") : "—"}
                      </TableCell>
                      <TableCell>{lista.created_by_nome || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(lista.created_at), "dd/MM/yy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {(lista.modo === "manual" || lista.modo === "mista") && (
                            <Button variant="ghost" size="icon" title="Adicionar leads" onClick={() => handleAddLeads(lista)}>
                              <Users className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Disparar" onClick={() => handleDisparar(lista)}>
                            <Send className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => handleEditar(lista)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" title="Remover"
                            onClick={() => {
                              if (confirm(`Remover a lista "${lista.nome}"?`)) del.mutate(lista.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && <ListaItensRow listaId={lista.id} />}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <ListaDisparoFormDialog open={formOpen} onOpenChange={setFormOpen} lista={selecionada} />
      {selecionada && (
        <ListaLeadsPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          listaId={selecionada.id}
          listaNome={selecionada.nome}
        />
      )}
    </div>
  );
}

function ListaItensRow({ listaId }: { listaId: string }) {
  const { data: itens = [], isLoading } = useDisparoListaItens(listaId);
  const remove = useRemoveLeadFromLista();

  return (
    <TableRow>
      <TableCell colSpan={7} className="bg-muted/30 p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando leads...</p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum lead adicionado manualmente. Use "Adicionar leads" ou configure filtros dinâmicos.
          </p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            <p className="text-xs font-medium text-muted-foreground mb-2">{itens.length} leads na lista</p>
            {itens.map((it: any) => (
              <div key={it.id} className="flex items-center justify-between rounded bg-background px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{it.leads?.nome || "—"}</span>
                  <span className="text-muted-foreground ml-2">
                    {it.leads?.phone_e164} · {it.leads?.especialidade || "-"} · {it.leads?.cidade || "-"}/{it.leads?.uf || "-"}
                  </span>
                </div>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => remove.mutate({ itemId: it.id, listaId })}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
