# Redes (decisão do Raul, 13/11, commit 74121d08): LinkedIn assistido e automático (Unipile), Configurações,
# fila do Instagram (1ª mensagem manual pela @maikonmadeira) e conversa do Instagram no painel do lead (janela de 24 h).
# Dados fictícios.
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gerar import ic
from gerar_telas import CSS2, menu, BUSCA, ini, pag
OUT = pathlib.Path(__file__).parent

I_IG = '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'
I_IN = '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>'
def svg(p, s=16, c='currentColor'): return f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{p}</svg>'

CSS3 = CSS2 + """
.modo{display:flex;align-items:center;gap:14px;background:#fff;border-radius:12px;padding:16px 20px}
.modo .ic{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#eef3ee;color:var(--verde);flex:none}
.modo .ic.ig{background:#f7eef2;color:#9b3a5e}
.modo b{display:block;font-size:15px}
.modo span.leve{display:block}
.pill{font-size:12px;font-weight:700;border-radius:99px;padding:3px 10px;white-space:nowrap}
.pill.on{background:var(--verde-claro);color:var(--verde)}
.pill.off{background:#eef0ed;color:var(--sub)}
.pill.pa{background:var(--ambar-bg);color:var(--ambar)}
.rampa{display:flex;align-items:flex-end;gap:6px;height:64px}
.rampa div{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.rampa i{display:block;width:100%;border-radius:4px 4px 0 0;background:#cfd8cf}
.rampa .at i{background:var(--verde)}
.rampa span{font-size:11px;color:var(--sub);white-space:nowrap}
.rampa .at span{color:var(--tinta);font-weight:700}
.linha2{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}
.lst .r{display:grid;grid-template-columns:36px minmax(0,1fr) 130px 120px;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--fio)}
.lst .r:first-of-type{border-top:0}
.lst .r b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lst .r .leve{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.st{font-size:12px;font-weight:700;white-space:nowrap}
.st.ok{color:var(--verde)}.st.nt{color:var(--sub)}.st.am{color:var(--ambar)}
.fila2 .leve{display:block}
.fila2 .r{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) auto;gap:16px;align-items:start;padding:16px 0;border-top:1px solid var(--fio)}
.fila2 .r:first-of-type{border-top:0}
.fila2 .acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.btn.gh{background:transparent;color:var(--sub);border:0}
.info{display:flex;align-items:center;gap:12px;border-radius:10px;padding:12px 16px;background:#f7eef2;color:#6e2a43}
.info b{color:#5a2236}
.alerta{display:flex;align-items:center;gap:12px;border-radius:12px;padding:14px 18px;background:var(--ambar-bg);color:#7a3a05}
.alerta b{color:#5c2b03}
.alerta .btn{margin-left:auto}
.conta{background:#fff;border-radius:12px;padding:18px 20px;display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:14px;align-items:center}
.conta .ic{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:#eef3ee;color:var(--verde)}
.conta .ic.ig{background:#f7eef2;color:#9b3a5e}
.sw{width:40px;height:22px;border-radius:99px;background:#cfd6ce;position:relative;flex:none}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:99px;background:#fff}
.sw.on{background:var(--verde)}
.sw.on::after{left:21px}
.motor{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--fio)}
.adm{font-size:11px;font-weight:700;color:var(--sub);border:1px solid var(--fio);border-radius:4px;padding:1px 6px}
/* painel do lead */
.ov{position:relative}
.ov .veu{position:absolute;inset:0;background:rgba(20,28,22,.32)}
.sheet{position:absolute;top:0;right:0;bottom:0;width:520px;background:#fff;display:flex;flex-direction:column;box-shadow:-12px 0 32px rgba(0,0,0,.12)}
.sheet .cab{padding:18px 22px;border-bottom:1px solid var(--fio);display:flex;flex-direction:column;gap:10px}
.sheet .corpo{flex:1;padding:16px 22px;display:flex;flex-direction:column;gap:14px;overflow:hidden;background:#fafbf9}
.igc{border:1px solid var(--fio);border-radius:12px;background:#fff;overflow:hidden}
.igc .h{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--fio);font-weight:700;font-size:14px}
.igc .h .j{margin-left:auto;font-size:12px;font-weight:700}
.igc .ms{padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.bi_{max-width:80%;padding:8px 12px;border-radius:16px;font-size:14px;line-height:1.45;background:#f1f2f0}
.bi_.eu{margin-left:auto;background:#f7eef2}
.bi_ small{display:block;font-size:11px;color:var(--sub);margin-top:2px;text-align:right}
.igc .rx{border-top:1px solid var(--fio);padding:10px 14px;display:flex;gap:8px;align-items:center}
.igc .rx .in{flex:1;min-height:40px;border:1px solid var(--fio);border-radius:10px;padding:10px 12px;color:var(--sub);font-size:14px}
.igc .rx.fech{background:#f6f7f5;color:var(--sub);font-size:13px}
.wa{border:1px solid var(--fio);border-radius:12px;background:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:14px}
@media (max-width:1100px){
 .linha2{grid-template-columns:1fr}
 .fila2 .r{grid-template-columns:minmax(0,1fr) auto}
 .fila2 .r .conv{grid-column:1/3;grid-row:2}
 .lst .r{grid-template-columns:36px minmax(0,1fr) 110px}
 .lst .r .col-q{display:none}
 .sheet{width:460px}
}
"""
def pg(t, c): return pag(t, c).replace(CSS2, CSS3)

