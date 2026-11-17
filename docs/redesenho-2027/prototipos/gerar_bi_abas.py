# BI no padrão do Raio-X: Conversas com médicos (aba nova), Prospecção e Escalas.
# Padrão: uma pergunta respondida numa frase no topo, uma faixa de até 5 números, 2 ou 3 blocos, a máquina no rodapé.
# Nomes de médico, hospital e campanha são FICTÍCIOS. Os números de Conversas seguem a ordem de grandeza de
# produção (mapa em ../bi-mapa.md); os de Prospecção e Escalas são ilustrativos.
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gerar import ic
from gerar_telas import CSS2, menu, topo, pag, MAQ, ini
OUT = pathlib.Path(__file__).parent

CSS6 = """
.abas2{display:flex;gap:6px}
.abas2 span{padding:5px 12px;border-radius:999px;font-size:13px;color:var(--sub);border:1px solid var(--fio)}
.abas2 span.on{background:var(--verde-claro);color:var(--verde);border-color:transparent;font-weight:600}
.cab{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lst .r{display:grid;grid-template-columns:minmax(0,1.3fr) 44px minmax(0,1.2fr) minmax(0,1fr) 84px;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--fio);font-size:14px}
.lst .r.h{border-top:0;color:var(--sub);font-size:12px;font-weight:600;padding-top:0}
.lst .r > *{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lst .r b{font-weight:600}
.lst .esp2{text-align:right;font-weight:700}
.lst .esp2.am{color:var(--ambar)}
.br{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:4px 12px;align-items:center;font-size:14px}
.br .v{text-align:right;white-space:nowrap}
.br .v small{color:var(--sub);font-size:12px;margin-left:4px}
.br .bar{grid-column:1/3;height:8px;border-radius:4px;background:#eceeea;overflow:hidden;margin-bottom:8px}
.br .bar i{display:block;height:100%;background:#6f9c74}
.br .bar i.am{background:var(--ambar)}
.br .am{color:var(--ambar)}
.emp{display:flex;height:14px;border-radius:7px;overflow:hidden;gap:2px}
.emp i{display:block;height:100%}
.leg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--sub)}
.leg span{display:inline-flex;align-items:center;gap:6px}
.leg i{width:10px;height:10px;border-radius:3px;display:inline-block}
.leg b{color:var(--tinta)}
.bi3{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px}
.tbc .r{display:grid;grid-template-columns:minmax(0,1.6fr) 90px 110px 110px 90px;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--fio);font-size:14px}
.tbc .r.h{border-top:0;color:var(--sub);font-size:12px;font-weight:600;padding-top:0}
.tbc .r > *{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tbc .n{text-align:right}
.tbc .n small{color:var(--sub);font-size:12px;margin-left:4px}
.tbc .am{color:var(--ambar);font-weight:700}
.furo .r{display:grid;grid-template-columns:124px minmax(0,1.4fr) minmax(0,1fr) 110px 70px;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--fio);font-size:14px}
.furo .r.h{border-top:0;color:var(--sub);font-size:12px;font-weight:600;padding-top:0}
.furo .r > *{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.furo .q{font-weight:700}
.furo .q.am{color:var(--ambar)}
.av{width:28px;height:28px;border-radius:50%;background:var(--verde-claro);color:var(--verde);font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-right:8px;flex:0 0 auto}
.pz{display:flex;align-items:center;min-width:0}
@media (max-width:1100px){
 .bi3{grid-template-columns:1fr}
 .lst .r{grid-template-columns:minmax(0,1.3fr) 44px minmax(0,1.2fr) 84px}
 .lst .col-num{display:none}
 .tbc .r{grid-template-columns:minmax(0,1.6fr) 90px 110px 90px}
 .tbc .col-int{display:none}
}
"""
def pg(t, c): return pag(t, c).replace(CSS2, CSS2 + CSS6) if CSS2 in pag(t, c) else pag(t, c).replace('</style>', CSS6 + '</style>', 1)

