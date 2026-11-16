# As outras 7 telas no padrão escolhido (variação A com o menu verde). Dados fictícios.
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gerar import disparos, CSS, ic, regua, fmt, ETAPAS, pagina, CAMPS
OUT = pathlib.Path(__file__).parent

CSS2 = CSS + """
.menu.verde{position:relative}
.card{background:var(--papel);border-radius:12px}
.pad{padding:18px 20px}
h2.s{font-family:Sora;font-size:16px;font-weight:600}
.leve{color:var(--sub);font-size:13px}
.linha{display:flex;align-items:center;gap:12px}
.ml{margin-left:auto}
.sel{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid var(--fio);border-radius:8px;background:var(--papel);font-weight:600;white-space:nowrap}
/* kanban */
.kq{display:grid;grid-template-columns:340px minmax(0,1fr);gap:20px;align-items:start}
.kb{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:start}
.col{display:flex;flex-direction:column;gap:8px;min-width:0}
.colh{display:flex;flex-direction:column;gap:6px;padding:4px 2px 6px}
.colh .t{display:flex;justify-content:space-between;font-weight:700}
.colh .t span{color:var(--sub);font-weight:600}
.colh .b{height:4px;border-radius:2px}
.kc{background:var(--papel);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;min-width:0}
.kc b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kc .m{font-size:12px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kc .q{font-size:13px;color:var(--tinta);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.kc .r{display:flex;justify-content:space-between;font-size:12px;color:var(--sub)}
.kc.am{box-shadow:inset 3px 0 0 var(--ambar)}
.aguarda{display:flex;align-items:center;gap:14px;background:var(--papel);border-radius:10px;padding:10px 16px;min-width:0}
.aguarda .n{font-family:Sora;font-size:18px;font-weight:600}
.aguarda .leve{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.aguarda .lk2{margin-left:auto;font-size:13px;font-weight:700;color:var(--verde);white-space:nowrap}
.mais{font-size:13px;font-weight:700;color:var(--verde);padding:6px 2px}
/* linkedin */
.lk{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
.prog{height:8px;border-radius:4px;background:#e4e8e3;overflow:hidden}
.prog i{display:block;height:100%;background:var(--verde)}
.conv{background:#f3f5f2;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55}
.conf{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:var(--verde);background:var(--verde-claro);border-radius:99px;padding:3px 10px;font-size:13px}
.fr{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--fio)}
.fr:first-of-type{border-top:0}
/* conversas */
.cv{display:grid;grid-template-columns:320px minmax(0,1fr) 300px;height:calc(900px - 100px);background:var(--papel);border-radius:12px;overflow:hidden}
.cvl{border-right:1px solid var(--fio);display:flex;flex-direction:column;min-width:0}
.cvl .it{display:flex;gap:10px;padding:12px 16px;border-top:1px solid var(--fio);min-width:0}
.cvl .it.on{background:#f1f5f0;box-shadow:inset 3px 0 0 var(--verde)}
.cvl .it .tx{min-width:0;flex:1}
.cvl .it b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cvl .it .p{font-size:13px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cvl .it .h{font-size:12px;color:var(--sub);text-align:right;white-space:nowrap}
.cvl .it .h .am{display:block;font-weight:700}
.cvm{display:flex;flex-direction:column;min-width:0;background:#f4f2ee}
.cvm .cab{background:var(--papel);padding:12px 18px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--fio)}
.bal{max-width:70%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.45;background:var(--papel)}
.bal.eu{margin-left:auto;background:#dff0dc}
.bal .h{display:block;font-size:11px;color:var(--sub);margin-top:4px;text-align:right}
.msgs{flex:1;padding:18px;display:flex;flex-direction:column;gap:10px}
.cx{background:var(--papel);padding:12px 18px;display:flex;gap:10px;border-top:1px solid var(--fio)}
.cx .in{flex:1;height:40px;border:1px solid var(--fio);border-radius:10px;display:flex;align-items:center;padding:0 14px;color:var(--sub)}
.cvp{border-left:1px solid var(--fio);padding:18px;display:flex;flex-direction:column;gap:16px;min-width:0}
.dl{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px 10px;font-size:13px}
.dl dt{color:var(--sub)}
.dl dd{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mini{display:flex;flex-direction:column;gap:6px}
.mini .st{display:flex;gap:3px}
.mini .st i{flex:1;height:6px;border-radius:3px;background:#dfe5de}
.mini .st i.f{background:#6f9c74}
.mini .st i.a{background:var(--ambar)}
/* leads */
.segs{display:flex;gap:10px;flex-wrap:wrap}
.seg{background:var(--papel);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:2px;border:1px solid transparent}
.seg.on{border-color:var(--verde)}
.seg b{font-size:14px}
.seg span{font-size:12px;color:var(--sub)}
.tb .tr{display:grid;grid-template-columns:36px minmax(200px,1.6fr) minmax(150px,1.2fr) minmax(120px,1fr) 150px 120px;gap:14px;align-items:center;padding:11px 18px;border-top:1px solid var(--fio)}
.tb .tr.h{border-top:0;color:var(--sub);font-size:13px;font-weight:600}
.tb .tr.sel2{background:#f1f6f0}
.ck{width:16px;height:16px;border-radius:4px;border:1.5px solid #b9c0b8;background:#fff}
.ck.on{background:var(--verde);border-color:var(--verde)}
.tb .n{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tb .s{font-size:12px;color:var(--sub)}
.tag{font-size:12px;font-weight:700;border-radius:99px;padding:2px 9px;white-space:nowrap;justify-self:start}
.tag.n{background:#eef0ed;color:var(--sub)}
.tag.c{background:var(--verde-claro);color:var(--verde)}
.tag.r{background:var(--ambar-bg);color:var(--ambar)}
.barsel{display:flex;align-items:center;gap:12px;background:var(--verde-esc);color:#fff;border-radius:10px;padding:10px 16px}
.barsel .btn.sec{background:transparent;color:#fff;border-color:rgba(255,255,255,.35)}
/* home */
.hm{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
.hl .it{display:flex;align-items:center;gap:14px;padding:14px 20px;border-top:1px solid var(--fio)}
.hl .it:first-child{border-top:0}
.hl .tp{font-size:12px;font-weight:700;color:var(--sub);width:86px;flex:none}
.hl .tx{flex:1;min-width:0}
.hl .tx b{display:block}
.hl .tx span{font-size:13px;color:var(--sub)}
.dia{display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--fio)}
.dia:first-of-type{border-top:0}
.dia .d{width:44px;flex:none;text-align:center}
.dia .d b{display:block;font-family:Sora;font-size:18px}
.dia .d span{font-size:12px;color:var(--sub)}
.dia.hoje .d b{color:var(--verde)}
.ev{font-size:13px}
.ev span{color:var(--sub)}
.grp{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid var(--fio)}
.grp:first-of-type{border-top:0}
/* bi */
.bi{display:flex;flex-direction:column;gap:16px}
.frase{font-family:Sora;font-size:26px;font-weight:600;line-height:1.25;max-width:900px}
.frase em{font-style:normal;color:var(--ambar)}
.funil{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
.fe{display:flex;flex-direction:column;gap:8px}
.fe .bb{height:10px;border-radius:5px;background:#8fae92}
.fe.g .bb{background:var(--ambar)}
.fe .v{font-family:Sora;font-size:24px;font-weight:600}
.fe.g .v{color:var(--ambar)}
.fe .l{font-size:13px;color:var(--sub)}
.bi2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.mot{display:grid;grid-template-columns:minmax(0,1fr) 60px;gap:6px 12px;align-items:center;font-size:14px}
.mot .bar{grid-column:1/3;height:8px;border-radius:4px;background:#eceeea;overflow:hidden;margin-bottom:8px}
.mot .bar i{display:block;height:100%;background:#6f9c74}
.mot .bar i.top{background:var(--verde)}
.cit{font-size:14px;line-height:1.5;color:var(--tinta);padding:10px 0;border-top:1px solid var(--fio)}
.cit:first-of-type{border-top:0}
.cit span{display:block;font-size:12px;color:var(--sub);margin-top:2px}
/* vagas */
.vz{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 20px;text-align:center}
.vz .ico{width:56px;height:56px;border-radius:16px;background:var(--verde-claro);color:var(--verde);display:flex;align-items:center;justify-content:center}
.vz h2{font-family:Sora;font-size:20px;font-weight:600}
.vz p{color:var(--sub);max-width:440px}
.vg .tr{display:grid;grid-template-columns:110px minmax(200px,1.5fr) minmax(160px,1.2fr) 150px 150px;gap:14px;align-items:center;padding:12px 18px;border-top:1px solid var(--fio)}
.vg .tr.h{border-top:0;color:var(--sub);font-size:13px;font-weight:600}
.vg .ab{font-weight:700}
.vg .ab.am{color:var(--ambar)}
@media (max-width:1100px){
 .kq{grid-template-columns:1fr}
 .lk{grid-template-columns:1fr}
 .cv{grid-template-columns:280px minmax(0,1fr)}
 .cvp{display:none}
 .tb .tr{grid-template-columns:30px minmax(180px,1.6fr) minmax(130px,1.2fr) 130px 110px}
 .tb .col-ult{display:none}
 .hm{grid-template-columns:1fr}
 .bi2{grid-template-columns:1fr}
 .vg .tr{grid-template-columns:90px minmax(180px,1.5fr) minmax(140px,1.2fr) 130px}
 .vg .col-camp{display:none}
 .frase{font-size:22px}
 .sel .lg{display:none}
}
"""

