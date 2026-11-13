import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, Loader2, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { cn } from "@/lib/utils";
import { nomeModelo, trechoModelo } from "@/lib/textoDono";
import {
  useEspecialidades, useExtracaoLifesHub, useListasProntas, useModelosAprovados, useNumerosOficiais, usePrevia, useUniversoCfm,
  type ExtracaoLifesHub, type ModeloAprovado, type NumeroOficial,
} from "@/components/campanhas/assistente/useAssistenteCampanha";
import { PassoConversa, type Destino, type ModoConversa } from "@/components/campanhas/assistente/PassoConversa";

/**
 * Assistente de criação de campanha (plano GSS dono no comando, Fase 2).
 * Pergunta da tela: "que campanha vou soltar agora?" — o dono responde 6 perguntas curtas e confirma (a 6ª, de 13/11: quem conversa e quem recebe o aviso).
 * Conversa guiada por botões: funciona sem IA (OpenAI sem crédito desde 14/10). Só API oficial (Chakra).
 * A campanha é criada pela RPC campanha_assistente_criar, que também coloca os leads na estratégia principal.
 */

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

const TIPOS_VAGA = [
  { value: "plantao", label: "Plantão" },
  { value: "ambulatorio", label: "Ambulatório" },
  { value: "fixa", label: "Vaga fixa" },
  { value: "sobreaviso", label: "Sobreaviso" },
];
const VALOR_POR = [
  { value: "plantao_12h", label: "por plantão de 12 h" },
  { value: "plantao_24h", label: "por plantão de 24 h" },
  { value: "hora", label: "por hora" },
  { value: "turno", label: "por turno" },
  { value: "mes", label: "por mês" },
];
const LIMITE_PADRAO = 50;

type Passo = "publico" | "lista" | "vaga" | "mensagem" | "numeros" | "conversa" | "resumo";
const PASSOS: Passo[] = ["publico", "lista", "vaga", "mensagem", "numeros", "conversa", "resumo"];
const PERGUNTA: Record<Passo, string> = {
  publico: "Para qual especialidade e região é a campanha?",
  lista: "De onde vem a lista de médicos?",
  vaga: "Onde é a vaga e quanto paga?",
  mensagem: "Qual mensagem vai no primeiro contato?",
  numeros: "Por quais números vamos falar com eles?",
  conversa: "Depois do primeiro contato, quem conversa com o médico?",
  resumo: "Confere e eu crio a campanha.",
};

const mil = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const fone = (e164: string) => {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : e164;
};

function preencherModelo(modelo: ModeloAprovado | undefined, valores: Record<string, string>) {
  if (!modelo) return "";
  return modelo.body.replace(/\{\{(\d+)\}\}/g, (_m, pos) => valores[pos] || `{{${pos}}}`);
}

