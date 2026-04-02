import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FiltroDisparos } from "./FiltroDisparos";
import { EditorMensagem } from "./EditorMensagem";
import { PreviewMensagem } from "./PreviewMensagem";
import { HistoricoDisparos } from "./HistoricoDisparos";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Calendar, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { useEspecialidadesNomes } from "@/hooks/useEspecialidades";

export function AbaDisparos() {
  const [tipoDisparo, setTipoDisparo] = useState("whatsapp");
  const [especialidade, setEspecialidade] = useState("");
  const [estado, setEstado] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [assuntoEmail, setAssuntoEmail] = useState("");
  const [corpoEmail, setCorpoEmail] = useState("");
  const [revisadoIA, setRevisadoIA] = useState(false);
  const [chipId, setChipId] = useState("");
  const [tamanhoLote, setTamanhoLote] = useState(500);
  const [agendarEnvio, setAgendarEnvio] = useState(false);
  const [dataAgendamento, setDataAgendamento] = useState("");
  const [horaAgendamento, setHoraAgendamento] = useState("");
  const queryClient = useQueryClient();
  
  const { data: especialidades = [] } = useEspecialidadesNomes();

  useEffect(() => {
    const saved = localStorage.getItem("disparos-draft");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setTipoDisparo(data.tipoDisparo || "whatsapp");
        setEspecialidade(data.especialidade || "");
        setEstado(data.estado || "");
        setMensagem(data.mensagem || "");
        setAssuntoEmail(data.assuntoEmail || "");
        setCorpoEmail(data.corpoEmail || "");
        setChipId(data.chipId || "");
        setTamanhoLote(data.tamanhoLote || 500);
      } catch (e) {
        console.error("Erro ao carregar draft:", e);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(
        "disparos-draft",
        JSON.stringify({ tipoDisparo, especialidade, estado, mensagem, assuntoEmail, corpoEmail, chipId, tamanhoLote })
      );
    }, 3000);
    return () => clearTimeout(timer);
  }, [tipoDisparo, especialidade, estado, mensagem, assuntoEmail, corpoEmail, chipId, tamanhoLote]);

  const { data: chips = [] } = useQuery({
    queryKey: ["chips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips")
        .select("*")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: contacts = [], isLoading: isLoadingContacts } = useQuery({
    queryKey: ['contacts-disparo', especialidade, estado],
    queryFn: async () => {
      const allContacts: any[] = [];
      
      const { data: blacklist } = await supabase.from('blacklist').select('phone_e164');
      const blacklistedPhones = new Set(blacklist?.map(b => b.phone_e164) || []);
      
      // Buscar histórico de disparos recentes (últimos 7 dias)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: recentDisparos } = await supabase
        .from('disparos_historico_contatos')
        .select('email, telefone')
        .gte('ultimo_disparo', sevenDaysAgo.toISOString());
      
      const recentEmails = new Set(recentDisparos?.filter(d => d.email).map(d => d.email) || []);
      const recentPhones = new Set(recentDisparos?.filter(d => d.telefone).map(d => d.telefone) || []);
      
      // Buscar leads - incluir Novo, Qualificado e Em Contato (excluir quem já respondeu e convertidos)
      let leadsQuery = supabase
        .from('leads')
        .select('phone_e164, nome, especialidade, uf, email')
        .in('status', ['Novo', 'Qualificado', 'Em Contato'])
        .neq('status', 'Convertido'); // Leads convertidos não recebem disparos
      
      // No banco, leads.especialidade é string simples, não array
      if (especialidade) {
        leadsQuery = leadsQuery.eq('especialidade', especialidade);
      }
      if (estado) {
        leadsQuery = leadsQuery.eq('uf', estado);
      }
      
      const { data: leadsData } = await leadsQuery;
      leadsData?.forEach((lead) => {
        if (!blacklistedPhones.has(lead.phone_e164)) {
          // Verificar se não recebeu disparo recentemente
          const isRecentlyContacted = lead.email ? recentEmails.has(lead.email) : recentPhones.has(lead.phone_e164);
          
          allContacts.push({
            nome: lead.nome,
            telefone: lead.phone_e164,
            email: lead.email,
            bloqueado: isRecentlyContacted,
            motivo_bloqueio: isRecentlyContacted ? 'Recebeu mensagem nos últimos 7 dias' : null
          });
        }
      });
      
      // Buscar médicos
      let medicosQuery = supabase
        .from('medicos')
        .select('phone_e164, nome_completo, especialidade, estado, email')
        .eq('status_medico', 'Ativo');
      
      // No banco, medicos.especialidade é array
      if (especialidade) {
        medicosQuery = medicosQuery.contains('especialidade', [especialidade]);
      }
      if (estado) {
        medicosQuery = medicosQuery.eq('estado', estado);
      }
      
      const { data: medicosData } = await medicosQuery;
      medicosData?.forEach((medico) => {
        if (!blacklistedPhones.has(medico.phone_e164)) {
          const isRecentlyContacted = medico.email ? recentEmails.has(medico.email) : recentPhones.has(medico.phone_e164);
          
          allContacts.push({
            nome: medico.nome_completo,
            telefone: medico.phone_e164,
            email: medico.email,
            bloqueado: isRecentlyContacted,
            motivo_bloqueio: isRecentlyContacted ? 'Recebeu mensagem nos últimos 7 dias' : null
          });
        }
      });
      
      return allContacts;
    },
    enabled: !!especialidade,
  });
  
  const totalDestinatarios = contacts.filter(c => !c.bloqueado).length;
  const contactsBloqueados = contacts.filter(c => c.bloqueado).length;

  const { data: estados = [] } = useQuery({
    queryKey: ["estados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("medicos").select("estado");
      if (error) throw error;
      return Array.from(new Set(data.map((m) => m.estado).filter(uf => uf && uf.trim() !== ""))).sort();
    },
  });

  const handleRevisarIA = async () => {
    if (!mensagem.trim() || !especialidade) {
      toast.error("Preencha a mensagem e selecione uma especialidade");
      return;
    }
    try {
      toast.loading("Revisando mensagem com IA...");
      const { data, error } = await supabase.functions.invoke("revisar-mensagem", { body: { mensagem, especialidade } });
      if (error) throw error;
      setMensagem(data.mensagemRevisada);
      setRevisadoIA(true);
      toast.dismiss();
      toast.success("Mensagem revisada com sucesso!");
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.message || "Erro ao revisar mensagem");
    }
  };

  const enviarMutation = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");
      const profile = await supabase.from("profiles").select("nome_completo").eq("id", user.id).single();

      if (agendarEnvio && dataAgendamento && horaAgendamento) {
        const { error } = await supabase.from("disparos_programados").insert({
          usuario_id: user.id, 
          chip_id: chipId || null, 
          especialidade, 
          estado: estado || null, 
          mensagem: tipoDisparo === 'whatsapp' ? mensagem : null,
          tipo_disparo: tipoDisparo,
          assunto_email: tipoDisparo === 'email' ? assuntoEmail : null,
          corpo_email: tipoDisparo === 'email' ? corpoEmail : null,
          data_agendamento: new Date(`${dataAgendamento}T${horaAgendamento}`).toISOString(),
          tamanho_lote: tamanhoLote, 
          total_destinatarios: totalDestinatarios, 
          status: "agendado",
        });
        if (error) throw error;
        return { tipo: "agendado" };
      }

      const destinatariosData = contacts
        .filter(c => !c.bloqueado)
        .map((c) => ({ nome: c.nome, telefone: c.telefone, email: (c as any).email }));
      let enviados = 0, falhas = 0;
      
      // Registrar contatos no histórico de disparos
      const contatosParaHistorico = destinatariosData.map(d => ({
        email: d.email || null,
        telefone: d.telefone || null,
        ultima_campanha: tipoDisparo === 'email' ? assuntoEmail : 'WhatsApp',
        ultimo_disparo: new Date().toISOString()
      }));
      
      // Inserir/atualizar histórico (upsert)
      for (const contato of contatosParaHistorico) {
        await supabase
          .from('disparos_historico_contatos')
          .upsert(contato, { 
            onConflict: 'email,telefone',
            ignoreDuplicates: false 
          });
      }
      
      // Se for email, enviar de verdade usando edge function
      if (tipoDisparo === 'email') {
        const destinatariosEmail = destinatariosData.filter(d => d.email && d.email.includes('@'));
        if (destinatariosEmail.length === 0) {
          throw new Error('Nenhum destinatário com e-mail válido encontrado.');
        }
        const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-bulk-emails', {
          body: {
            assunto: assuntoEmail,
            corpo: corpoEmail,
            destinatarios: destinatariosEmail,
            tamanhoLote
          }
        });
        
        if (emailError) throw emailError;
        
        enviados = emailResult.enviados || 0;
        falhas = emailResult.falhas || 0;
        
        // Criar leads no Kanban para os emails enviados
        const disparoLogId = crypto.randomUUID();
        for (const dest of destinatariosEmail) {
          await supabase.from('captacao_leads').insert({
            nome: dest.nome,
            email: dest.email,
            telefone: dest.telefone,
            status: 'enviados',
            ultima_mensagem_enviada: `${assuntoEmail}\n\n${corpoEmail}`,
            data_ultimo_contato: new Date().toISOString()
          });
        }
      } else {
        // WhatsApp - simulação por enquanto
        for (let i = 0; i < totalDestinatarios; i += tamanhoLote) {
          enviados += Math.min(tamanhoLote, totalDestinatarios - i);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      const { error } = await supabase.from("disparos_log").insert({
        usuario_id: user.id, 
        usuario_nome: profile.data?.nome_completo || "Usuário",
        especialidade, 
        estado: estado || null, 
        mensagem: tipoDisparo === 'whatsapp' ? mensagem : `${assuntoEmail}\n\n${corpoEmail}`,

        tipo_disparo: tipoDisparo,
        assunto_email: tipoDisparo === 'email' ? assuntoEmail : null,
        corpo_email: tipoDisparo === 'email' ? corpoEmail : null,
        total_destinatarios: totalDestinatarios,
        enviados, 
        falhas, 
        revisado_ia: revisadoIA, 
        destinatarios: destinatariosData, 
        chip_id: chipId || null,
      });
      if (error) throw error;
      return { tipo: "imediato", enviados, falhas };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["disparos-log"] });
      queryClient.invalidateQueries({ queryKey: ["disparos-programados"] });
      toast.success(result.tipo === "agendado" ? "Disparo agendado com sucesso!" : `Disparos enviados! ${result.enviados} enviados.`);
      setMensagem(""); setRevisadoIA(false); setAgendarEnvio(false); setDataAgendamento(""); setHoraAgendamento("");
      localStorage.removeItem("disparos-draft");
    },
    onError: (error: any) => toast.error(error.message || "Erro ao processar disparos"),
  });

  const desabilitarEnvio = 
    !especialidade || 
    (tipoDisparo === 'whatsapp' && (!mensagem.trim() || !chipId)) ||
    (tipoDisparo === 'email' && (!assuntoEmail.trim() || !corpoEmail.trim())) ||
    totalDestinatarios === 0 || 
    (agendarEnvio && (!dataAgendamento || !horaAgendamento));

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-2">
          <Label htmlFor="tipo">Tipo de Disparo *</Label>
          <Select value={tipoDisparo} onValueChange={setTipoDisparo}>
            <SelectTrigger id="tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp (Chip)</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <FiltroDisparos especialidade={especialidade} estado={estado} especialidades={especialidades} estados={estados} onEspecialidadeChange={setEspecialidade} onEstadoChange={setEstado} />
      
      {tipoDisparo === 'whatsapp' && (
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="chip">Chip para Envio *</Label>
              <Select value={chipId} onValueChange={setChipId}>
                <SelectTrigger><SelectValue placeholder="Selecione um chip" /></SelectTrigger>
                <SelectContent>{chips.map((chip) => <SelectItem key={chip.id} value={chip.id}>{chip.nome} - {chip.numero}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lote">Tamanho do Lote</Label>
              <Input id="lote" type="number" min="50" max="1000" step="50" value={tamanhoLote} onChange={(e) => setTamanhoLote(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="agendar" checked={agendarEnvio} onCheckedChange={(checked) => setAgendarEnvio(checked as boolean)} />
            <Label htmlFor="agendar" className="flex items-center gap-2 cursor-pointer"><Calendar className="h-4 w-4" />Agendar envio automático</Label>
          </div>
          {agendarEnvio && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2"><Label htmlFor="data">Data</Label><Input id="data" type="date" value={dataAgendamento} onChange={(e) => setDataAgendamento(e.target.value)} min={new Date().toISOString().split("T")[0]} /></div>
              <div className="space-y-2"><Label htmlFor="hora">Hora</Label><Input id="hora" type="time" value={horaAgendamento} onChange={(e) => setHoraAgendamento(e.target.value)} /></div>
            </div>
          )}
        </Card>
      )}

      {tipoDisparo === 'whatsapp' ? (
        <>
          <EditorMensagem mensagem={mensagem} revisadoIA={revisadoIA} onMensagemChange={(val) => { setMensagem(val); setRevisadoIA(false); }} onRevisarIA={handleRevisarIA} />
          <PreviewMensagem mensagem={mensagem} totalDestinatarios={totalDestinatarios} isLoading={isLoadingContacts} />
        </>
      ) : (
        <>
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="assunto">Assunto do E-mail *</Label>
              <Input
                id="assunto"
                value={assuntoEmail}
                onChange={(e) => setAssuntoEmail(e.target.value)}
                placeholder="Digite o assunto do e-mail"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="corpo">Corpo do E-mail *</Label>
              <Textarea
                id="corpo"
                value={corpoEmail}
                onChange={(e) => setCorpoEmail(e.target.value)}
                placeholder="Digite o conteúdo do e-mail"
                rows={12}
                className="resize-none"
              />
            </div>
          </Card>
          <PreviewMensagem mensagem={`Assunto: ${assuntoEmail}\n\n${corpoEmail}`} totalDestinatarios={totalDestinatarios} isLoading={isLoadingContacts} />
        </>
      )}
      {totalDestinatarios === 0 && especialidade && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nenhum contato disponível para esta seleção.
            {contactsBloqueados > 0 && (
              <p className="mt-2">
                <strong>{contactsBloqueados} contatos bloqueados</strong> por terem recebido mensagem nos últimos 7 dias.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
      
      {contactsBloqueados > 0 && totalDestinatarios > 0 && (
        <Alert className="bg-yellow-500/10 border-yellow-500/20">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-600">
            <strong>{contactsBloqueados} contatos bloqueados</strong> automaticamente por terem recebido mensagem nos últimos 7 dias.
            Apenas {totalDestinatarios} contatos serão incluídos no disparo.
          </AlertDescription>
        </Alert>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="lg" className="w-full" disabled={desabilitarEnvio || enviarMutation.isPending}>
            {enviarMutation.isPending ? "Processando..." : agendarEnvio ? <><Calendar className="mr-2 h-5 w-5" />Agendar Disparo</> : <><Send className="mr-2 h-5 w-5" />Enviar Agora</>}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{agendarEnvio ? "Confirmar Agendamento" : "Confirmar Envio"}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">{agendarEnvio ? <><p>O disparo será agendado para <strong>{dataAgendamento} às {horaAgendamento}</strong></p><p>Serão enviadas mensagens para <strong>{totalDestinatarios} contatos</strong> em lotes de <strong>{tamanhoLote}</strong>.</p></> : <p>Confirma o envio imediato para <strong>{totalDestinatarios} contatos</strong> em lotes de <strong>{tamanhoLote}</strong>?</p>}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => enviarMutation.mutate()}>Confirmar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <HistoricoDisparos />
    </div>
  );
}