def pag(t, c): return pagina(t, c).replace(CSS, CSS2)

def menu(ativo, prosp=True):
    def it(n, qt=None):
        on = ' on' if n == ativo else ''
        q = f'<span class=qt>{qt}</span>' if qt else ''
        return f'<div class="item{on}"><span>{n}</span>{q}</div>'
    pro = ''.join([it("Campanhas"), it("Conversas","7"), it("Leads"), it("Listas"), it("Minhas tarefas","3"), it("Modelos de mensagem"), it("Números de envio")])
    clin = ''.join([it("Vagas em aberto"), it("Médicos"), it("Escalas"), it("Clientes e contratos"), it("Licitações")])
    ges = ''.join([it("BI"), it("Financeiro")])
    g = lambda nome, abre, itens: f'<div class="grupo"><span>{nome}</span></div>{itens}' if abre else f'<div class="grupo fechado"><span>{nome}</span><span>›</span></div>'
    return f'''<nav class="menu verde"><div class="marca">SIGMA</div>{it("Início")}
{g("Prospecção", ativo in ("Campanhas","Conversas","Leads"), pro)}
{g("Operação clínica", ativo == "Vagas em aberto", clin)}
{g("Gestão", ativo == "BI", ges)}
{g("Sistema", False, "")}
<div class="rod"><b>Carla Menezes</b>Captação</div></nav>'''