def cab_bi(aba, filtro, botao=''):
    return topo("BI", [("Comercial", aba == "c"), ("Operacional", aba == "o"), ("Pessoas", False), ("Financeiro", False)],
                f'<span class="sel">{filtro} {ic("chev",14)}</span>{botao}')

def faixa(itens):
    # itens: (rótulo, valor, gargalo?, cor da barra: 'n' neutra)
    h = '<div class="funil">'
    for l, v, g, *n in itens:
        bb = ' style="background:#cfd8cf"' if n else ''
        h += f'<div class="fe{" g" if g else ""}"><div class="bb"{bb}></div><span class="v num">{v}</span><span class="l">{l}</span></div>'
    return h + '</div>'

def barras(linhas, fmt_v):
    mx = max(r[1] for r in linhas)
    h = '<div class="br">'
    for nome, val, extra, am in linhas:
        h += f'<span{" class=am" if am else ""}>{nome}</span><span class="v num{" am" if am else ""}">{fmt_v(val)}<small>{extra}</small></span><div class="bar"><i class="{"am" if am else ""}" style="width:{max(val / mx * 100, 2):.0f}%"></i></div>'
    return h + '</div>'

# ---------------- 1. Conversas com médicos (aba nova; substitui Insights Conversas)
ESP = [('Pediatria','SC','Pediatria Serra SC','Chakra 47 3311','3 d',True),('Anestesiologia','PR','Anestesio Sul','Chakra 47 3618','2 d',True),
       ('Clínica médica','SC','Clínico Litoral','Chakra 47 3311','19 h',False),('Ginecologia','SP','Gineco Capital','Chakra 11 4002','6 h',False),
       ('Pediatria','RS','—','Chakra 47 3618','4 h',False),('Radiologia','SC','Radio Vale','Chakra 47 3311','52 min',False),
       ('Ortopedia','MG','Orto Minas','Chakra 31 2550','31 min',False)]
lst = '<div class="lst"><div class="r h"><span>Especialidade</span><span>UF</span><span>Campanha</span><span class="col-num">Número</span><span style="text-align:right">Esperando</span></div>'
lst += ''.join(f'<div class="r"><b>{e}</b><span>{u}</span><span>{c}</span><span class="col-num leve">{n}</span><span class="esp2 num{" am" if a else ""}">{t}</span></div>' for e,u,c,n,t,a in ESP) + '</div>'
RESP = [('Clínica médica', 41, '612 conversas', False), ('Ginecologia', 36, '488', False), ('Pediatria', 31, '1.402', False),
        ('Radiologia', 27, '355', False), ('Ortopedia', 22, '290', False), ('Anestesiologia', 14, '1.106', True)]
RES = [('Interessado', 351, '#2e7d32'), ('Sem interesse', 377, '#9aa59b'), ('Secretária filtrou', 126, '#3b6fb0'), ('Objeção', 100, '#b0457a'), ('Outros', 115, '#c9cfc9')]
tot = sum(r[1] for r in RES)
emp = '<div class="emp">' + ''.join(f'<i style="width:{v/tot*100:.1f}%;background:{c}" title="{n}: {v}"></i>' for n,v,c in RES) + '</div>'
leg = '<div class="leg">' + ''.join(f'<span><i style="background:{c}"></i>{n} <b class="num">{v}</b></span>' for n,v,c in RES) + '</div>'
OBJ = [('Mora longe, não muda de cidade', 54, '"Só se fosse perto de casa, não consigo subir a serra toda semana."'),
       ('Agenda cheia', 21, '"No momento estou com a agenda lotada, quem sabe ano que vem."'),
       ('Modelo de contratação', 8, '"Tenho interesse se for escala fixa, sem sobreaviso."')]