def topo_c(on):
    abas = [("Campanhas","c"),('Quentes<span class="qt num">30</span>',"q"),("LinkedIn","l"),("Instagram","i"),("E-mail","e"),("Painel","p")]
    a = '<div class="abas">' + ''.join(f'<span class="aba{" on" if k==on else ""}">{n}</span>' for n,k in abas) + '</div>'
    return f'<div class="topo"><h1>Campanhas</h1>{a}<div class="dir">{BUSCA}</div></div>'

def conv_li(n, esp, camp):
    return f'Olá, Dr(a). {n.split()[0]}! Sou o Dr. Maikon Madeira, sócio da GSS Saúde. Temos plantões de {esp} em {camp} e gostaria de me conectar para te passar os detalhes. Faz sentido para você?'
def conv_ig(n, esp, camp):
    return f'Oi, Dr(a). {n.split()[0]}! Aqui é o Maikon Madeira, sócio da GSS Saúde. Estamos com plantões de {esp} em {camp}. Posso te passar os detalhes por aqui?'

FILA = [('Ana Ribeiro','anestesiologia','Anestesiologia · SMO','Chapecó','Em conversa no WhatsApp',92),
        ('Bruno Teixeira','pediatria','Pediatria','Blumenau','Quente',88),
        ('Letícia Guedes','ginecologia','Ginecologia','Joinville','Sem resposta no WhatsApp',85)]

def linhas(canal, n=3, feito=None):
    out = ''
    for i,(nome,esp,camp,cid,st,conf) in enumerate(FILA[:n]):
        txt = (conv_li if canal=='li' else conv_ig)(nome, esp, cid)
        out += f'''<div class="r"><div style="min-width:0"><b>{nome}</b><span class="leve">{esp.capitalize()} · {cid}</span>
<span class="leve" style="margin-top:4px">{st} · <span class="conf" style="padding:1px 8px;font-size:12px">perfil confere {conf}%</span></span></div>
<div class="conv" style="font-size:14px">{txt}</div>
<div class="acts"><span class="btn pri sm">Copiar {"convite" if canal=="li" else "mensagem"} e abrir perfil</span><span class="btn sec sm">Feito</span><span class="btn gh sm">Pular</span></div></div>'''
    return out