def topo(titulo, abas=None, dir_html=''):
    a = ''
    if abas:
        a = '<div class="abas">' + ''.join(f'<span class="aba{" on" if on else ""}">{n}</span>' for n, on in abas) + '</div>'
    return f'<div class="topo"><h1>{titulo}</h1>{a}<div class="dir">{dir_html}</div></div>'

BUSCA = f'<div class="busca">{ic("search",15)}<span class=bt>Buscar</span><kbd>Ctrl K</kbd></div>'
ABAS_P = lambda on: [("Campanhas", on=="c"), ('Quentes<span class="qt num">30</span>', on=="q"), ("LinkedIn", on=="l"), ("Instagram", False), ("E-mail", False), ("Painel", False)]
MAQ = lambda s: f'<div class="maquina num">{s}</div>'
def ini(n): return ''.join(p[0] for p in n.split()[:2])

# ---------------- 1. Quentes e Kanban
FILA = [('Ana Ribeiro','Pediatria','"Tenho interesse, qual o valor?"','6 dias'),('Bruno Teixeira','Pediatria','"Pode me ligar à tarde?"','5 dias'),
        ('Gabriela Nunes','Anestesiologia','"Prefiro escala fixa."','4 dias'),('Diego Arantes','Pediatria','"Qual cidade?"','3 dias'),
        ('Mariana Duarte','Ginecologia','"Me manda os detalhes."','2 dias')]