obj = ''.join(f'<div class="cit"><b>{o}</b> · <span class="num" style="display:inline;color:var(--tinta)">{n}</span><span>{t} · médico fictício</span></div>' for o,n,t in OBJ)
corpo = f'''<div class="app">{menu("BI")}<main class="main">{cab_bi("c", 'Últimos 30 dias<span class=lg> · todas as especialidades</span>')}
<div class="bi"><section class="card pad" style="display:flex;flex-direction:column;gap:20px"><span class="leve">Conversas com médicos · WhatsApp · últimos 30 dias</span>
<p class="frase"><em>1.232 médicos</em> falaram por último e esperam resposta. Quem responde é quase sempre a IA: a equipe escreveu 551 das 2.353 respostas.</p>
{faixa([('Conversas ativas','6.220',False,'n'),('Médicos responderam','1.780 · 29%',False),('Esperando resposta','1.232',True),('Tempo de resposta','5 min',False),('Respostas da equipe','551 · 23%',False)])}</section>
<div class="bi3"><section class="card pad" style="display:flex;flex-direction:column;gap:12px"><div class="cab"><h2 class="s">Quem está esperando</h2><span class="leve">mais antigos primeiro · clique abre a conversa</span></div>{lst}<span class="leve">e mais 1.225 conversas</span></section>
<section class="card pad" style="display:flex;flex-direction:column;gap:12px"><h2 class="s">Onde o médico responde</h2><div class="abas2"><span class="on">Especialidade</span><span>UF</span><span>Campanha</span><span>Número</span></div>
<span class="leve">% das conversas em que o médico respondeu</span>{barras(RESP, lambda v: f"{v}%")}</section></div>
<section class="card pad" style="display:flex;flex-direction:column;gap:12px"><div class="cab"><h2 class="s">O que eles dizem</h2><span class="leve">leitura por IA das conversas desde 09/11</span></div>{emp}{leg}
<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:4px">{obj}</div></section>
{MAQ("Fonte: mensagens do WhatsApp no Sigma (sigzap) · 83% das conversas ligadas a um médico da base · IA x equipe: resposta sem autor no Sigma conta como IA")}</div></main></div>'''
(OUT/'x-bi-conversas.html').write_text(pg('BI Conversas', corpo), encoding='utf-8')

# ---------------- 2. Prospecção
CP = [('Anestesio Sul','Anestesiologia','1.106','3%','0',True),('Gineco Capital','Ginecologia','488','9%','1',False),('Pediatria Serra SC','Pediatria','1.402','12%','4',False),
      ('Clínico Litoral','Clínica médica','612','18%','3',False),('Radio Vale','Radiologia','355','21%','2',False),('Orto Minas','Ortopedia','290','24%','1',False)]
tbc = '<div class="tbc"><div class="r h"><span>Campanha</span><span class="n">Contatados</span><span class="n">Responderam</span><span class="n col-int">Interessados</span><span class="n">Contratos</span></div>'
tbc += ''.join(f'<div class="r"><div><b>{c}</b><div class="leve" style="font-size:12px;overflow:hidden;text-overflow:ellipsis">{e}</div></div><span class="n num">{n}</span><span class="n num{" am" if a else ""}">{r}</span><span class="n num col-int">{int(int(n.replace(".",""))*float(r[:-1])/100*0.2)}</span><span class="n num">{k}</span></div>' for c,e,n,r,k,a in CP) + '</div>'
COL = [('Elisa Moura', 5), ('Bruno Teixeira', 4), ('Carla Menezes', 2), ('Diego Prado', 0)]
col = ''.join(f'<div class="grp"><span class="pz"><span class="av">{ini(n)}</span>{n}</span><b class="num{" am" if v == 0 else ""}">{v}</b></div>' for n,v in COL)
corpo = f'''<div class="app">{menu("BI")}<main class="main">{cab_bi("c", 'Últimos 30 dias<span class=lg> · todas as campanhas</span>')}
<div class="bi"><section class="card pad" style="display:flex;flex-direction:column;gap:20px"><span class="leve">Prospecção · últimos 30 dias</span>
<p class="frase">A campanha <em>Anestesio Sul</em> perde o médico no primeiro contato: só 3% respondem, contra 14% na média.</p>
{faixa([('Campanhas ativas','24',False,'n'),('Contatados','4.210',False),('Responderam','589 · 14%',False),('Interessados','120 · 3%',False),('Contratos','11',False)])}</section>
<div class="bi3"><section class="card pad" style="display:flex;flex-direction:column;gap:12px"><div class="cab"><h2 class="s">Campanhas, da que mais perde para a que menos perde</h2></div>{tbc}<span class="leve">e mais 18 campanhas</span></section>
<section class="card pad" style="display:flex;flex-direction:column;gap:6px"><div class="cab"><h2 class="s">Contratos por pessoa</h2><span class="leve">quem levou o médico até Contratos</span></div>{col}</section></div>
{MAQ("Funil por campanha (get_bi_prospec_funil) · contrato = lead encaminhado a Contratos · tráfego pago, propostas e canais saem para a aba Canais; motivos de recusa ficam no Raio-X")}</div></main></div>'''
(OUT/'x-bi-prospeccao.html').write_text(pg('BI Prospeccao', corpo), encoding='utf-8')

