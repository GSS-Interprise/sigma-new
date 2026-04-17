import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDisparoListas,
  resolverContatosDaLista,
  type DisparoLista,
} from "@/hooks/useDisparoListas";
import { useNavigate } from "react-router-dom";
import { Megaphone, Send, Loader2, CheckCircle2, XCircle, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";

interface ResultadoEnvio {
  success: boolean;
  status?: number;
  raw?: string;
  parsed?: any;
  error?: string;
  enviadoEm: string;
  totalContatos: number;
}

export default function DisparosTrafegoPago() {
  const navigate = useNavigate();
  const { data: listas = [], isLoading } = useDisparoListas();

  const [listaId, setListaId] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [nomeCampanha, setNomeCampanha] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);

  const listaSelecionada = useMemo<DisparoLista | undefined>(
    () => listas.find((l) => l.id === listaId),
    [listas, listaId]
  );

  const handleEnviar = async () => {
    if (!listaSelecionada) {
      toast.error("Selecione uma lista de prospecção");
      return;
    }
    if (!webhookUrl.trim()) {
      toast.error("Informe a URL do webhook");
      return;
    }
    try {
      new URL(webhookUrl);
    } catch {
      toast.error("URL do webhook inválida");
      return;
    }

    setEnviando(true);
    setResultado(null);

    try {
      const contatos = await resolverContatosDaLista(listaSelecionada);

      if (contatos.length === 0) {
        toast.error("A lista não possui contatos válidos");
        setEnviando(false);
        return;
      }

      const payload = {
        campanha: nomeCampanha || listaSelecionada.nome,
        observacao: observacao || null,
        lista: {
          id: listaSelecionada.id,
          nome: listaSelecionada.nome,
        },
        total: contatos.length,
        contatos: contatos.map((c: any) => ({
          id: c.id,
          nome: c.nome,
          telefone: c.phone_e164,
          especialidade: c.especialidade,
          uf: c.uf,
          cidade: c.cidade,
          status: c.status,
        })),
        enviado_em: new Date().toISOString(),
      };

      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // resposta não é JSON
      }

      const successFlag =
        parsed && typeof parsed.success === "boolean"
          ? parsed.success
          : resp.ok;

      const r: ResultadoEnvio = {
        success: successFlag,
        status: resp.status,
        raw: text,
        parsed,
        enviadoEm: new Date().toISOString(),
        totalContatos: contatos.length,
      };
      setResultado(r);

      if (successFlag) {
        toast.success(`Enviado com sucesso (${contatos.length} contatos)`);
      } else {
        toast.error("Webhook respondeu com falha");
      }
    } catch (e: any) {
      setResultado({
        success: false,
        error: e?.message || "Erro desconhecido",
        enviadoEm: new Date().toISOString(),
        totalContatos: 0,
      });
      toast.error("Erro ao enviar: " + (e?.message || "desconhecido"));
    } finally {
      setEnviando(false);
    }
  };

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Megaphone className="h-6 w-6" />
        Tráfego Pago
      </h1>
      <p className="text-sm text-muted-foreground">
        Envie listas de prospecção para campanhas de tráfego pago via webhook
      </p>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="disparos_zap">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Configurar envio
              </CardTitle>
              <CardDescription>
                Selecione uma lista existente ou crie uma nova em "Lista para disparo"
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Lista de prospecção *</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => navigate("/disparos/leads?tab=listas")}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Criar/gerenciar listas
                  </Button>
                </div>
                <Select value={listaId} onValueChange={setListaId} disabled={isLoading}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={isLoading ? "Carregando..." : "Selecione uma lista"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {listas.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground">
                        Nenhuma lista encontrada
                      </div>
                    )}
                    {listas.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        <div className="flex items-center gap-2">
                          <ListChecks className="h-3 w-3" />
                          {l.nome}
                          {l.total_estimado != null && (
                            <span className="text-xs text-muted-foreground">
                              ~{l.total_estimado}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {listaSelecionada?.descricao && (
                  <p className="text-xs text-muted-foreground">
                    {listaSelecionada.descricao}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>URL do Webhook *</Label>
                <Input
                  placeholder="https://exemplo.com/webhook/trafego-pago"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O endpoint deve responder com JSON contendo{" "}
                  <code className="text-foreground">{`{ "success": true | false }`}</code>
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da campanha</Label>
                  <Input
                    placeholder="Opcional - usa o nome da lista se vazio"
                    value={nomeCampanha}
                    onChange={(e) => setNomeCampanha(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Observação</Label>
                  <Input
                    placeholder="Opcional"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={handleEnviar}
                disabled={enviando || !listaId || !webhookUrl}
                className="w-full"
                size="lg"
              >
                {enviando ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar lista para o webhook
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {resultado && (
            <Alert variant={resultado.success ? "default" : "destructive"}>
              {resultado.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertTitle>
                {resultado.success ? "Sucesso" : "Falha no envio"}
                {resultado.status && (
                  <Badge variant="outline" className="ml-2">
                    HTTP {resultado.status}
                  </Badge>
                )}
              </AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                <div className="text-xs">
                  Enviado em: {new Date(resultado.enviadoEm).toLocaleString("pt-BR")} •{" "}
                  {resultado.totalContatos} contato(s)
                </div>
                {resultado.error && (
                  <div className="text-sm font-medium">{resultado.error}</div>
                )}
                {resultado.raw && (
                  <div>
                    <Label className="text-xs">Resposta do webhook:</Label>
                    <Textarea
                      readOnly
                      value={resultado.raw}
                      className="font-mono text-xs h-32 mt-1"
                    />
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