fila = ''.join(f'<div class="fl"><div class="av">{ini(n)}</div><div class="tx"><b>{n}</b><span>{c} · {q}</span></div><span class="h">{h}</span><span class="btn sec sm">Assumir</span></div>' for n,c,q,h in FILA)
def kc(n, c, q, t, am=False, dono=None):
    d = f'<span>{dono}</span>' if dono else '<span class="am" style="font-weight:700">sem dono</span>'
    return f'<div class="kc{" am" if am else ""}"><b>{n}</b><div class="m">{c}</div><div class="q">{q}</div><div class="r">{d}<span>{t}</span></div></div>'
cols = [
 ('Contatado', 2722, '#a9bdaa', [kc('Rafael Siqueira','Pediatria · SC','Mensagem entregue, sem resposta.','hoje', False, 'IA'), kc('Priscila Moraes','Anestesiologia · PR','Mensagem lida às 10:12.','hoje', False, 'IA'), kc('Thiago Barreto','Ginecologia · SP','Mensagem entregue, sem resposta.','ontem', False, 'IA')]),
 ('Respondeu', 489, 'var(--ambar)', [kc('Ana Ribeiro','Pediatria · SC','"Tenho interesse, qual o valor?"','6 dias', True), kc('Bruno Teixeira','Pediatria · RS','"Pode me ligar à tarde?"','5 dias', True), kc('Letícia Guedes','Anestesiologia · SC','"Vou ver minha agenda."','2 dias', False, 'Carla M.')]),
 ('Em atendimento', 41, '#3b8043', [kc('Fábio Lacerda','Pediatria · SC','Proposta enviada: 4 plantões de 12 h.','hoje', False, 'Carla M.'), kc('Isabela Rocha','Ginecologia · SP','Aguardando documentos.','ontem', False, 'Bruno T.')]),
 ('Convertido', 12, 'var(--verde)', [kc('Paulo Viana','Anestesiologia · SC','Contrato assinado em 10/11.','3 dias', False, 'Elisa M.'), kc('Olívia Campos','Pediatria · PR','Primeiro plantão em 20/11.','5 dias', False, 'Carla M.')]),
]
aguarda = '<div class="aguarda"><b style="white-space:nowrap">Aguardando o 1º disparo</b><span class="n num">3.599</span><span class="leve">Saem 35 por dia pela API oficial</span><span class="lk2">Ver a lista</span></div>'
kb = '<div class="kb">'
for nome, n, cor, cards in cols:
    kb += f'<div class="col"><div class="colh"><div class="t">{nome}<span class="num">{fmt(n)}</span></div><div class="b" style="background:{cor}"></div></div>{"".join(cards)}<div class="mais">Ver mais {fmt(n-len(cards))}</div></div>'
kb += '</div>'
filt = '<div class="filtros"><span class="chip on">Todos</span><span class="chip">Minha fila<i class="num">2</i></span><span class="chip">Sem dono<i class="num">30</i></span><span class="sep"></span><span class="sel">Todas as campanhas ' + ic("chev",14) + '</span></div>'
corpo = f'''<div class="app">{menu("Campanhas")}<main class="main">{topo("Campanhas", ABAS_P("q"), BUSCA)}
<div class="kq"><section class="fila"><div class="cab"><h2>Quentes esperando dono · 30</h2><p>O mais antigo primeiro. Assumir abre a conversa.</p></div>{fila}<div class="fl" style="justify-content:center;color:var(--verde);font-weight:700">Ver os 30</div></section>
<section style="display:flex;flex-direction:column;gap:12px;min-width:0">{filt}{aguarda}{kb}</section></div>
{MAQ("9.482 leads nas campanhas ativas · cada coluna carrega 50 por vez · leitura às 15:40")}</main></div>'''
(OUT/'t-quentes.html').write_text(pag('Quentes', corpo), encoding='utf-8')