# ---------------- 3. Escalas
FU = [('Hoje 19:00','Hospital Modelo Norte','UTI adulto','12 h · noturno','2',True),('Amanhã 07:00','Hospital Modelo Norte','UTI adulto','12 h · diurno','1',True),
      ('Qui 19:00','Hospital Modelo Norte','Pronto-socorro','12 h · noturno','2',False),('Sex 07:00','UPA Centro Modelo','Clínica médica','24 h','1',False),
      ('Sáb 07:00','Hospital Modelo Norte','Pediatria','24 h','1',False),('Dom 19:00','Santa Casa Exemplo','Obstetrícia','12 h · noturno','2',False)]
furo = '<div class="furo"><div class="r h"><span>Quando</span><span>Local</span><span>Setor</span><span>Turno</span><span style="text-align:right">Vagas</span></div>'
furo += ''.join(f'<div class="r"><span class="num{" am" if a else ""}" style="font-weight:600">{q}</span><b>{l}</b><span>{s}</span><span class="leve">{t}</span><span class="q num{" am" if a else ""}" style="text-align:right">{v}</span></div>' for q,l,s,t,v,a in FU) + '</div>'
HL = [('Hospital Modelo Norte', 72, '6 plantões', True), ('Santa Casa Exemplo', 24, '2', False), ('UPA Centro Modelo', 12, '1', False)]
corpo = f'''<div class="app">{menu("BI")}<main class="main">{cab_bi("o", 'Próximos 7 dias<span class=lg> · todos os locais</span>')}
<div class="bi"><section class="card pad" style="display:flex;flex-direction:column;gap:20px"><span class="leve">Escalas · próximos 7 dias · Dr. Escala</span>
<p class="frase"><em>9 plantões</em> estão sem médico até domingo, 6 deles no Hospital Modelo Norte. O primeiro é hoje às 19h, na UTI adulto.</p>
{faixa([('Profissionais ativos','212',False,'n'),('Plantões no período','486',False),('Cobertos','477 · 98%',False),('Sem médico','9',True),('Horas descobertas','108 h',False)])}</section>
<div class="bi3"><section class="card pad" style="display:flex;flex-direction:column;gap:12px"><div class="cab"><h2 class="s">Plantões sem médico</h2><span class="leve">do mais próximo ao mais distante</span></div>{furo}</section>
<section class="card pad" style="display:flex;flex-direction:column;gap:12px"><div class="cab"><h2 class="s">Horas descobertas por local</h2></div>{barras(HL, lambda v: f"{v} h")}
<h2 class="s" style="margin-top:8px">Quem carrega mais plantões no mês</h2>
<div class="grp"><span class="pz"><span class="av">RA</span>Dr. Rafael Exemplo</span><b class="num am">22</b></div><div class="grp"><span class="pz"><span class="av">LM</span>Dra. Lívia Modelo</span><b class="num">17</b></div><div class="grp"><span class="pz"><span class="av">TS</span>Dr. Tiago Simulado</span><b class="num">15</b></div></section></div>
{MAQ("Fonte: Dr. Escala (drescala_plantoes, campo furo) · histórico de cobertura em escalas_integradas · distribuição por dia da semana e horário fica no detalhe")}</div></main></div>'''
(OUT/'x-bi-escalas.html').write_text(pg('BI Escalas', corpo), encoding='utf-8')
print('ok bi abas')