def contador(rot, feito, meta, extra=''):
    pct = int(100*feito/meta)
    return f'''<div class="card pad" style="display:flex;flex-direction:column;gap:10px"><div class="linha"><h2 class="s">{rot}</h2><span class="ml num" style="font-weight:700">{feito} de {meta}</span></div>
<div class="prog"><i style="width:{max(pct,2)}%"></i></div><span class="leve">{extra}</span></div>'''

# ---------- 1. LinkedIn · modo assistido
corpo = f'''<div class="app">{menu("Campanhas")}<main class="main">{topo_c("l")}
<div class="modo"><div class="ic">{svg(I_IN,20)}</div><div><b>Modo assistido</b><span class="leve">Você abre o perfil, cola o convite pela sua conta e marca Feito.</span></div><span class="pill off ml">Envio automático desligado</span><span class="btn sec sm">Ver em Configurações</span></div>
{contador("Seus convites hoje", 4, 15, "Faltam 11 para o ritmo seguro do dia. Acima disso, a conta corre risco de restrição.")}
<section class="card pad fila2"><div class="linha" style="margin-bottom:4px"><h2 class="s">Para chamar no LinkedIn · 12</h2><span class="btn sec sm ml">Buscar perfis dos leads</span></div>{linhas("li")}</section></main></div>'''
(OUT/'r-linkedin-assistido.html').write_text(pg('LinkedIn assistido', corpo), encoding='utf-8')

# ---------- 2. LinkedIn · automático (motor ligado)
RAMPA = [(1,5),(2,8),(3,11),(4,14),(5,17),(6,20)]
rampa = '<div class="rampa">' + ''.join(f'<div class="{"at" if s==3 else ""}"><i style="height:{v*2.6:.0f}px"></i><span>{v}/dia</span></div>' for s,v in RAMPA) + '</div>'
ENV = [('Rafael Siqueira','Pediatria · Blumenau','09:12','Aceitou','ok'),('Priscila Moraes','Anestesiologia · Chapecó','09:47','Respondeu','ok'),
       ('Thiago Barreto','Ginecologia · Joinville','10:31','Enviado','nt'),('Camila Torres','Pediatria · Lages','11:05','Enviado','nt'),
       ('Eduardo Sampaio','Pediatria · Itajaí','13:22','Enviado','nt'),('Juliana Aragão','Anestesiologia · Criciúma','13:58','Enviado','nt')]
env = ''.join(f'<div class="r"><div class="av">{ini(n)}</div><div style="min-width:0"><b>{n}</b><span class="leve">{d}</span></div><span class="col-q leve num">{h}</span><span class="st {c}">{s}</span></div>' for n,d,h,s,c in ENV)
PROX = [('Ana Ribeiro','Anestesiologia · Chapecó'),('Bruno Teixeira','Pediatria · Blumenau'),('Letícia Guedes','Ginecologia · Joinville'),('Rodrigo Valente','Ginecologia · Curitiba'),('Fernanda Bastos','Pediatria · Blumenau')]
prox = ''.join(f'<div class="r" style="grid-template-columns:36px minmax(0,1fr) auto"><div class="av">{ini(n)}</div><div style="min-width:0"><b>{n}</b><span class="leve">{d}</span></div><span class="btn gh sm">Pular</span></div>' for n,d in PROX)
corpo = f'''<div class="app">{menu("Campanhas")}<main class="main">{topo_c("l")}
<div class="modo"><div class="ic">{svg(I_IN,20)}</div><div><b>Envio automático · conta de Maikon Madeira</b><span class="leve">O Sigma envia os convites sozinho, em dia útil, das 8h às 18h. Próximo envio por volta de 14:40.</span></div><span class="pill on ml">Ligado</span></div>
<div class="linha2"><div style="display:flex;flex-direction:column;gap:16px">
{contador("Convites enviados hoje", 6, 11, "Limite de hoje: 11 convites (3ª semana da rampa). Aceitaram 1, responderam 1.")}
<section class="card pad lst"><h2 class="s" style="margin-bottom:4px">Enviados hoje</h2>{env}</section></div>
<div style="display:flex;flex-direction:column;gap:16px"><section class="card pad"><h2 class="s">Rampa da conta</h2><p class="leve" style="margin:4px 0 12px">Começa com 5 por dia e sobe 3 por semana, até 20.</p>{rampa}</section>
<section class="card pad lst"><h2 class="s" style="margin-bottom:4px">Próximos na fila</h2>{prox}</section></div></div></main></div>'''
(OUT/'r-linkedin-automatico.html').write_text(pg('LinkedIn automatico', corpo), encoding='utf-8')