# ---------------- 2. LinkedIn
prox = [('Bruno Teixeira','Pediatria · Porto Alegre, RS','92%'),('Letícia Guedes','Anestesiologia · Joinville, SC','88%'),('Rodrigo Valente','Ginecologia · Curitiba, PR','81%'),('Camila Torres','Pediatria · Blumenau, SC','77%')]
corpo = f'''<div class="app">{menu("Campanhas")}<main class="main">{topo("Campanhas", ABAS_P("l"), BUSCA)}
<div class="card pad" style="display:flex;flex-direction:column;gap:10px"><div class="linha"><h2 class="s">Convites de hoje</h2><span class="ml num" style="font-weight:700">0 de 15</span></div><div class="prog"><i style="width:2%"></i></div><span class="leve">Faltam 15 para o ritmo seguro do dia. O LinkedIn bloqueia acima disso.</span></div>
<div class="lk"><section class="card pad" style="display:flex;flex-direction:column;gap:16px">
<div class="linha"><div class="av" style="width:44px;height:44px">AR</div><div><h2 class="s" style="font-size:20px">Ana Ribeiro</h2><div class="leve">Anestesiologia · campanha Anestesiologia · SMO · em conversa no WhatsApp</div></div><span class="conf ml">Perfil confere 85%</span></div>
<div class="leve">Confere: nome, especialidade e cidade (Chapecó, SC). Não confere: foto ausente.</div>
<div class="conv">Olá, Dra. Ana! Sou o Paulo, da GSS Saúde. Temos plantões de anestesiologia em Chapecó e gostaria de me conectar para te passar os detalhes. Faz sentido para você?</div>
<div class="linha"><span class="btn pri">Copiar convite e abrir perfil</span><span class="btn sec">Marcar como enviado</span><span class="btn sec" style="border:0;background:transparent;color:var(--sub)">Pular</span></div></section>
<section class="card pad"><h2 class="s" style="margin-bottom:6px">Próximos na fila</h2>{"".join(f'<div class="fr"><div class="av">{ini(n)}</div><div style="min-width:0;flex:1"><b>{n}</b><div class="leve">{d}</div></div><span class="leve num">{c}</span></div>' for n,d,c in prox)}
<div class="fr"><span class="leve">141 leads quentes ainda sem perfil buscado.</span><span class="btn sec sm ml">Buscar perfis</span></div></section></div>
{MAQ("A busca de perfis roda em segundo plano · leitura às 15:40")}</main></div>'''
(OUT/'t-linkedin.html').write_text(pag('LinkedIn', corpo), encoding='utf-8')

# ---------------- 3. Conversas (aberta)
lista = [('Fernanda Bastos','Olá, tudo bem? Tenho interesse na vaga.','15:27','2'),('Camila Torres','Perfeito, aguardo o contrato.','15:12','3'),('Débora Lins','Hoje não consigo, podemos falar amanhã?','14:53','2'),
         ('Beatriz Falcão','Qual o valor do plantão?','14:50','2'),('Olívia Campos','Tenho disponibilidade aos sábados.','14:50','1'),('Fábio Lacerda','Obrigado pelo contato, vou avaliar.','14:44','4'),('Eduardo Sampaio','Pode me passar mais detalhes?','14:44','1')]
li = ''.join(f'<div class="it{" on" if i==0 else ""}"><div class="av">{ini(n)}</div><div class="tx"><b>{n}</b><div class="p">{p}</div></div><div class="h">{h}<span class="am num">{q}</span></div></div>' for i,(n,p,h,q) in enumerate(lista))
corpo = f'''<div class="app">{menu("Conversas")}<main class="main" style="gap:14px">{topo("Conversas", None, '<span class="sel">Todos os números · 9 ' + ic("chev",14) + '</span>' + BUSCA)}
<div class="cv"><div class="cvl"><div style="padding:12px 16px" class="filtros"><span class="chip on">Esperam resposta<i class="num">7</i></span><span class="chip">Não lidas</span><span class="chip">Minhas</span><span class="chip">Todas</span></div>{li}</div>
<div class="cvm"><div class="cab"><div class="av">FB</div><div><b>Fernanda Bastos</b><div class="leve">Pediatria · pelo número Pediatria SC</div></div><span class="btn sec sm ml">Mover para Em atendimento</span><span class="btn pri sm">Assumir</span></div>
<div class="msgs"><div class="bal eu">Olá, Dra. Fernanda! Temos plantões de pediatria em Blumenau, 12 h, aos sábados. Posso te passar os detalhes?<span class="h">13:40 · IA</span></div>
<div class="bal">Olá, tudo bem? Tenho interesse na vaga. Qual o valor e quantos plantões por mês?<span class="h">15:27</span></div></div>
<div class="cx"><div class="in">Escreva a resposta</div><span class="btn pri">Enviar</span></div></div>
<aside class="cvp"><div class="mini"><span class="leve">Etapa</span><div class="st"><i class="f"></i><i class="f"></i><i class="a"></i><i></i><i></i></div><b class="am">Respondeu · espera dono há 2 h</b></div>
<dl class="dl"><dt>Campanha</dt><dd>Pediatria</dd><dt>Especialidade</dt><dd>Pediatria</dd><dt>Cidade</dt><dd>Blumenau, SC</dd><dt>CRM</dt><dd>SC 000000</dd><dt>Primeiro contato</dt><dd>12/11 às 13:40</dd></dl>
<div><span class="leve">Próximo passo sugerido</span><p style="margin-top:4px">Responder valor e escala; ela pediu os dois.</p></div>
<span class="btn sec">Abrir ficha do médico</span></aside></div></main></div>'''
(OUT/'t-conversas.html').write_text(pag('Conversas', corpo), encoding='utf-8')

