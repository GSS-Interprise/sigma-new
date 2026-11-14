# Pedidos do Raul (13/11): fila de quentes recolhível, Nova campanha com modo (IA ou equipe) e alertas por WhatsApp,
# Configurações de etiquetas e etapas. Dados fictícios.
import pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gerar import ic
from gerar_telas import CSS2, menu, BUSCA, pag
OUT = pathlib.Path(__file__).parent

CSS4 = CSS2 + """
.sw{width:40px;height:22px;border-radius:99px;background:#cfd6ce;position:relative;flex:none;display:inline-block}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:99px;background:#fff}
.sw.on{background:var(--verde)}
.sw.on::after{left:21px}
.recolher{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--sub);border:1px solid var(--fio);border-radius:8px;padding:4px 10px;background:#fff;white-space:nowrap}
.faixa{display:flex;align-items:center;gap:12px;background:#fff;border-radius:12px;padding:12px 18px;border-left:4px solid var(--ambar)}
.faixa b{white-space:nowrap}
.faixa .nomes{color:var(--sub);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
/* nova campanha */
.nc{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}
.sec2{background:#fff;border-radius:12px;padding:20px 22px;display:flex;flex-direction:column;gap:14px}
.sec2 h2{font-family:Sora;font-size:16px;font-weight:600}
.sec2 .n{font-size:12px;font-weight:700;color:var(--verde)}
.campo{display:flex;flex-direction:column;gap:6px;min-width:0}
.campo label{font-size:13px;font-weight:600}
.inp{height:40px;border:1px solid var(--fio);border-radius:8px;padding:0 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;white-space:nowrap;overflow:hidden}
.g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.modos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.mo{border:1.5px solid var(--fio);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px}
.mo.on{border-color:var(--verde);background:#f5faf4}
.mo .t{display:flex;align-items:center;gap:8px;font-weight:700}
.rd{width:16px;height:16px;border-radius:99px;border:2px solid #b9c0b8;flex:none}
.mo.on .rd{border:5px solid var(--verde)}
.mo ol{margin-left:18px;color:var(--sub);font-size:13px;line-height:1.55}
.pess{display:grid;grid-template-columns:36px minmax(0,1fr) 170px 32px;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--fio)}
.pess:first-of-type{border-top:0}
.evs{display:flex;flex-direction:column;gap:10px}
.ev2{display:flex;align-items:flex-start;gap:10px}
.cb{width:18px;height:18px;border-radius:5px;border:1.5px solid #b9c0b8;flex:none;margin-top:1px}
.cb.on{background:var(--verde);border-color:var(--verde)}
.ev2 b{display:block;font-size:14px}
.ev2 span{font-size:13px;color:var(--sub)}
.res{background:#fff;border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;position:sticky;top:0}
.res .l{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:6px 0;border-top:1px solid var(--fio)}
.res .l:first-of-type{border-top:0}
.res .l span{color:var(--sub)}
/* configurações */
.cfg{display:grid;grid-template-columns:220px minmax(0,1fr);gap:20px;align-items:start}
.sub{background:#fff;border-radius:12px;padding:8px}
.sub div{padding:9px 12px;border-radius:8px;font-weight:600;color:var(--sub);white-space:nowrap}
.sub div.on{background:#eef3ee;color:var(--tinta)}
.tags{display:flex;flex-wrap:wrap;gap:8px}
.tg{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--fio);border-radius:99px;padding:5px 12px 5px 8px;font-size:13px;font-weight:600;white-space:nowrap;background:#fff}
.tg i{width:10px;height:10px;border-radius:99px;display:inline-block}
.tg span{color:var(--sub);font-weight:500}
.et{display:grid;grid-template-columns:20px 14px minmax(0,1fr) 140px 90px 40px;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--fio)}
.et:first-of-type{border-top:0}
.et .hd{color:#b9c0b8;font-weight:700;letter-spacing:-2px}
.et .c{width:14px;height:14px;border-radius:4px}
@media (max-width:1100px){
 .nc{grid-template-columns:1fr}
 .res{position:static}
 .modos{grid-template-columns:1fr}
 .cfg{grid-template-columns:1fr}
 .sub{display:flex;flex-wrap:wrap}
 .et{grid-template-columns:20px 14px minmax(0,1fr) 120px 40px}
 .et .col-ex{display:none}
 .faixa .nomes{display:none}
 .topo{flex-wrap:wrap;row-gap:10px}
}
"""
def pg(t, c): return pag(t, c).replace(CSS2, CSS4)