# ---------- 3. LinkedIn · automático pausado sozinho
corpo = f'''<div class="app">{menu("Campanhas")}<main class="main">{topo_c("l")}
<div class="alerta">{ic("alert",20)}<div><b>O envio automático pausou sozinho às 11:06.</b> O LinkedIn pediu para esperar antes de enviar mais convites. Ele só volta quando um administrador religar.</div><span class="btn sec sm">Abrir Configurações</span></div>
<div class="modo"><div class="ic">{svg(I_IN,20)}</div><div><b>Enquanto isso, a fila segue no modo assistido</b><span class="leve">Quem quiser pode enviar pela própria conta e marcar Feito.</span></div><span class="pill pa ml">Automático pausado</span></div>
{contador("Convites enviados hoje", 4, 11, "4 pelo automático antes da pausa.")}
<section class="card pad fila2"><h2 class="s" style="margin-bottom:4px">Para chamar no LinkedIn · 12</h2>{linhas("li", 2)}</section></main></div>'''
(OUT/'r-linkedin-pausado.html').write_text(pg('LinkedIn pausado', corpo), encoding='utf-8')

# ---------- 4. Configurações › LinkedIn e Instagram
corpo = f'''<div class="app">{menu("Sistema")}<main class="main"><div class="topo"><h1>Configurações</h1><div class="abas"><span class="aba">Usuários</span><span class="aba">Números de envio</span><span class="aba on">LinkedIn e Instagram</span><span class="aba">Motor de IA</span></div></div>
<div style="display:flex;flex-direction:column;gap:12px;max-width:880px">
<div class="conta"><div class="ic">{svg(I_IN,22)}</div><div style="min-width:0"><b>Maikon Madeira</b><span class="leve" style="display:block">LinkedIn · conectada pela Unipile</span>
<div class="motor"><span class="sw on"></span><div><b style="font-size:14px">Envio automático · até 11 convites hoje</b><span class="leve" style="display:block">3ª semana da rampa. Sobe para 14 na próxima semana, até 20.</span></div><span class="adm ml">só administrador</span></div></div><span class="pill on">Conectada</span></div>
<div class="conta"><div class="ic">{svg(I_IN,22)}</div><div style="min-width:0"><b>Carla Menezes</b><span class="leve" style="display:block">LinkedIn · conectada pela Unipile</span>
<div class="motor"><span class="sw"></span><div><b style="font-size:14px;color:var(--ambar)">Automático pausado: limite de convites do LinkedIn</b><span class="leve" style="display:block">Pausou sozinho em 12/11 às 16:20. Só volta quando um administrador religar.</span></div><span class="adm ml">só administrador</span></div></div><span class="pill pa">Pausada</span></div>
<div class="conta"><div class="ic ig">{svg(I_IG,22)}</div><div style="min-width:0"><b>@maikonmadeira</b><span class="leve" style="display:block">Instagram · ligado pelo Zernio · respostas chegam ao Sigma a cada 3 min</span>
<div class="motor"><div><b style="font-size:14px">Sempre manual</b><span class="leve" style="display:block">A Meta não deixa a empresa escrever primeiro. Responder só vale até 24 h depois da última mensagem do médico.</span></div></div></div><span class="pill on">Conectada</span></div>
<span class="btn sec" style="align-self:flex-start">{ic("plus",16)}Conectar outra conta</span></div></main></div>'''
(OUT/'r-config-redes.html').write_text(pg('Config redes', corpo), encoding='utf-8')