# ---------------- 4. Leads
LD = [('Ana Ribeiro','SC 000000','Pediatria','Blumenau, SC','n','Nunca abordado','—'),('Bruno Teixeira','SC 000000','Pediatria','Joinville, SC','n','Nunca abordado','—'),
      ('Caio Rezende','SC 000000','Pediatria','Chapecó, SC','c','Em campanha','12/11'),('Diego Arantes','SC 000000','Pediatria','Itajaí, SC','n','Nunca abordado','—'),
      ('Elisa Moura','SC 000000','Pediatria','Criciúma, SC','r','Respondeu','10/11'),('Fábio Lacerda','SC 000000','Pediatria','Lages, SC','n','Nunca abordado','—'),
      ('Gabriela Nunes','SC 000000','Pediatria','Florianópolis, SC','n','Nunca abordado','—'),('Henrique Paiva','SC 000000','Pediatria','Tubarão, SC','c','Em campanha','08/11'),
      ('Isabela Rocha','SC 000000','Pediatria','Brusque, SC','n','Nunca abordado','—'),('João Pedrosa','SC 000000','Pediatria','Palhoça, SC','n','Nunca abordado','—')]
rows = ''.join(f'<div class="tr{" sel2" if i in (0,1,3) else ""}"><span class="ck{" on" if i in (0,1,3) else ""}"></span><div style="min-width:0"><div class="n">{n}</div><div class="s">CRM {crm}</div></div><div>{e}</div><div>{cid}</div><span class="tag {t}">{st}</span><div class="col-ult leve num">{u}</div></div>' for i,(n,crm,e,cid,t,st,u) in enumerate(LD))
corpo = f'''<div class="app">{menu("Leads")}<main class="main">{topo("Leads", None, BUSCA + '<span class="btn sec">Novo segmento</span>')}
<div class="segs"><div class="seg on"><b>Pediatria em SC sem contato</b><span class="num">1.240 médicos</span></div><div class="seg"><b>Anestesiologia no Sul, nunca abordados</b><span class="num">3.802 médicos</span></div><div class="seg"><b>Com WhatsApp e fora de campanha</b><span class="num">61.204 médicos</span></div><div class="seg"><b>Responderam e esfriaram</b><span class="num">212 médicos</span></div></div>
<div class="barsel"><b class="num">3 selecionados</b><span style="opacity:.8">de 1.240 no segmento</span><span class="btn sec sm ml">Selecionar os 1.240</span><span class="btn amb sm">Pôr em campanha</span></div>
<div class="card tb"><div class="tr h"><span class="ck"></span><div>Nome</div><div>Especialidade</div><div>Cidade</div><div>Situação</div><div class="col-ult">Último contato</div></div>{rows}</div>
{MAQ("825.259 médicos na base · 509.042 sem WhatsApp, precisam de enriquecimento · 668 na lista de bloqueio")}</main></div>'''
(OUT/'t-leads.html').write_text(pag('Leads', corpo), encoding='utf-8')

# ---------------- 5. Home
HOJE = [('Quente','Ana Ribeiro respondeu e espera dono há 6 dias','Pediatria · "Tenho interesse, qual o valor?"','Assumir','amb'),
        ('Tarefa','Ligar para Bruno Teixeira às 16h','Pediatria · ele pediu ligação à tarde','Concluir','sec'),
        ('Campanha','Ultrassom SC está sem número de envio','Parou hoje às 9h · 1.000 leads esperando','Escolher número','ver'),
        ('Tarefa','Enviar proposta para Fábio Lacerda','Pediatria · 4 plantões de 12 h em Lages','Concluir','sec'),
        ('Conversa','7 conversas esperam sua resposta','A mais antiga há 3 h','Abrir conversas','sec')]
