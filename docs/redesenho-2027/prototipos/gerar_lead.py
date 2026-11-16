# Pedido do Raul (16/11): redesenhar o card do Kanban e o painel que abre ao clicar num lead. Dados fictícios.
# Mantém os nomes que o vídeo 3 (Do interessado ao contrato) mostra: Assumir lead, Validação x/4, abas Tasks,
# Validação, Histórico e Notas, Encaminhar para oportunidade, Confirmar envio a Contratos.
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gerar import ic, fmt, I
# ícones que o gerar.py não tinha (lucide, traço 2)
I.setdefault('clock', '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')
I.setdefault('check', '<path d="M20 6 9 17l-5-5"/>')
from gerar_telas import CSS2, menu, topo, BUSCA, ABAS_P, ini, pag
OUT = pathlib.Path(__file__).parent

CSS5 = CSS2 + """
/* card do Kanban */
.k2{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:start}
.c2{background:var(--papel);border-radius:10px;padding:12px 12px 12px 14px;display:flex;flex-direction:column;gap:6px;min-width:0;border:1px solid transparent}
.c2.ba{box-shadow:inset 3px 0 0 var(--ambar)}
.c2.bv{box-shadow:inset 3px 0 0 var(--verm)}
.c2.sel{border-color:var(--verde)}
.c2 .l1{display:flex;align-items:center;gap:8px;min-width:0}
.c2 .l1 b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}
.c2 .dono{flex:none;width:24px;height:24px;border-radius:99px;background:var(--verde-claro);color:var(--verde);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.c2 .semdono{flex:none;font-size:12px;font-weight:700;color:var(--ambar);background:var(--ambar-bg);border-radius:99px;padding:2px 8px;white-space:nowrap}
.c2 .m{font-size:12px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.c2 .q{font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.c2 .st{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--sub);min-width:0}
.c2 .st span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.c2 .st.am{color:var(--ambar);font-weight:700}
.c2 .st.vm{color:var(--verm);font-weight:700}
.c2 .val{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--sub)}
.c2 .val i{flex:1;height:4px;border-radius:2px;background:#e4e8e3}
.c2 .val i.f{background:var(--verde)}
.c2 .tg{display:flex;gap:4px;min-width:0}
.c2 .tg span{font-size:12px;background:#f0f2ef;border-radius:6px;padding:1px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%}
/* painel do lead */
.vel{position:absolute;inset:0;background:rgba(20,28,22,.38)}
.lp{position:absolute;top:0;right:0;bottom:0;width:1060px;max-width:calc(100% - 48px);background:var(--fundo);display:flex;flex-direction:column;box-shadow:-12px 0 32px rgba(0,0,0,.12)}
.lp .cab{background:var(--papel);padding:20px 24px 16px;display:flex;flex-direction:column;gap:14px;border-bottom:1px solid var(--fio)}
.lp .cl1{display:flex;align-items:flex-start;gap:14px;min-width:0}
.lp .av2{width:44px;height:44px;border-radius:99px;background:var(--verde-claro);color:var(--verde);font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
.lp .nm{min-width:0;flex:1}
.lp .nm h2{font-family:Sora;font-size:20px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp .nm p{font-size:13px;color:var(--sub);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp .acs{display:flex;align-items:center;gap:8px;flex:none}
.lp .x{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:20px}
.rg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.rg div{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--sub);min-width:0}
.rg div i{height:4px;border-radius:2px;background:#e4e8e3}
.rg div.f i{background:var(--verde)}
.rg div.a i{background:var(--ambar)}
.rg div.a{color:var(--ambar);font-weight:700}
.rg div.f{color:var(--tinta)}
.rg span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp .corpo{flex:1;min-height:0;display:grid;grid-template-columns:400px minmax(0,1fr)}
.lp .esq{padding:18px 20px;display:flex;flex-direction:column;gap:14px;border-right:1px solid var(--fio);overflow:hidden;min-width:0}
.prox{background:var(--papel);border-radius:10px;padding:12px 14px;box-shadow:inset 3px 0 0 var(--ambar)}
.prox.ok{box-shadow:inset 3px 0 0 var(--verde)}
.prox span{font-size:12px;color:var(--sub)}
.prox b{display:block;margin-top:2px}
.tabs2{display:flex;gap:2px;border-bottom:1px solid var(--fio)}
.tabs2 span{padding:8px 7px;font-weight:600;color:var(--sub);white-space:nowrap}
.tabs2 span.on{color:var(--tinta);box-shadow:inset 0 -2px 0 var(--verde)}
.tabs2 .n{font-weight:500;margin-left:4px}
.ck2{display:flex;flex-direction:column;gap:2px;background:var(--papel);border-radius:10px;padding:6px 14px}
.ck2 div{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-top:1px solid var(--fio)}
.ck2 div:first-child{border-top:0}
.ck2 .b{flex:none;width:18px;height:18px;border-radius:5px;border:1.5px solid #b9c1ba;margin-top:1px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700}
.ck2 .b.on{background:var(--verde);border-color:var(--verde)}
.ck2 .t{min-width:0}
.ck2 .t b{display:block;font-weight:600}
.ck2 .t span{font-size:12px;color:var(--sub)}
.dl2{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 12px;font-size:13px;background:var(--papel);border-radius:10px;padding:12px 14px}
.dl2 dt{color:var(--sub)}
.dl2 dd{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tgs{display:flex;gap:6px;flex-wrap:wrap}
.tgs span{font-size:12px;background:#f0f2ef;border-radius:6px;padding:2px 8px}
.tgs .add{background:none;border:1px dashed #c4cbc5;color:var(--sub)}
.lp .dir2{display:flex;flex-direction:column;min-width:0;background:#f4f2ee}
.lp .ch{background:var(--papel);padding:10px 18px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--fio);font-size:13px;color:var(--sub);min-width:0}
.lp .ch b{color:var(--tinta)}
.lp .ch .ml{white-space:nowrap}
.lp .aviso{margin:12px 18px 0;background:var(--papel);border-radius:10px;padding:10px 14px;font-size:13px;display:flex;align-items:center;gap:10px}
.lp .quem{display:block;font-size:11px;color:var(--sub);margin-top:4px;text-align:right}
.btn.dis{opacity:.55}
.dica{font-size:12px;color:var(--sub)}
@media (max-width:1100px){
 .k2{grid-template-columns:repeat(4,minmax(0,1fr))}
 .lp .corpo{grid-template-columns:360px minmax(0,1fr)}
 .tabs2 span{padding:8px 5px;font-size:13px}
 .lp .esq{padding:16px}
 .dl2{grid-template-columns:96px minmax(0,1fr)}
}
"""
def pg(t, c): return pag(t, c).replace(CSS2, CSS5)