# ---------- 5. Instagram · fila
corpo = f'''<div class="app">{menu("Campanhas")}<main class="main">{topo_c("i")}
<div class="info">{svg(I_IG,20)}<div><b>Envie sempre pela conta @maikonmadeira.</b> É nela que a resposta do médico chega ao Sigma. A primeira mensagem é sempre manual.</div></div>
{contador("Mensagens no Instagram hoje", 3, 20, "Faltam 17 para o ritmo do dia.")}
<section class="card pad fila2"><div class="linha" style="margin-bottom:4px"><h2 class="s">Para chamar no Instagram · 9</h2><span class="btn sec sm ml">Buscar perfis dos leads</span></div>{linhas("ig")}</section></main></div>'''
(OUT/'r-instagram-fila.html').write_text(pg('Instagram fila', corpo), encoding='utf-8')

# ---------- 6. Painel do lead com a conversa do Instagram (janela aberta) sobre o Kanban
def sheet(aberta):
    j = '<span class="j" style="color:var(--verde)">Pode responder até 14/11 às 16:40</span>' if aberta else '<span class="j" style="color:var(--sub)">Janela de 24 h fechada</span>'
    rx = ('<div class="rx"><div class="in">Responder como @maikonmadeira</div><span class="btn pri sm">Enviar</span></div>' if aberta
          else '<div class="rx fech">O Instagram só deixa responder depois que o médico escrever de novo.</div>')
    return f'''<aside class="sheet"><div class="cab"><div class="linha"><div class="av" style="width:44px;height:44px">AR</div><div><h2 class="s" style="font-size:19px">Ana Ribeiro</h2><span class="leve">Anestesiologia · Chapecó, SC · campanha Anestesiologia · SMO</span></div><span class="ml" style="color:var(--sub)">✕</span></div>
<div class="mini"><div class="st"><i class="f"></i><i class="f"></i><i class="a"></i><i></i><i></i></div><b class="am" style="font-size:13px">Respondeu no Instagram · espera dono há 3 h</b></div>
<div class="linha"><span class="btn pri sm">Assumir</span><span class="btn sec sm">Mover para Em atendimento</span></div></div>
<div class="corpo"><section class="igc"><div class="h">{svg(I_IG,16,"#9b3a5e")} Instagram · @dra.anaribeiro{j}</div>
<div class="ms"><div class="bi_ eu">Oi, Dr(a). Ana! Aqui é o Maikon Madeira, sócio da GSS Saúde. Estamos com plantões de anestesiologia em Chapecó. Posso te passar os detalhes por aqui?<small>13/11 09:20</small></div>
<div class="bi_">Oi, Maikon! Tenho interesse sim. São plantões de 12 h? Qual o valor?<small>13/11 16:40</small></div></div>{rx}</section>
<div class="wa">{ic("msg",16)}<span><b>WhatsApp</b> · 2 mensagens, a última em 12/11</span><span class="ml" style="color:var(--verde);font-weight:700">Abrir</span></div></div></aside>'''

def kanban_fundo():
    return pathlib.Path(OUT/'t-quentes.html').read_text(encoding='utf-8').split('<body>')[1].split('</body>')[0]
fundo = kanban_fundo()
for nome, ab in [('r-instagram-painel-aberta', True), ('r-instagram-painel-fechada', False)]:
    corpo = f'<div class="ov">{fundo}<div class="veu"></div>{sheet(ab)}</div>'
    (OUT/f'{nome}.html').write_text(pg(nome, corpo), encoding='utf-8')
print('ok')