hl = ''.join(f'<div class="it"><span class="tp">{tp}</span><div class="tx"><b>{t}</b><span>{d}</span></div><span class="btn {c} sm">{a}</span></div>' for tp,t,d,a,c in HOJE)
SEM = [('Seg','10',[]),('Ter','11',[]),('Qua','12',[('09:00','Reunião de captação')]),('Qui','13',[('16:00','Ligar para Bruno Teixeira'),('17:30','Revisão das campanhas')]),('Sex','14',[('10:00','Treino do assistente de IA')])]
sem = ''.join(f'<div class="dia{" hoje" if d=="13" else ""}"><div class="d"><b class="num">{d}</b><span>{w}</span></div><div style="display:flex;flex-direction:column;gap:4px;min-width:0">{"".join(f"<div class=ev><span class=num>{h}</span> {e}</div>" for h,e in evs) or "<div class=ev><span>Livre</span></div>"}</div></div>' for w,d,evs in SEM)
corpo = f'''<div class="app">{menu("Início")}<main class="main">{topo("Bom dia, Carla", None, BUSCA + '<span class="btn pri">' + ic("plus",16) + 'Nova demanda</span>')}
{disparos()}
<div class="hm"><section class="card hl"><div class="pad" style="padding-bottom:6px"><h2 class="s">Hoje para você · 5</h2></div>{hl}</section>
<div style="display:flex;flex-direction:column;gap:16px"><section class="card pad"><div class="linha" style="margin-bottom:6px"><h2 class="s">Sua semana</h2><span class="leve ml">Google Agenda</span></div>{sem}</section>
<section class="card pad"><h2 class="s" style="margin-bottom:6px">Pendências do seu setor</h2><div class="grp"><span>Editais para captar</span><b class="num">18</b></div><div class="grp"><span>Contratos para revisar</span><b class="num">3</b></div><div class="grp"><span>Documentos de médico vencendo</span><b class="num am">5</b></div></section></div></div></main></div>'''
(OUT/'t-home.html').write_text(pag('Inicio', corpo), encoding='utf-8')

# ---------------- 6. BI Raio-X
MOT = [('Agenda cheia',10,True),('Mora longe, não muda de cidade',9,False),('Estrutura ou volume do hospital',1,False),('Modelo de contratação',1,False),('Outros motivos',2,False)]
mot = ''.join(f'<span>{m}</span><b class="num" style="text-align:right">{n}</b><div class="bar"><i class="{"top" if t else ""}" style="width:{n*10}%"></i></div>' for m,n,t in MOT)
CIT = [('"No momento estou com a agenda lotada, quem sabe ano que vem."','Agenda cheia'),('"Não consigo me mudar agora, só se fosse perto de casa."','Mora longe'),('"Tenho interesse se for escala fixa, sem sobreaviso."','Modelo de contratação')]
cit = ''.join(f'<div class="cit">{c}<span>{m} · médico fictício</span></div>' for c,m in CIT)
F = [('Alcançados','5.407',False),('Responderam','517 · 10%',False),('Interessados','78 · 1%',False),('Contratados','8 · 0,1%',True)]
fun = '<div class="funil"><div class="fe"><div class="bb" style="background:#cfd8cf"></div><span class="v num">49.937</span><span class="l">Pediatras no Brasil</span></div>' + ''.join(f'<div class="fe{" g" if g else ""}"><div class="bb"></div><span class="v num">{v}</span><span class="l">{l}</span></div>' for l,v,g in F) + '</div>'
corpo = f'''<div class="app">{menu("BI")}<main class="main">{topo("BI", [("Comercial", True),("Operacional",False),("Pessoas",False),("Financeiro",False)], '<span class="sel">Pediatria · Brasil<span class=lg> · desde o início</span> ' + ic("chev",14) + '</span><span class="btn sec">Apresentar</span>')}
<div class="bi"><section class="card pad" style="display:flex;flex-direction:column;gap:20px"><span class="leve">Raio-X do mercado · Pediatria</span><p class="frase">Só <em>8 de 78</em> pediatras interessados viraram contrato. O funil trava depois do interesse, não no alcance.</p>{fun}</section>
<div class="bi2"><section class="card pad" style="display:flex;flex-direction:column;gap:12px"><h2 class="s">Por que dizem não</h2><span class="leve">23 médicos deram o motivo · 169 recusaram sem motivo</span><div class="mot">{mot}</div></section>
<section class="card pad" style="display:flex;flex-direction:column;gap:8px"><h2 class="s">O que eles disseram</h2>{cit}
<h2 class="s" style="margin-top:10px">O que destrava</h2><div class="cit">Plantão concentrado (4 de 24 h por mês) com moradia resolve "mora longe": 9 dos 23.</div><div class="cit">Escala flexível ou sobreaviso abre espaço para "agenda cheia": 10 dos 23.</div></section></div>
{MAQ("57.068 pediatras na base da GSS, com ou sem título · fonte CFM, base de jun/2026 · desde abr/2026, em 24 campanhas")}</div></main></div>'''
(OUT/'t-bi.html').write_text(pag('BI', corpo), encoding='utf-8')