def card(n, m, st=None, st_cls='', q=None, dono=None, borda='', val=None, tags=()):
    d = f'<span class="dono">{dono}</span>' if dono else '<span class="semdono">Sem dono</span>'
    s = f'<div class="st {st_cls}">{st}</div>' if st else ''
    qq = f'<div class="q">{q}</div>' if q else ''
    v = ''
    if val is not None:
        v = '<div class="val">' + ''.join(f'<i class="{"f" if i < val else ""}"></i>' for i in range(4)) + f'<span class="num">Validação {val}/4</span></div>'
    t = ''
    if tags:
        vis = list(tags[:2]); extra = len(tags) - 2
        t = '<div class="tg">' + ''.join(f'<span>{x}</span>' for x in vis) + (f'<span>+{extra}</span>' if extra > 0 else '') + '</div>'
    return f'<div class="c2 {borda}"><div class="l1"><b>{n}</b>{d}</div><div class="m">{m}</div>{qq}{v}{t}{s}</div>'

def stl(icone, texto): return f'{ic(icone,13)}<span>{texto}</span>'

COLS = [
 ('Contatado', 2722, '#a9bdaa', [
   card('Rafael Siqueira', 'Pediatria · Joinville, SC', stl('msg', 'IA conversa · entregue hoje 09:12'), dono='IA'),
   card('Priscila Moraes', 'Anestesiologia · Curitiba, PR', stl('alert', 'Número sem WhatsApp'), 'vm', dono='IA', borda='bv'),
   card('Thiago Barreto', 'Ginecologia e obstetrícia · Campinas, SP', stl('msg', 'IA conversa · lida às 10:12'), dono='IA'),
 ]),
 ('Respondeu', 489, 'var(--ambar)', [
   card('Ana Ribeiro', 'Pediatria · Blumenau, SC', stl('msg', '3 novas · espera há 6 dias'), 'am', q='"Tenho interesse, qual o valor do plantão?"', borda='ba'),
   card('Bruno Teixeira', 'Pediatria · Porto Alegre, RS', stl('msg', '1 nova · espera há 5 dias'), 'am', q='"Pode me ligar à tarde?"', borda='ba'),
   card('Letícia Guedes', 'Anestesiologia · Itajaí, SC', stl('clock', 'Você conduz · janela fecha em 4 h'), q='"Vou ver minha agenda e te falo."', dono='CM'),
 ]),
 ('Em atendimento', 41, '#3b8043', [
   card('Fábio Lacerda', 'Pediatria · Lages, SC', stl('msg', 'Você respondeu há 2 h'), dono='CM', val=3, tags=('Plantão fixo', 'Proposta enviada')),
   card('Isabela Rocha', 'Ginecologia e obstetrícia · São Paulo, SP', stl('clock', 'Aguarda documentos há 2 dias'), dono='BT', val=1, tags=('Documentos', 'Fim de semana', 'Noturno')),
 ]),
 ('Convertido', 12, 'var(--verde)', [
   card('Paulo Viana', 'Anestesiologia · Chapecó, SC', stl('check', 'Enviado para Contratos em 10/11'), dono='EM'),
   card('Olívia Campos', 'Pediatria · Maringá, PR', stl('check', 'Enviado para Contratos em 08/11'), dono='CM'),
 ]),
]

