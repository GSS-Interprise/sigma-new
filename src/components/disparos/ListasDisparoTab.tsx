import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users, Send, Upload, FilePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DisparoLista,
  useDeleteDisparoLista,
  useDisparoListaItens,
  useDisparoListas,
  useRemoveLeadFromLista,
  useActiveImportJobForLista,
  useActiveImportJobsByLista,
  DISPARO_LISTA_PAGE_SIZE,
} from "@/hooks/useDisparoListas";
import { CubeSpinner } from "@/components/ui/cube-spinner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ListaDisparoFormDialog } from "./ListaDisparoFormDialog";
import { ListaLeadsPickerDialog } from "./ListaLeadsPickerDialog";
import { ImportarLeadsDialog } from "@/components/medicos/ImportarLeadsDialog";
import { useNavigate } from "react-router-dom";

export function ListasDisparoTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: listas = [], isLoading } = useDisparoListas();
  const { data: activeJobsByLista = {} } = useActiveImportJobsByLista();
  const del = useDeleteDisparoLista();
  const [formOpen, setFormOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [selecionada, setSelecionada] = useState<DisparoLista | null>(null);
  const [importPromptOpen, setImportPromptOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importNome, setImportNome] = useState("");
  const [importDesc, setImportDesc] = useState("");
  const [complementarListaId, setComplementarListaId] = useState<string | null>(null);
  const [complementarOpen, setComplementarOpen] = useState(false);

  const handleNova = () => { setSelecionada(null); setFormOpen(true); };
  const handleEditar = (lista: DisparoLista) => { setSelecionada(lista); setFormOpen(true); };
  const handleAddLeads = (lista: DisparoLista) => { setSelecionada(lista); setPickerOpen(true); };
  const handleAbrir = (lista: DisparoLista) => { setSelecionada(lista); setDetalhesOpen(true); };
  const handleDisparar = (lista: DisparoLista) => navigate(`/disparos/zap?lista=${lista.id}`);

  const handleAbrirImport = () => {
    setImportNome("");
    setImportDesc("");
    setImportPromptOpen(true);
  };

  const handleConfirmarImport = () => {
    if (!importNome.trim()) {
      toast.error("Informe o nome da lista");
      return;
    }
    setImportPromptOpen(false);
    setImportDialogOpen(true);
  };

  const handleComplementar = (lista: DisparoLista) => {
    setComplementarListaId(lista.id);
    setComplementarOpen(true);
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleAbrirImport} className="gap-2">
            <Upload className="h-4 w-4" />
            Importar lista
          </Button>
          <Button onClick={handleNova} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova lista
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Criado por</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-48 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">Carregando...</TableCell></TableRow>
            ) : listas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nenhuma lista criada ainda
                </TableCell>
              </TableRow>
            ) : (
              listas.map((lista) => (
                <TableRow
                  key={lista.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleAbrir(lista)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      {activeJobsByLista[lista.id] && (
                        <CubeSpinner className="shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate">{lista.nome}</p>
                        {activeJobsByLista[lista.id] ? (
                          <p className="text-xs text-primary">
                            Importando… {activeJobsByLista[lista.id].chunk_atual ?? 0}/
                            {activeJobsByLista[lista.id].total_chunks ?? "?"} blocos
                          </p>
                        ) : (
                          lista.descricao && (
                            <p className="text-xs text-muted-foreground truncate">{lista.descricao}</p>
                          )
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{lista.created_by_nome || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(lista.created_at), "dd/MM/yy", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Adicionar leads" onClick={() => handleAddLeads(lista)}>
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Complementar lista (importar planilha)"
                        onClick={() => handleComplementar(lista)}
                      >
                        <FilePlus className="h-4 w-4" />
                      </Button>
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
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ListaDisparoFormDialog open={formOpen} onOpenChange={setFormOpen} lista={selecionada} />
      {selecionada && (
        <>
          <ListaLeadsPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            listaId={selecionada.id}
            listaNome={selecionada.nome}
          />
          <ListaDetalhesDialog
            open={detalhesOpen}
            onOpenChange={setDetalhesOpen}
            lista={selecionada}
            onAddLeads={() => { setDetalhesOpen(false); setPickerOpen(true); }}
            onComplementarCsv={() => {
              setDetalhesOpen(false);
              handleComplementar(selecionada);
            }}
          />
        </>
      )}

      {/* Prompt para nome da nova lista (antes de abrir o import) */}
      <Dialog open={importPromptOpen} onOpenChange={setImportPromptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova lista por importação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-lista-nome">
                Nome da lista <span className="text-destructive">*</span>
              </Label>
              <Input
                id="import-lista-nome"
                value={importNome}
                onChange={(e) => setImportNome(e.target.value)}
                placeholder="Ex.: Cardiologistas SP - Nov/2025"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-lista-desc">Descrição (opcional)</Label>
              <Textarea
                id="import-lista-desc"
                value={importDesc}
                onChange={(e) => setImportDesc(e.target.value)}
                placeholder="Como esta lista será usada"
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              No próximo passo você envia a planilha. Leads novos serão criados,
              os já existentes (mesmo telefone) serão reaproveitados — todos vão
              direto para esta lista de disparo.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setImportPromptOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmarImport}>Continuar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de importação de leads (mesmo modelo da aba Leads) */}
      <ImportarLeadsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        listaDestino={
          importNome
            ? { mode: "new", nome: importNome.trim(), descricao: importDesc.trim() || undefined }
            : undefined
        }
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["disparo-listas"] });
          toast.success("Importação iniciada — a lista será preenchida em segundo plano.");
        }}
      />

      {/* Dialog de importação para complementar uma lista existente */}
      <ImportarLeadsDialog
        open={complementarOpen}
        onOpenChange={(v) => {
          setComplementarOpen(v);
          if (!v) setComplementarListaId(null);
        }}
        listaDestino={
          complementarListaId ? { mode: "existing", id: complementarListaId } : undefined
        }
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["disparo-listas"] });
          queryClient.invalidateQueries({ queryKey: ["disparo-lista-itens"] });
          toast.success("Importação iniciada — novos leads serão adicionados a esta lista.");
        }}
      />
    </div>
  );
}