# ---------------- 7. Vagas (vazio e com dado)
corpo = f'''<div class="app">{menu("Vagas em aberto")}<main class="main">{topo("Vagas em aberto", None, '<span class="btn sec" title="O relatório sai às 7h nos dias úteis">Relatório de hoje · 7h</span><span class="btn pri">' + ic("plus",16) + 'Nova vaga</span>')}
<section class="card vz"><div class="ico">{ic("brief",26)}</div><h2>Nenhuma vaga aberta</h2><p>Quando um hospital pedir médico, cadastre a vaga aqui. A captação vê na hora e a vaga mais antiga aparece primeiro.</p><span class="btn pri">{ic("plus",16)}Cadastrar vaga</span></section></main></div>'''
(OUT/'t-vagas-vazio.html').write_text(pag('Vagas vazio', corpo), encoding='utf-8')
VG = [('38 dias',True,'Pediatria · plantão 12 h','Hospital Modelo Norte · Lages, SC','Carla Menezes','Pediatria'),('31 dias',True,'Anestesiologia · sobreaviso','Hospital Vale Verde · Chapecó, SC','Bruno Teixeira','Anestesiologia · SMO'),
      ('12 dias',False,'Ginecologia · vaga fixa','Santa Casa Exemplo · Curitiba, PR','Elisa Moura','Ginecologia'),('5 dias',False,'Ultrassom · ambulatório','Clínica Horizonte · Joinville, SC','Carla Menezes','Ultrassom SC'),
      ('2 dias',False,'Pediatria · plantão 24 h','UPA Centro Modelo · Blumenau, SC','Sem responsável','—')]
vg = ''.join(f'<div class="tr"><span class="ab{" am" if a else ""} num">{d}</span><b>{v}</b><span>{o}</span><span class="{"am" if r=="Sem responsável" else ""}">{r}</span><span class="col-camp leve">{c}</span></div>' for d,a,v,o,r,c in VG)
corpo = f'''<div class="app">{menu("Vagas em aberto")}<main class="main">{topo("Vagas em aberto", None, '<span class="btn sec">Relatório de hoje</span><span class="btn pri">' + ic("plus",16) + 'Nova vaga</span>')}
<div class="aviso">{ic("alert",18)}<div><b>2 vagas abertas há mais de 30 dias</b> e 1 sem responsável</div></div>
<div class="filtros"><span class="chip on">Todas<i class="num">5</i></span><span class="chip">Plantão<i class="num">2</i></span><span class="chip">Sobreaviso<i class="num">1</i></span><span class="chip">Vaga fixa<i class="num">1</i></span><span class="chip">Ambulatório<i class="num">1</i></span></div>
<div class="card vg"><div class="tr h"><div>Aberta há</div><div>Vaga</div><div>Onde</div><div>Responsável</div><div class="col-camp">Campanha</div></div>{vg}</div></main></div>'''
(OUT/'t-vagas.html').write_text(pag('Vagas', corpo), encoding='utf-8')
print('ok')