# ---------- 1. Quentes: botão Recolher no estado aberto + estado recolhido
q = (OUT/'t-quentes.html').read_text(encoding='utf-8')
corpo_q = q.split('<body>')[1].split('</body>')[0]
corpo_q = corpo_q.replace('A IA faz o primeiro contato sozinha.', 'O 1º disparo sai pela API oficial.')
aberto = corpo_q.replace('<div class="cab"><h2>Quentes esperando dono · 30</h2>',
    f'<div class="cab"><div class="linha"><h2>Quentes esperando dono · 30</h2><span class="recolher">Recolher {ic("chev",14)}</span></div>', 1)
(OUT/'x-quentes-aberta.html').write_text(pg('Quentes aberta', aberto), encoding='utf-8')
# recolhido: a fila vira uma faixa de uma linha e o Kanban ocupa a largura toda
ini = corpo_q.index('<div class="kq">'); fim = corpo_q.index('<div class="maquina')
kq = corpo_q[ini:fim]
sec = kq[kq.index('<section style="display:flex;flex-direction:column;gap:12px;min-width:0">'):]
sec = sec[:sec.rindex('</div>')]  # tira o fechamento do .kq
sec = sec.replace('<div class="kb">', '<div class="kb cheio">', 1)
faixa = f'<div class="faixa">{ic("flame",18,"#b45309")}<b>30 quentes esperando dono</b><span class="nomes">Ana Ribeiro há 6 dias · Bruno Teixeira há 5 dias · Gabriela Nunes há 4 dias · +27</span><span class="btn amb sm ml">Mostrar a fila</span></div>'
recolhido = corpo_q[:ini] + faixa + sec + corpo_q[fim:]
(OUT/'x-quentes-recolhida.html').write_text(pg('Quentes recolhida', recolhido), encoding='utf-8')

# ---------- 2. Nova campanha: modo (IA ou equipe) + alertas por WhatsApp
PESS = [('Carla Menezes','(11) 90000-0001','CM'),('Bruno Teixeira','(11) 90000-0002','BT')]
pess = ''.join(f'<div class="pess"><div class="av">{a}</div><b>{n}</b><span class="leve num">{t}</span><span style="color:var(--sub);text-align:center">✕</span></div>' for n,t,a in PESS)
EV = [(True,'Médico quente na hora','Assim que a IA ou a equipe marcar interesse, com o nome, a especialidade e o link da conversa.'),
      (True,'Quente sem dono há mais de 2 horas','Repete a cada 2 horas até alguém assumir.'),
      (True,'Campanha parou','Sem número de envio, número sem permissão na Meta ou ritmo do dia parado.'),
      (False,'Resumo do dia às 18h','Enviados, respostas, interessados e quem assumiu.')]
evs = ''.join(f'<div class="ev2"><span class="cb{" on" if on else ""}"></span><div><b>{t}</b><span>{d}</span></div></div>' for on,t,d in EV)
corpo = f'''<div class="app">{menu("Campanhas")}<main class="main"><div class="topo"><h1>Nova campanha</h1><div class="dir"><span class="btn sec">Cancelar</span><span class="btn pri">Criar campanha</span></div></div>
<div class="nc"><div style="display:flex;flex-direction:column;gap:16px">
<section class="sec2"><span class="n">1 · Para quem</span><h2>Quem a campanha vai abordar</h2>
<div class="g2"><div class="campo"><label>Especialidade</label><div class="inp">Pediatria {ic("chev",14)}</div></div><div class="campo"><label>Região</label><div class="inp">Santa Catarina {ic("chev",14)}</div></div></div>
<div class="campo"><label>Nome da campanha</label><div class="inp">Pediatria SC · novembro</div></div><span class="leve num">1.240 médicos com WhatsApp e fora de outra campanha.</span></section>
<section class="sec2"><span class="n">2 · Como conversa</span><h2>Quem conduz a conversa depois do 1º disparo</h2>
<div class="modos"><div class="mo"><div class="t"><span class="rd"></span>IA conversa sozinha</div><ol><li>O 1º disparo sai pela API oficial.</li><li>A IA responde, tira dúvidas e qualifica.</li><li>Quando o médico mostra interesse, vira quente e espera um dono.</li></ol></div>
<div class="mo on"><div class="t"><span class="rd"></span>Equipe conversa pelo CRM</div><ol><li>Só o 1º disparo sai pela API oficial.</li><li>Quem responde cai em Conversas e no Kanban para a equipe.</li><li>A equipe conduz até o contrato, pelo Sigma.</li></ol></div></div>
<div class="g2"><div class="campo"><label>Número de envio</label><div class="inp">Pediatria SC · (11) 90000-0003 {ic("chev",14)}</div></div><div class="campo"><label>Modelo da 1ª mensagem</label><div class="inp">Plantões de pediatria · aprovado {ic("chev",14)}</div></div></div></section>
<section class="sec2"><span class="n">3 · Alertas</span><h2>Quem recebe os alertas desta campanha no WhatsApp</h2>
<div>{pess}<div class="pess" style="grid-template-columns:minmax(0,1fr) auto"><div class="inp" style="color:var(--sub)">Nome ou número de alguém da equipe</div><span class="btn sec sm">Adicionar</span></div></div>
<label style="font-size:13px;font-weight:600">Avisar quando</label><div class="evs">{evs}</div>
<span class="leve">Os alertas saem pelo número oficial de avisos da GSS, não pelo número da campanha.</span></section></div>
<aside class="res"><h2 class="s">Resumo</h2><div class="l"><span>Médicos</span><b class="num">1.240</b></div><div class="l"><span>Conversa</span><b>Equipe pelo CRM</b></div><div class="l"><span>Ritmo</span><b class="num">35 por dia</b></div><div class="l"><span>Duração estimada</span><b class="num">36 dias úteis</b></div><div class="l"><span>Alertas</span><b>2 pessoas · 3 avisos</b></div>
<span class="btn pri" style="justify-content:center">Criar campanha</span><span class="leve" style="text-align:center">Ela começa pausada. Você revisa e liga.</span></aside></div></main></div>'''
(OUT/'x-nova-campanha.html').write_text(pg('Nova campanha', corpo), encoding='utf-8')