export default function NovaCampanhaAssistente() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [passo, setPasso] = useState<Passo>("publico");
  const [feitos, setFeitos] = useState<Set<Passo>>(new Set());
  const passoAtualRef = useRef<HTMLElement | null>(null);
  // Ao avançar ou voltar, a pergunta da vez vem para a vista (a conversa cresce para baixo).
  useEffect(() => {
    passoAtualRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [passo]);

  const [especialidadeIds, setEspecialidadeIds] = useState<string[]>([]);
  const [ufs, setUfs] = useState<string[]>([]);
  const [origem, setOrigem] = useState<"crm" | "lista" | "lifeshub" | null>(null);
  const [pedidoLifesHub, setPedidoLifesHub] = useState<string | null>(null);
  const [listaId, setListaId] = useState<string | null>(null);
  const [vaga, setVaga] = useState({ cidade: "", hospital: "", tipo: "plantao", valorMin: "", valorMax: "", valorPor: "plantao_12h" });
  const [modeloNome, setModeloNome] = useState<string | null>(null);
  const [numerosEscolhidos, setNumerosEscolhidos] = useState<string[]>([]);
  const [limitePorNumero, setLimitePorNumero] = useState(LIMITE_PADRAO);
  const [nome, setNome] = useState("");
  const [modoConversa, setModoConversa] = useState<ModoConversa | null>(null);
  const [destinos, setDestinos] = useState<Destino[]>([]);

  // Vindo de /vagas ("Criar campanha para esta vaga"): especialidade, UF e vaga já respondidas.
  const [params] = useSearchParams();
  const vagaId = params.get("vaga");
  useEffect(() => {
    if (!vagaId) return;
    let cancelado = false;
    (supabase as any).from("vagas").select("especialidade_id, uf, cidade, hospital_nome, tipo, valor").eq("id", vagaId).maybeSingle()
      .then(({ data }: { data: any }) => {
        if (cancelado || !data) return;
        setEspecialidadeIds([data.especialidade_id]);
        if (data.uf) setUfs([data.uf]);
        const valor = String(data.valor || "").match(/\d[\d.]*(,\d+)?/)?.[0] || "";
        setVaga((v) => ({ ...v, cidade: data.cidade, hospital: data.hospital_nome, tipo: data.tipo, valorMin: valor }));
      });
    return () => { cancelado = true; };
  }, [vagaId]);

  const { data: especialidades = [] } = useEspecialidades();
  const { data: listas = [] } = useListasProntas();
  const { data: numeros = [], isLoading: carregandoNumeros } = useNumerosOficiais();
  const { data: modelos = [], isLoading: carregandoModelos } = useModelosAprovados();
  const { data: universo, isFetching: carregandoUniverso } = useUniversoCfm(especialidadeIds, ufs);
  const listaUsada = origem === "lista" ? listaId : null;
  const semCrm = origem === "lista" || origem === "lifeshub";
  const { data: previa, isFetching: carregandoPrevia } = usePrevia(semCrm ? [] : especialidadeIds, semCrm ? [] : ufs, listaUsada);

  // Life's Hub: um pedido por especialidade, sempre com estado (o robô filtra pela UF do CRM).
  const { data: extracao } = useExtracaoLifesHub(pedidoLifesHub);
  const pedirLifesHub = useMutation({
    mutationFn: async () => {
      const esp = especialidades.find((e) => e.id === especialidadeIds[0]);
      const { data, error } = await (supabase as any).rpc("rotina_pedir", {
        p_tipo: "lifeshub_lista", p_payload: { especialidade: esp?.nome, ufs },
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => setPedidoLifesHub(id),
    onError: (e: Error) => toast.error(`Não consegui pedir a extração: ${e.message}`),
  });
  // Lista pronta: entra como "lista pronta" já escolhida, e a prévia mostra quantos entram.
  useEffect(() => {
    if (extracao?.fase !== "pronta" || !extracao.listaId) return;
    qc.invalidateQueries({ queryKey: ["assistente-listas"] });
    setOrigem("lista");
    setListaId(extracao.listaId);
    setPedidoLifesHub(null);
    toast.success(`Lista do Life's Hub pronta: ${mil(extracao.comTelefone)} médicos com telefone.`);
  }, [extracao?.fase, extracao?.listaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const espNomes = especialidades.filter((e) => especialidadeIds.includes(e.id)).map((e) => titulo(e.nome));
  const espTexto = espNomes.join(", ");
  const regiaoTexto = ufs.length ? ufs.join(", ") : "Brasil todo";
  const lista = listas.find((l) => l.id === listaId);
  // Modelos com até 3 variáveis: {{1}} nome do médico, {{2}} especialidade, {{3}} cidade da vaga.
  const modelosUsaveis = modelos.filter((m) => Object.keys(m.variables || {}).length <= 3);
  const modelo = modelosUsaveis.find((m) => m.friendly_name === modeloNome);
  const variaveis: Record<string, string> = { "1": "{{lead.nome}}", "2": espNomes[0] || "", "3": vaga.cidade.trim() };
  const previaTexto = preencherModelo(modelo, { ...variaveis, "1": "Maria Clara Souza" });
  const numerosComModelo = numeros.filter((n) => modeloNome && n.templates.includes(modeloNome));
  const numerosSel = numeros.filter((n) => numerosEscolhidos.includes(n.sender_id));
  const porDia = limitePorNumero * Math.max(numerosSel.length, 1);
  const dias = previa?.entram ? Math.ceil(previa.entram / porDia) : 0;
  const nomeSugerido = [espNomes[0], vaga.cidade.trim()].filter(Boolean).join(" — ") || "Nova campanha";
  const valorTexto = vaga.valorMin
    ? `R$ ${vaga.valorMin}${vaga.valorMax ? ` a R$ ${vaga.valorMax}` : ""} ${VALOR_POR.find((v) => v.value === vaga.valorPor)?.label || ""}`
    : "a combinar";

  const podeSeguir: Record<Passo, boolean> = {
    publico: especialidadeIds.length > 0,
    lista: origem === "crm" ? (previa?.entram ?? 0) > 0 : origem === "lista" ? !!listaId && (previa?.entram ?? 0) > 0 : false,
    vaga: vaga.cidade.trim().length >= 3,
    mensagem: !!modelo,
    numeros: numerosSel.length > 0 && limitePorNumero >= 1,
    conversa: !!modoConversa,
    resumo: true,
  };

  const irPara = (p: Passo) => setPasso(p);
  const concluir = (p: Passo) => {
    setFeitos((atual) => new Set(atual).add(p));
    const proximo = PASSOS[PASSOS.indexOf(p) + 1];
    if (proximo === "mensagem" && !modeloNome && modelosUsaveis[0]) setModeloNome(modelosUsaveis[0].friendly_name);
    if (proximo === "numeros" && numerosEscolhidos.length === 0) {
      // Sugestão: os números prontos que têm o modelo; sem nenhum pronto, nada marcado (o dono decide).
      setNumerosEscolhidos(numerosComModelo.filter((n) => n.disponibilidade === "disponivel").map((n) => n.sender_id));
    }
    if (proximo === "resumo" && !nome) setNome(nomeSugerido);
    if (proximo) setPasso(proximo);
  };

  const criar = useMutation({
    mutationFn: async (comecar: boolean) => {
      const { data, error } = await (supabase as any).rpc("campanha_assistente_criar", {
        p: {
          nome: nome.trim() || nomeSugerido,
          especialidade_ids: origem === "lista" ? [] : especialidadeIds,
          ufs: origem === "lista" ? [] : ufs,
          lista_id: origem === "lista" ? listaId : null,
          template_name: modeloNome,
          template_variables: variaveis,
          sender_ids: numerosEscolhidos,
          tipo_envio: modoConversa === "manual" ? "manual" : "ia",
          alerta_destinos: destinos,
          limite_por_numero: limitePorNumero,
          comecar,
          briefing: {
            nome_servico: espNomes[0] || "",
            hospital: vaga.hospital.trim(),
            cidade: vaga.cidade.trim(),
            locais: [{ hospital: vaga.hospital.trim(), cidade: vaga.cidade.trim(), uf: ufs[0] || "" }],
            tipo_servico: TIPOS_VAGA.find((t) => t.value === vaga.tipo)?.label || "",
            valor_min: vaga.valorMin,
            valor_max: vaga.valorMax,
            valor_por: VALOR_POR.find((v) => v.value === vaga.valorPor)?.label || "",
            contratacao: "PJ",
          },
        },
      });
      if (error) throw error;
      const r = data as { campanha_id: string; leads: number; status: string };
      if (vagaId) await (supabase as any).from("vagas").update({ campanha_id: r.campanha_id }).eq("id", vagaId);
      return r;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      toast.success(
        r.status === "ativa"
          ? `Campanha criada com ${mil(r.leads)} médicos. O primeiro contato sai no próximo horário (7h às 17h, dias úteis).`
          : `Campanha criada pausada com ${mil(r.leads)} médicos. Ligue quando quiser.`,
      );
      navigate(`/prospeccao?campanha=${r.campanha_id}`);
    },
    onError: (e: any) => {
      const msg = String(e?.message || e);
      toast.error(
        msg.includes("modelo_nao_aprovado") ? "Um dos números não tem esse modelo aprovado. Volte e troque o número."
          : msg.includes("escolha") ? "Falta responder uma pergunta." : `Não consegui criar: ${msg}`,
      );
    },
  });

  const respostas: Record<Passo, string> = {
    publico: espTexto ? `${espTexto} · ${regiaoTexto}` : "",
    lista: origem === "crm" ? `Montar agora do CRM: ${mil(previa?.entram)} médicos` : origem === "lista" && lista ? `Lista “${lista.nome}”: ${mil(previa?.entram)} médicos` : "",
    vaga: vaga.cidade ? `${TIPOS_VAGA.find((t) => t.value === vaga.tipo)?.label} em ${vaga.cidade}${vaga.hospital ? ` (${vaga.hospital})` : ""} · ${valorTexto}` : "",
    mensagem: modelo ? nomeModelo(modelo.friendly_name) : "",
    numeros: numerosSel.length ? `${numerosSel.length} número(s), até ${limitePorNumero} por número/dia` : "",
    conversa: modoConversa
      ? `${modoConversa === "ia" ? "A IA conversa" : "A equipe conversa pelo Sigma"} · aviso para ${destinos.length ? destinos.map((d) => d.nome.split(" ")[0]).join(", ") : "a equipe geral"}`
      : "",
    resumo: "",
  };

  const headerActions = (
    <div className="flex min-w-0 items-center gap-3">
      <Button variant="ghost" size="icon" asChild aria-label="Voltar para campanhas">
        <Link to="/prospeccao"><ArrowLeft className="h-4 w-4" /></Link>
      </Button>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Nova campanha</h1>
        <p className="text-sm text-muted-foreground">Seis perguntas e a campanha está pronta.</p>
      </div>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="mx-auto grid max-w-6xl gap-6 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {PASSOS.map((p) => {
            const atual = p === passo;
            const feito = feitos.has(p) && !atual;
            if (!atual && !feito) return null;
            return (
              <section key={p} ref={atual ? passoAtualRef : undefined} className="scroll-mt-4 space-y-2" aria-current={atual ? "step" : undefined}>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </span>
                  <p className={cn("rounded-2xl rounded-tl-sm bg-muted px-4 py-2 text-sm", atual && "font-medium")}>
                    {PERGUNTA[p]}
                  </p>
                </div>
                {feito && (
                  <div className="flex items-center justify-end gap-2">
                    <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                      {respostas[p]}
                    </p>
                    <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-muted-foreground" onClick={() => irPara(p)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Mudar
                    </Button>
                  </div>
                )}
                {atual && (
                  <Card className="ml-9 p-4">
                    {p === "publico" && (
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Especialidade</Label>
                            <SearchableMultiSelect
                              options={especialidades.map((e) => ({ value: e.id, label: titulo(e.nome) }))}
                              values={especialidadeIds}
                              onChange={setEspecialidadeIds}
                              placeholder="Escolha a especialidade"
                              searchPlaceholder="Buscar especialidade..."
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Estados</Label>
                            <SearchableMultiSelect
                              options={UFS.map((uf) => ({ value: uf, label: uf }))}
                              values={ufs}
                              onChange={setUfs}
                              placeholder="Brasil todo"
                              searchPlaceholder="Buscar estado..."
                              maxBadges={6}
                            />
                          </div>
                        </div>
                        {especialidadeIds.length > 0 && (
                          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                            {carregandoUniverso ? (
                              <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Contando no CFM…</span>
                            ) : universo ? (
                              <p>
                                O CFM tem <strong className="tabular-nums">{mil(universo.brasil)}</strong> médicos de {espTexto} no Brasil
                                {universo.nas_ufs != null && <>, <strong className="tabular-nums">{mil(universo.nas_ufs)}</strong> em {regiaoTexto}</>}.
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}

                    {p === "lista" && (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          <OpcaoCard ativo={origem === "crm"} onClick={() => { setOrigem("crm"); setListaId(null); }}
                            titulo="Montar agora" detalhe={`Do CRM: ${espTexto || "especialidade"} ${ufs.length ? `em ${regiaoTexto}` : "no Brasil todo"}`} />
                          <OpcaoCard ativo={origem === "lista"} onClick={() => setOrigem("lista")}
                            titulo="Usar uma lista pronta" detalhe="Uma lista que a equipe já montou" />
                          <OpcaoCard ativo={origem === "lifeshub"} onClick={() => { setOrigem("lifeshub"); setListaId(null); }}
                            titulo="Extrair do Life's Hub" detalhe="O robô busca médicos com telefone" />
                        </div>
                        {origem === "lista" && (
                          <Select value={listaId || ""} onValueChange={setListaId}>
                            <SelectTrigger><SelectValue placeholder="Escolha a lista" /></SelectTrigger>
                            <SelectContent>
                              {listas.map((l) => (
                                <SelectItem key={l.id} value={l.id}>{l.nome}{l.total_estimado ? ` · ${mil(l.total_estimado)}` : ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {origem === "lifeshub" && (
                          <PainelLifesHub
                            espNome={especialidadeIds.length === 1 ? espTexto : null}
                            ufs={ufs}
                            pedindo={pedirLifesHub.isPending}
                            extracao={pedidoLifesHub ? extracao ?? { fase: "extraindo", listaId: null, exportados: null, comTelefone: null, erro: null } : null}
                            onPedir={() => pedirLifesHub.mutate()}
                            onNovaTentativa={() => setPedidoLifesHub(null)}
                          />
                        )}
                        {origem && (origem === "crm" || listaId) && (
                          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                            {carregandoPrevia ? (
                              <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Montando a lista…</span>
                            ) : previa ? (
                              <>
                                <p><strong className="tabular-nums">{mil(previa.entram)}</strong> médicos entram nesta campanha.</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Fora: {mil(previa.em_outras_campanhas)} já em outra campanha, quem pediu para sair, bloqueados e sem WhatsApp.
                                </p>
                                {previa.top_cidades.length > 0 && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Mais em: {previa.top_cidades.filter((c) => c.cidade !== "-" && c.cidade !== "(sem cidade)").slice(0, 5).map((c) => `${titulo(c.cidade)} (${c.n})`).join(", ")}
                                  </p>
                                )}
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}

                    {p === "vaga" && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <Campo label="Cidade da vaga">
                          <Input value={vaga.cidade} onChange={(e) => setVaga({ ...vaga, cidade: e.target.value })} placeholder="Ex.: Lucas do Rio Verde - MT" />
                        </Campo>
                        <Campo label="Hospital (opcional)">
                          <Input value={vaga.hospital} onChange={(e) => setVaga({ ...vaga, hospital: e.target.value })} placeholder="Ex.: Hospital São Lucas" />
                        </Campo>
                        <Campo label="Tipo">
                          <Select value={vaga.tipo} onValueChange={(v) => setVaga({ ...vaga, tipo: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{TIPOS_VAGA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </Campo>
                        <Campo label="Valor (opcional)">
                          <div className="flex flex-wrap items-center gap-2">
                            <Input inputMode="decimal" className="w-24" value={vaga.valorMin} onChange={(e) => setVaga({ ...vaga, valorMin: e.target.value })} placeholder="1.800" aria-label="Valor de" />
                            <span className="text-sm text-muted-foreground">a</span>
                            <Input inputMode="decimal" className="w-24" value={vaga.valorMax} onChange={(e) => setVaga({ ...vaga, valorMax: e.target.value })} placeholder="2.200" aria-label="Valor até" />
                            <Select value={vaga.valorPor} onValueChange={(v) => setVaga({ ...vaga, valorPor: v })}>
                              <SelectTrigger className="min-w-[170px] flex-1"><SelectValue /></SelectTrigger>
                              <SelectContent>{VALOR_POR.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </Campo>
                        {ufs.length === 0 && origem === "crm" && vaga.cidade.trim().length >= 3 && (
                          <p className="flex flex-wrap items-center gap-x-2 text-sm text-amber-800 dark:text-amber-300 md:col-span-2">
                            O público é o Brasil todo para uma vaga em {vaga.cidade.trim()}.
                            <button type="button" className="font-medium underline" onClick={() => irPara("publico")}>Escolher os estados</button>
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground md:col-span-2">A IA usa isso quando o médico pergunta valor e local.</p>
                      </div>
                    )}

                    {p === "mensagem" && (
                      <div className="space-y-3">
                        {carregandoModelos ? (
                          <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando modelos aprovados…</span>
                        ) : modelosUsaveis.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum modelo aprovado pela Meta. <Link className="underline" to="/prospeccao/templates-whatsapp">Criar um modelo</Link>.</p>
                        ) : (
                          <div className="space-y-2">
                            {modelosUsaveis.map((m) => (
                              <button key={m.friendly_name} type="button" onClick={() => setModeloNome(m.friendly_name)}
                                className={cn("w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/50",
                                  modeloNome === m.friendly_name && "border-primary ring-1 ring-primary")}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate font-medium">{nomeModelo(m.friendly_name)}</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">{m.numeros} {m.numeros === 1 ? "número" : "números"}</span>
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{trechoModelo(m.body)}</p>
                              </button>
                            ))}
                          </div>
                        )}
                        {modelo && (
                          <div className="rounded-lg bg-[#e7ffdb] p-3 text-sm text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]">
                            <p className="mb-1 text-xs opacity-70">Como o médico recebe:</p>
                            <p className="whitespace-pre-wrap">{previaTexto}</p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Precisa de outro texto? <Link className="underline" to="/prospeccao/templates-whatsapp">Criar um modelo novo</Link> — a Meta aprova em algumas horas.
                        </p>
                      </div>
                    )}

                    {p === "numeros" && (
                      <div className="space-y-3">
                        {carregandoNumeros ? (
                          <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando números…</span>
                        ) : (
                          <ul className="divide-y rounded-lg border">
                            {numeros.map((n) => (
                              <LinhaNumero key={n.sender_id} numero={n} temModelo={!!modeloNome && n.templates.includes(modeloNome)}
                                marcado={numerosEscolhidos.includes(n.sender_id)}
                                onToggle={(on) => setNumerosEscolhidos((atual) => on ? [...atual, n.sender_id] : atual.filter((id) => id !== n.sender_id))} />
                            ))}
                          </ul>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Label htmlFor="limite">Até</Label>
                          <Input id="limite" type="number" min={1} max={250} className="w-20" value={limitePorNumero}
                            onChange={(e) => setLimitePorNumero(Math.max(1, Math.min(250, Number(e.target.value) || 1)))} />
                          <span className="text-muted-foreground">primeiros contatos por número, por dia</span>
                        </div>
                        {!carregandoNumeros && !numeros.some((n) => n.templates.includes(modeloNome) && n.disponibilidade !== "indisponivel") && (
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                            <p className="min-w-0">Nenhum número pode mandar este modelo agora.</p>
                            <div className="flex shrink-0 gap-2">
                              <Button size="sm" variant="outline" onClick={() => irPara("mensagem")}>Trocar o modelo</Button>
                              <Button size="sm" variant="outline" asChild><Link to="/configuracoes?tab=whatsapp">Ver os números</Link></Button>
                            </div>
                          </div>
                        )}
                        {numerosSel.some((n) => n.disponibilidade !== "disponivel") && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Algum número escolhido está com atenção na Meta. A campanha tenta; se a Meta recusar, o número sai da rodada e os outros seguem.
                          </p>
                        )}
                      </div>
                    )}

                    {p === "conversa" && (
                      <PassoConversa modo={modoConversa} onModo={setModoConversa} destinos={destinos} onDestinos={setDestinos} />
                    )}

                    {p === "resumo" && (
                      <div className="space-y-4">
                        <dl className="grid gap-3 text-sm sm:grid-cols-2">
                          <ItemResumo rotulo="Médicos" valor={`${mil(previa?.entram)} de ${espTexto || "da lista"} · ${regiaoTexto}`} />
                          <ItemResumo rotulo="Vaga" valor={`${TIPOS_VAGA.find((t) => t.value === vaga.tipo)?.label} em ${vaga.cidade} · ${valorTexto}`} />
                          <ItemResumo rotulo="Números" valor={numerosSel.map((n) => fone(n.phone_e164)).join(", ")} />
                          <ItemResumo rotulo="Conversa" valor={respostas.conversa} />
                          <ItemResumo rotulo="Ritmo" valor={`Até ${mil(porDia)} por dia, 7h às 17h, dias úteis${dias > 0 ? ` · termina em ~${dias} dias úteis` : ""}`} />
                        </dl>
                        <Campo label="Nome da campanha">
                          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                        </Campo>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => criar.mutate(true)} disabled={criar.isPending}>
                            {criar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                            Criar e começar
                          </Button>
                          <Button variant="outline" onClick={() => criar.mutate(false)} disabled={criar.isPending}>Criar pausada</Button>
                        </div>
                      </div>
                    )}

                    {p !== "resumo" && (
                      <div className="mt-4 flex justify-end">
                        <Button onClick={() => concluir(p)} disabled={!podeSeguir[p]}>Continuar</Button>
                      </div>
                    )}
                  </Card>
                )}
              </section>
            );
          })}
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Rascunho da campanha</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{Math.min(feitos.size, 6)} de 6</span>
            </div>
            <dl className="space-y-3 text-sm">
              {(["publico", "lista", "vaga", "mensagem", "numeros", "conversa"] as Passo[]).map((p) => (
                <div key={p}>
                  <dt className="text-xs text-muted-foreground">{{ publico: "Público", lista: "Lista", vaga: "Vaga", mensagem: "Mensagem", numeros: "Números", conversa: "Conversa", resumo: "" }[p]}</dt>
                  <dd className={cn("break-words", !feitos.has(p) && "text-muted-foreground")}>{feitos.has(p) ? respostas[p] : "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Só WhatsApp oficial. Nada é enviado antes do seu “Criar”.
            </p>
          </Card>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Precisa de mais opções? <Link className="underline" to="/prospeccao?avancado=1">Modo avançado</Link>
          </p>
        </aside>
      </div>
    </AppLayout>
  );
}

function ItemResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 p-3">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 break-words font-medium">{valor}</dd>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PainelLifesHub({ espNome, ufs, pedindo, extracao, onPedir, onNovaTentativa }: {
  espNome: string | null; ufs: string[]; pedindo: boolean; extracao: ExtracaoLifesHub | null;
  onPedir: () => void; onNovaTentativa: () => void;
}) {
  if (!espNome || ufs.length === 0) {
    return (
      <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        Para extrair do Life's Hub, volte à primeira pergunta e escolha <strong>uma</strong> especialidade e os estados.
      </p>
    );
  }
  if (extracao?.fase === "erro") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="min-w-0">{extracao.erro}</p>
        <Button size="sm" variant="outline" onClick={onNovaTentativa}>Tentar de novo</Button>
      </div>
    );
  }
  if (extracao) {
    const importando = extracao.fase === "importando";
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span>
          {importando
            ? `Criando a lista com ${mil(extracao.comTelefone)} médicos que têm telefone…`
            : "O robô está extraindo do Life's Hub. Leva cerca de 1 minuto."}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="min-w-0">{espNome} com CRM em {ufs.join(", ")}. Só entra quem tem telefone.</p>
      <Button size="sm" onClick={onPedir} disabled={pedindo}>
        {pedindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Extrair agora
      </Button>
    </div>
  );
}

function OpcaoCard({ ativo, desabilitado, onClick, titulo, detalhe }: {
  ativo: boolean; desabilitado?: boolean; onClick?: () => void; titulo: string; detalhe: string;
}) {
  return (
    <button type="button" disabled={desabilitado} onClick={onClick}
      className={cn("min-w-0 rounded-lg border p-3 text-left text-sm transition-colors",
        ativo ? "border-primary ring-1 ring-primary" : "hover:bg-muted/50",
        desabilitado && "cursor-not-allowed opacity-50 hover:bg-transparent")}>
      <span className="block font-medium">{titulo}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{detalhe}</span>
    </button>
  );
}

const SELO = {
  disponivel: { rotulo: "Pronto", classe: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  atencao: { rotulo: "Atenção", classe: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  indisponivel: { rotulo: "Não usar", classe: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
} as const;

function LinhaNumero({ numero, temModelo, marcado, onToggle }: {
  numero: NumeroOficial; temModelo: boolean; marcado: boolean; onToggle: (on: boolean) => void;
}) {
  // "Sem este modelo" é cinza: não é problema do número, é só o modelo escolhido que não está nele.
  const selo = temModelo ? SELO[numero.disponibilidade || "indisponivel"] : { rotulo: "Sem este modelo", classe: "bg-muted text-muted-foreground" };
  const bloqueado = !temModelo || numero.disponibilidade === "indisponivel";
  const id = `num-${numero.sender_id}`;
  return (
    <li className={cn("flex items-start gap-3 p-3", bloqueado && "opacity-60")}>
      <Checkbox id={id} checked={marcado} disabled={bloqueado} onCheckedChange={(v) => onToggle(v === true)} className="mt-0.5" />
      <label htmlFor={id} className={cn("min-w-0 flex-1", !bloqueado && "cursor-pointer")}>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium tabular-nums">{fone(numero.phone_e164)}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", selo.classe)}>{selo.rotulo}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {numero.display_name || "Sem nome"}{numero.responsavel_nome ? ` · ${numero.responsavel_nome}` : ""}
        </span>
        <span className="block text-xs text-muted-foreground">
          {!temModelo ? "O modelo escolhido não está aprovado neste número." : (numero.disponibilidade_motivo || "").replace(/\s*\(\d{5,6}\)/g, "")}
        </span>
      </label>
    </li>
  );
}