def kanban():
    k = '<div class="k2">'
    for nome, n, cor, cards in COLS:
        k += f'<div class="col"><div class="colh"><div class="t">{nome}<span class="num">{fmt(n)}</span></div><div class="b" style="background:{cor}"></div></div>{"".join(cards)}<div class="mais">Ver mais {fmt(n-len(cards))}</div></div>'
    return k + '</div>'

filt = '<div class="filtros"><span class="chip on">Todos</span><span class="chip">Minha fila<i class="num">2</i></span><span class="chip">Sem dono<i class="num">30</i></span><span class="sep"></span><span class="sel">Pediatria · SC ' + ic("chev",14) + '</span></div>'

def tela_kanban():
    return f'''<div class="app">{menu("Campanhas")}<main class="main">{topo("Campanhas", ABAS_P("q"), BUSCA)}
<section style="display:flex;flex-direction:column;gap:12px;min-width:0">{filt}{kanban()}</section></main></div>'''

ETP = ['Novo', 'Contatado', 'Respondeu', 'Em atendimento', 'Convertido']
def regua(atual, ambar=False, nota=''):
    out = '<div class="rg">'
    for i, e in enumerate(ETP):
        cls = 'a' if (i == atual and ambar) else ('f' if i <= atual else '')
        txt = e + (f' · {nota}' if i == atual and nota else '')
        out += f'<div class="{cls}"><i></i><span>{txt}</span></div>'
    return out + '</div>'

VAL = [('Interesse e requisitos', 'Turno, valor e cidade combinados'), ('Documentos recebidos', 'CRM, RQE e comprovantes'),
       ('Validação clínica', 'Análise clínica do perfil do médico'), ('Validação equipe (processos)', 'Processos jurídicos e compliance')]
def checklist(n):
    return '<div class="ck2">' + ''.join(f'<div><span class="b{" on" if i < n else ""}">{"✓" if i < n else ""}</span><span class="t"><b>{t}</b><span>{s}</span></span></div>' for i, (t, s) in enumerate(VAL)) + '</div>'

def bal(txt, eu=False, quem='', h=''):
    return f'<div class="bal{" eu" if eu else ""}">{txt}<span class="h">{h}{" · " + quem if quem else ""}</span></div>'

