# Gera as 3 variações da tela Campanhas (dados fictícios) como HTML autocontido.
import pathlib
OUT = pathlib.Path(__file__).parent

I = {  # ícones lucide (traço 2)
 'rocket': '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>',
 'msg': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
 'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
 'list': '<path d="M3 6h18M3 12h18M3 18h12"/>',
 'phone': '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
 'brief': '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
 'chart': '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
 'cog': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
 'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
 'plus': '<path d="M12 5v14M5 12h14"/>',
 'home': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
 'cal': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 'more': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
 'chev': '<path d="m9 18 6-6-6-6"/>',
 'flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
 'alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
 'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
}
def ic(n, s=16, c='currentColor'):
    return f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{I[n]}</svg>'

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
:root{--verde:#16601a;--verde-esc:#0d3b10;--verde-claro:#e8f1e8;--ambar:#b45309;--ambar-bg:#fdf3e2;--verm:#b42318;--verm-bg:#fdecea;
--tinta:#1b1f1c;--sub:#5b625d;--fio:#e4e7e3;--fundo:#f6f7f5;--papel:#ffffff}
body{font-family:Manrope,system-ui,sans-serif;color:var(--tinta);background:var(--fundo);font-size:14px;width:100%;height:100%}
.app{display:flex;min-height:900px;width:100%}
h1,h2,.sora{font-family:Sora,Manrope,sans-serif}
.num{font-variant-numeric:tabular-nums}
/* menu */
.menu{width:232px;flex:none;display:flex;flex-direction:column;padding:20px 12px;gap:4px}
.menu.claro{background:#eef0ec;border-right:1px solid var(--fio)}
.menu.verde{background:var(--verde-esc);color:#e6efe6}
.marca{font-family:Sora;font-weight:700;font-size:18px;letter-spacing:.04em;padding:4px 12px 18px;color:var(--verde)}
.menu.verde .marca{color:#fff}
.grupo{font-size:12px;font-weight:600;color:var(--sub);padding:14px 12px 6px;display:flex;justify-content:space-between}
.menu.verde .grupo{color:#9fb8a0}
.item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px;border-radius:8px;color:var(--tinta);font-weight:500;white-space:nowrap}
.menu.verde .item{color:#e6efe6}
.item.on{font-weight:700;box-shadow:inset 3px 0 0 var(--verde);background:#fff}
.menu.verde .item.on{background:rgba(255,255,255,.1);box-shadow:inset 3px 0 0 #7fd18a;color:#fff}
.item .qt{font-size:12px;font-weight:700;color:var(--ambar);background:var(--ambar-bg);border-radius:99px;padding:1px 7px}
.fechado{color:var(--sub)}
.menu .rod{margin-top:auto;padding:12px;border-top:1px solid var(--fio);font-size:13px;color:var(--sub)}
.menu.verde .rod{border-color:rgba(255,255,255,.12);color:#b8cbb9}
.rod b{display:block;color:var(--tinta);font-weight:600}
.menu.verde .rod b{color:#fff}
/* trilho */
.trilho{width:60px;flex:none;background:var(--verde-esc);display:flex;flex-direction:column;align-items:center;padding:18px 0;gap:6px;color:#cfe0cf}
.trilho .m{font-family:Sora;font-weight:700;color:#fff;font-size:16px;margin-bottom:14px}
.trilho .t{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;position:relative}
.trilho .t.on{background:rgba(255,255,255,.14);color:#fff}
.trilho .dot{position:absolute;top:7px;right:7px;width:8px;height:8px;border-radius:99px;background:#f0a020}
/* principal */
.main{flex:1;min-width:0;padding:22px 32px 28px;display:flex;flex-direction:column;gap:20px}
.topo{display:flex;align-items:center;gap:24px}
.topo h1{font-size:24px;font-weight:600}
.abas{display:flex;gap:4px}
.aba{padding:7px 12px;border-radius:8px;color:var(--sub);font-weight:600;white-space:nowrap}
.aba.on{color:var(--tinta);background:var(--papel);border:1px solid var(--fio);padding:6px 11px}
.aba .qt{color:var(--ambar);margin-left:4px}
.dir{margin-left:auto;display:flex;gap:10px;align-items:center}
.busca{display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid var(--fio);border-radius:8px;background:var(--papel);color:var(--sub);width:220px;white-space:nowrap}
.busca kbd{margin-left:auto;font-family:Manrope;font-size:11px;border:1px solid var(--fio);border-radius:4px;padding:0 5px}
.btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:8px;font-weight:700;white-space:nowrap;border:0;font-family:Manrope;font-size:14px}
.btn.pri{background:var(--verde);color:#fff}
.btn.sec{background:var(--papel);color:var(--tinta);border:1px solid #d5d9d4}
.btn.sm{height:30px;padding:0 10px;font-size:13px}
.btn.amb{background:var(--ambar);color:#fff}
.btn.ver{background:var(--verm);color:#fff}
/* espera você */
.espera h2{font-size:15px;font-weight:600;margin-bottom:10px}
.esp-lista{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.esp{background:var(--papel);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;border-left:4px solid var(--ambar)}
.esp.r{border-left-color:var(--verm)}
.esp .t{font-weight:700;font-size:15px}
.esp .d{color:var(--sub);font-size:13px}
.esp .a{margin-top:auto}
/* filtros */
.filtros{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.chip{padding:5px 11px;border-radius:99px;color:var(--sub);font-weight:600;font-size:13px;white-space:nowrap}
.chip.on{background:var(--tinta);color:#fff}
.chip i{font-style:normal;opacity:.7;margin-left:4px}
.sep{width:1px;height:20px;background:var(--fio);margin:0 6px}
/* régua do funil */
.regua{display:flex;gap:3px;width:100%}
.reg{display:flex;flex-direction:column;gap:5px;min-width:0}
.reg .b{height:6px;border-radius:3px;background:#cfd8cf}
.reg.e1 .b{background:#b9c7ba}.reg.e2 .b{background:#8fae92}.reg.e3 .b{background:#5f9465}
.reg.e4 .b{background:#2f7a37}.reg.e5 .b{background:var(--verde)}
.reg.trava .b{background:var(--ambar)}
.reg .v{font-size:12px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reg .v b{color:var(--tinta);font-weight:700;margin-right:3px}
.reg.trava .v b{color:var(--ambar)}
.regua2{display:flex;flex-direction:column;gap:8px;width:100%}
.rb{display:flex;gap:3px;height:6px}
.rb i{display:block;border-radius:3px;background:#cfd8cf}
.rb .e2{background:#a9bdaa}.rb .e3{background:#6f9c74}.rb .e4{background:#3b8043}.rb .e5{background:var(--verde)}
.rb i.trava{background:var(--ambar)}
.rl{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.rl div{display:flex;flex-direction:column;min-width:0}
.rl b{font-weight:700;font-size:14px}
.rl .et{font-size:12px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lin .rl .et{display:none}
.rl .trava b,.rl .trava .et{color:var(--ambar)}
/* cartões de campanha */
.grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.camp{background:var(--papel);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.camp .cab{display:flex;align-items:flex-start;gap:12px}
.camp h3{font-family:Sora;font-size:17px;font-weight:600}
.camp .meta{color:var(--sub);font-size:13px;margin-top:3px}
.camp .menu3{margin-left:auto;color:var(--sub)}
.camp .pe{display:flex;align-items:center;gap:16px;border-top:1px solid var(--fio);padding-top:12px;font-size:13px;color:var(--sub)}
.camp .pe b{color:var(--tinta)}
.camp .pe .am b,.am{color:var(--ambar)}
.camp .pe .vm b,.vm{color:var(--verm)}
.camp .pe .btn{margin-left:auto}
.situ{font-size:12px;font-weight:700;color:var(--verde);background:var(--verde-claro);padding:2px 8px;border-radius:99px;white-space:nowrap}
.situ.p{color:var(--verm);background:var(--verm-bg)}
.maquina{font-size:12px;color:var(--sub);margin-top:auto}
/* tabela */
.tab{background:var(--papel);border-radius:12px;overflow:hidden}
.lin{display:grid;grid-template-columns:minmax(220px,1.3fr) minmax(300px,2fr) 120px 130px 40px;align-items:center;gap:20px;padding:14px 20px;border-top:1px solid var(--fio)}
.lin.h{border-top:0;color:var(--sub);font-size:13px;font-weight:600;padding:12px 20px}
.lin .n{font-weight:700}
.lin .m{font-size:13px;color:var(--sub);margin-top:2px}
.barra{height:6px;border-radius:3px;background:#e7ebe6;overflow:hidden;margin-top:6px}
.barra i{display:block;height:100%;background:var(--verde)}
.barra i.am{background:var(--ambar)}
.aviso{display:flex;align-items:center;gap:12px;background:var(--ambar-bg);border-radius:10px;padding:12px 16px;color:#7a3a05}
.aviso b{color:#5c2b03}
.aviso .btn{margin-left:auto}
/* cockpit */
.split{display:grid;grid-template-columns:380px minmax(0,1fr);gap:24px;align-items:start}
.fila{background:var(--papel);border-radius:12px;overflow:hidden}
.fila .cab{padding:16px 18px 10px}
.fila .cab h2{font-size:16px;font-weight:600}
.fila .cab p{font-size:13px;color:var(--sub);margin-top:2px}
.fl{display:flex;align-items:center;gap:12px;padding:12px 18px;border-top:1px solid var(--fio)}
.av{width:34px;height:34px;border-radius:99px;background:#e9ece8;color:var(--sub);font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex:none}
.fl .tx{min-width:0;flex:1}
.fl .tx b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl .tx span{font-size:12px;color:var(--sub)}
.fl .h{font-size:12px;font-weight:700;color:var(--ambar);white-space:nowrap}
.cps{display:flex;flex-direction:column;gap:12px}
.cp{background:var(--papel);border-radius:12px;padding:16px 18px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:20px;align-items:center}
.cp h3{font-family:Sora;font-size:16px;font-weight:600}
.cp .meta{color:var(--sub);font-size:13px;margin-top:3px}
.cp .hoje{font-size:13px;color:var(--sub);margin-top:10px}
.cp .hoje b{color:var(--tinta)}
.selos{display:flex;gap:10px;align-items:center}
@media (max-width:1100px){
 .esp-lista{grid-template-columns:repeat(3,minmax(0,1fr))}
 .grade{grid-template-columns:1fr}
 .busca{width:36px;padding:0;justify-content:center}
 .busca .bt,.busca kbd{display:none}
 .btn.pri .bt2{display:none}
 .main{padding:20px 24px}
 .lin{grid-template-columns:minmax(180px,1.2fr) minmax(240px,2fr) 100px 40px}
 .lin .col-dono{display:none}
 .split{grid-template-columns:320px minmax(0,1fr)}
 .cp{grid-template-columns:1fr;gap:12px}
 .menu{width:208px}
}
"""

CAMPS = [
 dict(n='Ginecologia e obstetrícia', meta='IA conversa · Brasil · desde 02/09', situ='Ativa', f=[640,310,38,9,3], trava=None, hoje=(22,35), sem=0, num='(11) 90000-0000', dono='Carla Menezes'),
 dict(n='Pediatria', meta='IA conversa · Brasil · desde 18/08', situ='Ativa', f=[3851,2722,489,41,8], trava=3, hoje=(18,35), sem=21, num='(11) 90000-0001', dono='Bruno Teixeira'),
 dict(n='Anestesiologia · SMO', meta='Equipe pelo CRM · Santa Catarina · desde 10/10', situ='Ativa', f=[5319,1904,212,19,0], trava=3, hoje=(35,35), sem=7, num='(11) 90000-0002', dono='Carla Menezes'),
 dict(n='Ultrassom SC', meta='Equipe pelo CRM · Santa Catarina · desde 27/10', situ='Sem número', f=[1000,410,22,4,1], trava=None, hoje=(0,35), sem=2, num=None, dono='Elisa Moura'),
]
ETAPAS = ['Novo','Contatado','Respondeu','Atendimento','Convertido']
def fmt(n): return f'{n:,}'.replace(',', '.')
def regua(c, rot=True):
    tot = sum(c['f'])
    barra = '<div class="rb">' + ''.join(
        f'<i class="e{i+1}{" trava" if c["trava"] == i else ""}" style="flex:{max(v/tot,0.04):.3f}"></i>' for i,v in enumerate(c['f'])) + '</div>'
    if not rot: return f'<div class="regua2">{barra}</div>'
    labs = '<div class="rl">' + ''.join(
        f'<div class="{"trava" if c["trava"] == i else ""}"><b class="num">{fmt(v)}</b><span class="et">{e}</span></div>' for i,(e,v) in enumerate(zip(ETAPAS,c['f']))) + '</div>'
    return f'<div class="regua2">{barra}{labs}</div>'

def menu(kind):
    it = lambda n, on=False, qt=None: f'<div class="item{" on" if on else ""}"><span>{n}</span>{f"<span class=qt>{qt}</span>" if qt else ""}</div>'
    return f'''<nav class="menu {kind}"><div class="marca">SIGMA</div>
{it("Início")}
<div class="grupo"><span>Prospecção</span></div>
{it("Campanhas", True)}{it("Conversas", qt="7")}{it("Leads")}{it("Listas")}{it("Minhas tarefas", qt="3")}{it("Modelos de mensagem")}{it("Números de envio")}
<div class="grupo fechado"><span>Operação clínica</span><span>›</span></div>
<div class="grupo fechado"><span>Gestão</span><span>›</span></div>
<div class="grupo fechado"><span>Sistema</span><span>›</span></div>
<div class="rod"><b>Carla Menezes</b>Captação</div></nav>'''

def topo(tab_quentes=True):
    return f'''<div class="topo"><h1>Campanhas</h1>
<div class="abas"><span class="aba on">Campanhas</span><span class="aba">Quentes<span class="qt num">30</span></span><span class="aba">LinkedIn</span><span class="aba">E-mail</span><span class="aba">Painel</span></div>
<div class="dir"><div class="busca">{ic("search",15)}<span class=bt>Buscar</span><kbd>Ctrl K</kbd></div><span class="btn pri">{ic("plus",16)}Nova<span class=bt2>&#32;campanha</span></span></div></div>'''

def filtros():
    return '''<div class="filtros"><span class="chip on">Ativas<i class="num">4</i></span><span class="chip">Pausadas<i class="num">17</i></span><span class="chip">Rascunhos<i class="num">22</i></span><span class="chip">Todas<i class="num">59</i></span><span class="sep"></span><span class="chip">Só as minhas</span></div>'''

def pagina(titulo, corpo):
    return f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{titulo}</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>{corpo}</body></html>'''

# ---------- Variação A: menu claro, "espera você" em 3 cartões, campanhas em grade
espA = f'''<section class="espera"><h2>Espera você</h2><div class="esp-lista">
<div class="esp"><div class="t">30 leads quentes sem dono</div><div class="d">21 da Pediatria. O mais antigo espera há 6 dias.</div><div class="a"><span class="btn amb sm">Distribuir os 30</span></div></div>
<div class="esp r"><div class="t">Ultrassom SC está sem número de envio</div><div class="d">A campanha parou hoje às 9h. 1.000 leads esperando.</div><div class="a"><span class="btn ver sm">Escolher número</span></div></div>
<div class="esp"><div class="t">Pediatria está abaixo do ritmo</div><div class="d">18 de 35 envios até agora. Faltam 17 para a meta do dia.</div><div class="a"><span class="btn sec sm">Ver o ritmo</span></div></div>
</div></section>'''
def cardA(c):
    sit = f'<span class="situ{" p" if c["num"] is None else ""}">{c["situ"]}</span>'
    sem = f'<span class="am"><b class="num">{c["sem"]}</b> quentes sem dono</span>' if c['sem'] else '<span>Nenhum quente esperando</span>'
    num = f'<span>{c["num"]}</span>' if c['num'] else '<span class="vm"><b>Sem número de envio</b></span>'
    return f'''<article class="camp"><div class="cab"><div><h3>{c["n"]}</h3><div class="meta">{c["meta"]}</div></div><div class="selos" style="margin-left:auto">{sit}<span class="menu3">{ic("more",18)}</span></div></div>
{regua(c)}
<div class="pe"><span>Hoje <b class="num">{c["hoje"][0]} de {c["hoje"][1]}</b></span>{sem}{num}<span class="btn sec sm">Abrir</span></div></article>'''
corpoA = f'''<div class="app">{menu("claro")}<main class="main">{topo()}{espA}{filtros()}
<div class="grade">{"".join(cardA(c) for c in CAMPS)}</div>
<div class="maquina num">9.792 leads em 4 campanhas ativas · 9 números oficiais, 8 enviando · leitura às 15:40</div></main></div>'''
(OUT/'campanhas-A.html').write_text(pagina('Campanhas A', corpoA), encoding='utf-8')

# ---------- Variação B: menu verde (identidade), aviso em uma linha, campanhas em lista densa
def linB(c):
    pct = int(100*c['hoje'][0]/c['hoje'][1])
    cor = '' if pct >= 80 else ' am'
    sit = '' if c['num'] else ' <span class="situ p">Sem número</span>'
    sem = f'<b class="am num">{c["sem"]}</b>' if c['sem'] else '<span style="color:var(--sub)">0</span>'
    return f'''<div class="lin"><div><div class="n">{c["n"]}{sit}</div><div class="m">{c["meta"]}</div></div>
<div>{regua(c)}</div>
<div><div class="num"><b>{c["hoje"][0]}</b> de {c["hoje"][1]}</div><div class="barra"><i class="{cor.strip()}" style="width:{pct}%"></i></div></div>
<div class="col-dono"><div>{sem} <span style="font-size:13px;color:var(--sub)">sem dono</span></div><div class="m">{c["dono"]}</div></div>
<div style="color:var(--sub)">{ic("more",18)}</div></div>'''
corpoB = f'''<div class="app">{menu("verde")}<main class="main">{topo()}
<div class="aviso">{ic("flame",18)}<div><b>30 leads quentes sem dono</b>, o mais antigo há 6 dias · <b>Ultrassom SC</b> parou sem número de envio</div><span class="btn amb sm">Resolver agora</span></div>
{filtros()}
<div class="tab"><div class="lin h"><div>Campanha</div><div>Funil: novo · contatado · respondeu · atendimento · convertido</div><div>Envios hoje</div><div class="col-dono">Quentes e dono</div><div></div></div>
{"".join(linB(c) for c in CAMPS)}</div>
<div class="maquina num">9.792 leads em 4 campanhas ativas · 9 números oficiais, 8 enviando · leitura às 15:40</div></main></div>'''
(OUT/'campanhas-B.html').write_text(pagina('Campanhas B', corpoB), encoding='utf-8')

# ---------- Variação C: trilho de ícones, cockpit com a fila de quentes à esquerda
FILA = [('Ana Ribeiro','Pediatria · respondeu "tenho interesse"','6 dias'),('Bruno Teixeira','Pediatria · pediu o valor do plantão','5 dias'),
        ('Gabriela Nunes','Anestesiologia · quer escala fixa','4 dias'),('Diego Arantes','Pediatria · respondeu "pode me ligar"','3 dias'),
        ('Mariana Duarte','Ginecologia · pediu detalhes da escala','2 dias'),('Caio Rezende','Anestesiologia · respondeu "sim"','20 h'),
        ('Renata Lopes','Pediatria · perguntou a cidade','9 h')]
def ini(n): return ''.join(p[0] for p in n.split()[:2])
fila = ''.join(f'<div class="fl"><div class="av">{ini(n)}</div><div class="tx"><b>{n}</b><span>{d}</span></div><span class="h">{h}</span><span class="btn sec sm">Assumir</span></div>' for n,d,h in FILA)
def cpC(c):
    sit = '<span class="situ p">Sem número de envio</span>' if c['num'] is None else '<span class="situ">Ativa</span>'
    sem = f' · <span class="am"><b class="num">{c["sem"]}</b> quentes sem dono</span>' if c['sem'] else ''
    return f'''<div class="cp"><div><div class="selos"><h3>{c["n"]}</h3>{sit}</div><div class="meta">{c["meta"]}</div><div class="hoje">Hoje <b class="num">{c["hoje"][0]} de {c["hoje"][1]}</b>{sem}</div></div><div>{regua(c)}</div></div>'''
trilho = '<nav class="trilho"><div class="m">S</div>' + ''.join(f'<div class="t{" on" if k=="rocket" else ""}">{ic(k,20)}{"<span class=dot></span>" if k=="msg" else ""}</div>' for k in ['home','rocket','msg','users','list','phone','brief','chart']) + f'<div class="t" style="margin-top:auto">{ic("cog",20)}</div></nav>'
corpoC = f'''<div class="app">{trilho}<main class="main">{topo()}
<div class="split"><section class="fila"><div class="cab"><h2>Quentes esperando dono · 30</h2><p>Do mais antigo para o mais novo. Assumir abre a conversa.</p></div>{fila}
<div class="fl" style="justify-content:center;color:var(--verde);font-weight:700">Ver os 30</div></section>
<section class="cps">{filtros()}{"".join(cpC(c) for c in CAMPS)}<div class="maquina num">9.792 leads em 4 campanhas ativas · 9 números oficiais, 8 enviando · leitura às 15:40</div></section></div></main></div>'''
(OUT/'campanhas-C.html').write_text(pagina('Campanhas C', corpoC), encoding='utf-8')

# ---------- Variação A2: a A com o menu verde de hoje (escolha do Raul, 13/11)
corpoA2 = corpoA.replace(menu("claro"), menu("verde"), 1)
(OUT/'campanhas-A2.html').write_text(pagina('Campanhas A2', corpoA2), encoding='utf-8')
print('ok')