# ---------- 3. Configurações › Etiquetas e etapas
TL = [('#2f7a37','Plantonista fixo',412),('#3a6ea8','Aceita sobreaviso',188),('#b4436c','Indicado por médico',64),('#b45309','Pediu retorno em 2027',97),('#6b7a6d','Não ligar',23),('#7a5c2e','Residente',310)]
tl = ''.join(f'<span class="tg"><i style="background:{c}"></i>{n}<span class="num">{fmt}</span></span>' for c,n,fmt in TL)
ET = [('#cfd8cf','Novo','A IA ou o 1º disparo ainda não chegou','3.599'),('#a9bdaa','Contatado','Mensagem entregue, sem resposta','2.722'),('#b45309','Respondeu','Respondeu; espera um dono','489'),
      ('#3b8043','Em atendimento','Alguém da equipe assumiu','41'),('#16601a','Convertido','Contrato assinado','12'),('#9aa29b','Descartado','Não quer, número errado ou fora do perfil','1.208')]
et = ''.join(f'<div class="et"><span class="hd">⋮⋮</span><span class="c" style="background:{c}"></span><div style="min-width:0"><b>{n}</b><div class="leve" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{d}</div></div><span class="leve num col-ex">{q} leads</span><span class="sw on" style="justify-self:start"></span><span style="color:var(--sub)">···</span></div>' for c,n,d,q in ET)
TLC = [('#3a6ea8','GSS',0),('#b4436c','AGES',0),('#b45309','Urgente',0),('#2f7a37','Arrematada',0)]
tlc = ''.join(f'<span class="tg"><i style="background:{c}"></i>{n}</span>' for c,n,_ in TLC)
corpo = f'''<div class="app">{menu("Sistema")}<main class="main"><div class="topo"><h1>Configurações</h1><div class="abas"><span class="aba">Usuários</span><span class="aba">Números de envio</span><span class="aba">LinkedIn e Instagram</span><span class="aba on">Etiquetas e etapas</span><span class="aba">Motor de IA</span></div></div>
<div class="cfg"><nav class="sub"><div class="on">Etapas do funil</div><div>Etiquetas de leads</div><div>Etiquetas de licitações</div><div>Motivos de descarte</div><div>Alertas da equipe</div></nav>
<div style="display:flex;flex-direction:column;gap:16px">
<section class="sec2"><div class="linha"><h2>Etapas do funil de prospecção</h2><span class="btn sec sm ml">{ic("plus",14)}Nova etapa</span></div>
<span class="leve">A ordem e a cor valem para o Kanban, a régua das campanhas e o BI. Arraste para reordenar; desligar esconde a etapa sem apagar os leads.</span><div>{et}</div></section>
<section class="sec2"><div class="linha"><h2>Etiquetas de leads</h2><span class="btn sec sm ml">{ic("plus",14)}Nova etiqueta</span></div><div class="tags">{tl}</div></section>
<section class="sec2"><div class="linha"><h2>Etiquetas de licitações</h2><span class="btn sec sm ml">{ic("plus",14)}Nova etiqueta</span></div><div class="tags">{tlc}</div></section></div></div></main></div>'''
(OUT/'x-config-etiquetas.html').write_text(pg('Config etiquetas', corpo), encoding='utf-8')
print('ok')