function ListaDetalhesDialog({
  open, onOpenChange, lista, onAddLeads,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lista: DisparoLista;
  onAddLeads: () => void;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useDisparoListaItens(
    open ? lista.id : null,
    page,
  );
  const itens = data?.itens ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DISPARO_LISTA_PAGE_SIZE));
  const remove = useRemoveLeadFromLista();
  const { data: activeJob } = useActiveImportJobForLista(open ? lista.id : null);
  const queryClient = useQueryClient();

  // Reset paginação ao reabrir o dialog para outra lista
  useEffect(() => {
    if (open) setPage(1);
  }, [open, lista.id]);

  // Enquanto há job ativo, refaz a query da lista a cada poucos segundos
  // para acompanhar o crescimento em tempo real.
  useEffect(() => {
    if (!open || !activeJob) return;
    const t = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["disparo-lista-itens", lista.id] });
    }, 4000);
    return () => clearInterval(t);
  }, [open, activeJob?.id, lista.id, queryClient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{lista.nome}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {isLoading ? "Carregando..." : `${total} leads na lista`}
          </span>
          <Button size="sm" onClick={onAddLeads} className="gap-2">
            <Plus className="h-4 w-4" /> Adicionar leads
          </Button>
        </div>

        {activeJob && (
          <div className="flex items-center gap-4 rounded-md border border-primary/30 bg-primary/5 p-4">
            <CubeSpinner />
            <div className="text-sm">
              <p className="font-medium">Importando leads em segundo plano…</p>
              <p className="text-xs text-muted-foreground">
                {activeJob.chunk_atual ?? 0} de {activeJob.total_chunks ?? "?"} blocos processados
                {activeJob.total_linhas
                  ? ` · ${activeJob.linhas_processadas ?? 0} / ${activeJob.total_linhas} linhas`
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                A lista vai continuar enchendo automaticamente — pode fechar esta janela.
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto rounded-md border">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando leads...</p>
          ) : itens.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Nenhum lead adicionado. Use "Adicionar leads" para incluir contatos com filtros.
            </p>
          ) : (
            <div className="divide-y">
              {itens.map((it: any) => (
                <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{it.leads?.nome || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {it.leads?.phone_e164} · {it.leads?.especialidade || "-"} · {it.leads?.cidade || "-"}/{it.leads?.uf || "-"}
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => remove.mutate({ itemId: it.id, listaId: lista.id })}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {total > DISPARO_LISTA_PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm pt-2">
            <span className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
              {isFetching ? " · atualizando…" : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