def painel(estado):
    if estado == 'quente':
        acs = '<span class="btn pri">Assumir lead</span><span class="btn sec">Marcar perdido</span>'
        rg = regua(2, True)
        prox = '<div class="prox"><span>Próximo passo</span><b>Assumir e responder o valor do plantão. Ela perguntou há 6 dias.</b></div>'
        n_val = 0
        aviso = f'<div class="aviso">{ic("msg",15)}<span>A IA está conversando com ela. <b>Assumir lead</b> pausa a IA e a conversa passa a ser sua.</span></div>'
        dono = 'Sem dono'
        msgs = (bal('Olá, Dra. Ana! Temos plantões de pediatria em Blumenau, 12 h, aos sábados. Posso te passar os detalhes?', True, 'IA', '10/11 13:40')
                + bal('Oi! Tenho interesse, qual o valor do plantão?', h='10/11 15:27')
                + bal('E é fixo ou dá para pegar só alguns sábados?', h='10/11 15:28')
                + bal('Consigo começar em dezembro.', h='10/11 15:30'))
        composer = '<div class="cx"><div class="in">Assuma o lead para responder</div><span class="btn sec dis">Enviar</span></div>'
    else:
        acs = '<span class="btn pri dis">Encaminhar para oportunidade (3/4)</span><span class="btn sec">Marcar perdido</span>'
        rg = regua(3)
        prox = '<div class="prox"><span>Falta 1 validação para encaminhar</span><b>Validação equipe (processos)</b></div>'
        n_val = 3
        aviso = ''
        dono = 'Você (Carla Menezes)'
        msgs = (bal('Olá, Dra. Ana! Temos plantões de pediatria em Blumenau, 12 h, aos sábados. Posso te passar os detalhes?', True, 'IA', '10/11 13:40')
                + bal('Oi! Tenho interesse, qual o valor do plantão?', h='10/11 15:27')
                + bal('Oi, Ana! Aqui é a Carla, da GSS. O plantão de 12 h aos sábados está em R$ 0.000. Pode ser fixo ou avulso.', True, 'Carla', '16/11 09:02')
                + bal('Ótimo, prefiro fixo. Mando os documentos hoje.', h='16/11 09:15'))
        composer = '<div class="cx"><div class="in">Escreva a resposta</div><span class="btn pri">Enviar</span></div>'
    return f'''<div class="vel"></div><aside class="lp">
<div class="cab"><div class="cl1"><div class="av2">AR</div><div class="nm"><h2>Ana Ribeiro</h2><p>Pediatria · Blumenau, SC · (47) 90000-0000 · campanha Pediatria SC</p></div>
<div class="acs">{acs}<span class="x" title="Mais ações: E-mail, Editar contato, Prontuário">{ic("more",18)}</span><span class="x">×</span></div></div>{rg}</div>
<div class="corpo"><div class="esq">{prox}
<div class="tabs2"><span class="on">Validação<span class="n num">{n_val}/4</span></span><span>Tasks<span class="n num">2</span></span><span>Histórico</span><span>Notas</span></div>
{checklist(n_val)}
<dl class="dl2"><dt>Responsável</dt><dd>{dono}</dd><dt>Estratégia</dt><dd>Valor na 1ª mensagem</dd><dt>Também em</dt><dd>Pediatria UTI Chapecó</dd><dt>Perfil (IA)</dt><dd>Prefere plantão fixo, sábados</dd></dl>
<div class="tgs"><span>Plantão fixo</span><span>Sábado</span><span class="add">+ Etiqueta</span></div></div>
<div class="dir2"><div class="ch"><b>Conversa</b><span>WhatsApp (47) 90000-0000</span><span class="ml">Janela aberta até 15:27</span></div>{aviso}
<div class="msgs">{msgs}</div>{composer}</div></div></aside>'''

def tela_painel(estado):
    base = tela_kanban().replace('<div class="app">', '<div class="app" style="position:relative">', 1)
    return base[:-len('</div>')] + painel(estado) + '</div>'

(OUT/'x-kanban-cards.html').write_text(pg('Campanhas', tela_kanban()), encoding='utf-8')
(OUT/'x-lead-quente.html').write_text(pg('Lead', tela_painel('quente')), encoding='utf-8')
(OUT/'x-lead-atendimento.html').write_text(pg('Lead', tela_painel('atendimento')), encoding='utf-8')
print('ok')
