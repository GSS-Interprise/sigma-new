# BI Raio-X em modo apresentação: o Maikon mostra ao diretor do hospital escassez, esforço e valor.
# Números regionais, semanais e de preço são ILUSTRATIVOS (a tela real lê do Sigma).
import pathlib, random, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gerar import ic
OUT = pathlib.Path(__file__).parent
random.seed(7)

VERDE, VERDE_ESC, AMBAR = '#16601a', '#0d3b10', '#b45309'
CANAIS = [('WhatsApp', '#2f7a37'), ('E-mail', '#3a6ea8'), ('LinkedIn', '#b4436c')]  # validado: validate_palette.js, light, todas as checagens

def fmt(n, d=0):
    s = f'{n:,.{d}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return s

# ---------- gráfico 1: escassez (barras horizontais)
def barras_h(dados, w=560, unid=''):
    bh, gap, lw = 30, 18, 190
    mx = max(v for _, v, _ in dados)
    h = len(dados) * (bh + gap)
    s = f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img">'
    for i, (lab, v, dest) in enumerate(dados):
        y = i * (bh + gap)
        bw = (w - lw - 70) * v / mx
        cor = AMBAR if dest else '#8fae92'
        s += f'<text x="0" y="{y+bh/2+5}" class="tl">{lab}</text>'
        s += f'<rect x="{lw}" y="{y}" width="{bw:.1f}" height="{bh}" rx="4" fill="{cor}"><title>{lab}: {fmt(v,1)}{unid}</title></rect>'
        s += f'<text x="{lw+bw+10:.1f}" y="{y+bh/2+6}" class="tv{" am" if dest else ""}">{fmt(v,1)}</text>'
    return s + '</svg>'

# ---------- gráfico 2: esforço semanal (colunas empilhadas por canal)
SEM = 31
wa = [int(60 + 120 * min(1, i / 8) + random.randint(-25, 25)) for i in range(SEM)]
em = [0] * SEM
for i, v in [(6, 3100), (13, 2900), (19, 3300), (26, 3345)]: em[i] = v
li = [0] * SEM
for i in range(SEM - 2, SEM): li[i] = random.randint(28, 40)
fator = 5407 / sum(wa); wa = [int(v * fator) for v in wa]
def colunas(w=820, h=300):
    # Área empilhada do acumulado por canal: mostra esforço contínuo sem os picos de e-mail achatarem o WhatsApp.
    pl, pb, pt, pr = 56, 34, 14, 120
    iw, ih = w - pl - pr, h - pb - pt
    acc = []
    a = b = c = 0
    for i in range(SEM):
        a += wa[i]; b += em[i]; c += li[i]; acc.append((a, b, c))
    mx = 20000
    X = lambda i: pl + iw * i / (SEM - 1)
    Y = lambda v: pt + ih - ih * v / mx
    s = f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img">'
    for t in (0, 5000, 10000, 15000, 20000):
        s += f'<line x1="{pl}" x2="{pl+iw}" y1="{Y(t):.1f}" y2="{Y(t):.1f}" class="grid"/><text x="{pl-8}" y="{Y(t)+4:.1f}" class="ax" text-anchor="end">{fmt(t)}</text>'
    camadas = []
    for k in range(3):
        topo = [sum(acc[i][:k+1]) for i in range(SEM)]
        base = [sum(acc[i][:k]) for i in range(SEM)]
        camadas.append((topo, base))
    for k, ((topo, base), (nome, cor)) in enumerate(zip(camadas, CANAIS)):
        pts = ' '.join(f'{X(i):.1f},{Y(topo[i]):.1f}' for i in range(SEM)) + ' ' + ' '.join(f'{X(i):.1f},{Y(base[i]):.1f}' for i in reversed(range(SEM)))
        s += f'<polygon points="{pts}" fill="{cor}" opacity=".9"><title>{nome}: {fmt(acc[-1][k])} contatos no acumulado</title></polygon>'
        s += f'<polyline points="{" ".join(f"{X(i):.1f},{Y(topo[i]):.1f}" for i in range(SEM))}" fill="none" stroke="#fff" stroke-width="2"/>'
    # rótulos diretos à direita, no meio de cada faixa (só onde a faixa tem altura)
    ys = []
    for k, ((topo, base), (nome, cor)) in enumerate(zip(camadas, CANAIS)):
        ym = (Y(topo[-1]) + Y(base[-1])) / 2
        if ys and ym > ys[-1] - 16: ym = ys[-1] - 16
        ys.append(ym)
        s += f'<text x="{pl+iw+10}" y="{ym+4:.1f}" class="tl" style="font-size:13px">{nome} <tspan class="tv sm">{fmt(acc[-1][k])}</tspan></text>'
    for i, lab in [(0, 'abr'), (4, 'mai'), (9, 'jun'), (13, 'jul'), (17, 'ago'), (22, 'set'), (26, 'out'), (30, 'nov')]:
        s += f'<text x="{X(i):.1f}" y="{h-10}" class="ax" text-anchor="middle">{lab}</text>'
    return s + '</svg>'

# ---------- gráfico 3: funil (barras horizontais decrescentes, escala log visual não; usa largura proporcional com mínimo)
FUN = [('Médicos abordados', 5407, ''), ('Responderam', 517, '10%'), ('Demonstraram interesse', 78, '1,4%'), ('Contratados', 8, '0,15%')]
def funil(w=760):
    bh, gap, lw = 40, 14, 210
    h = len(FUN) * (bh + gap)
    s = f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img">'
    for i, (lab, v, p) in enumerate(FUN):
        y = i * (bh + gap)
        frac = max(v / FUN[0][1], 0.012)
        bw = (w - lw - 120) * frac
        dest = i == 3
        cor = AMBAR if dest else ['#2f7a37', '#5f9465', '#8fae92'][i]
        s += f'<text x="0" y="{y+bh/2+5}" class="tl">{lab}</text>'
        s += f'<rect x="{lw}" y="{y}" width="{bw:.1f}" height="{bh}" rx="4" fill="{cor}"><title>{lab}: {fmt(v)}</title></rect>'
        s += f'<text x="{lw+bw+12:.1f}" y="{y+bh/2+6}" class="tv{" am" if dest else ""}">{fmt(v)}<tspan class="tp"> {p}</tspan></text>'
    return s + '</svg>'

# ---------- gráfico 5: preço de mercado (pontos numa régua)
PRECOS = [1450, 1580, 1650, 1720, 1800, 1850, 1900, 2050, 2200, 2450, 2600]
GSS = 2100
def precos(w=820, h=190):
    pl, pr = 40, 40
    lo, hi = 1300, 2800
    X = lambda v: pl + (w - pl - pr) * (v - lo) / (hi - lo)
    y = 110
    s = f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img">'
    s += f'<line x1="{pl}" x2="{w-pr}" y1="{y}" y2="{y}" stroke="#cfd6ce" stroke-width="2"/>'
    for t in range(1400, 2801, 200):
        s += f'<line x1="{X(t):.1f}" x2="{X(t):.1f}" y1="{y-4}" y2="{y+4}" stroke="#cfd6ce"/><text x="{X(t):.1f}" y="{y+26}" class="ax" text-anchor="middle">R$ {fmt(t)}</text>'
    med = sorted(PRECOS)[len(PRECOS)//2]
    usados = []
    for p in sorted(PRECOS):
        cx = X(p); cy = y - 14
        while any(abs(cx-ux) < 17 and abs(cy-uy) < 17 for ux, uy in usados): cy -= 17
        usados.append((cx, cy))
        s += f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="7.5" fill="#8fae92" stroke="#fff" stroke-width="2"><title>Licitação pública em SC: R$ {fmt(p)} por plantão de 12 h</title></circle>'
    s += f'<line x1="{X(med):.1f}" x2="{X(med):.1f}" y1="{y-70}" y2="{y}" stroke="#5b625d" stroke-dasharray="3 3"/><text x="{X(med)-6:.1f}" y="{y-74}" class="ann" text-anchor="end">mediana R$ {fmt(med)}</text>'
    s += f'<circle cx="{X(GSS):.1f}" cy="{y-14}" r="10" fill="{VERDE}" stroke="#fff" stroke-width="2.5"><title>Proposta GSS: R$ {fmt(GSS)}</title></circle>'
    s += f'<line x1="{X(GSS):.1f}" x2="{X(GSS):.1f}" y1="{y+34}" y2="{y+44}" stroke="{VERDE}" stroke-width="2"/><text x="{X(GSS):.1f}" y="{y+62}" class="tv" text-anchor="middle">Proposta GSS: R$ {fmt(GSS)}</text>'
    return s + '</svg>'

MOT = [('Agenda cheia', 10), ('Mora longe, não muda de cidade', 9), ('Modelo de contratação', 2), ('Estrutura do hospital', 1), ('Outros', 1)]
def motivos(w=520):
    bh, gap, lw = 22, 16, 230
    h = len(MOT) * (bh + gap)
    s = f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img">'
    for i, (lab, v) in enumerate(MOT):
        y = i * (bh + gap)
        bw = (w - lw - 40) * v / 10
        s += f'<text x="0" y="{y+bh/2+5}" class="tl">{lab}</text><rect x="{lw}" y="{y}" width="{bw:.1f}" height="{bh}" rx="4" fill="{VERDE if i==0 else "#8fae92"}"><title>{lab}: {v} médicos</title></rect><text x="{lw+bw+8:.1f}" y="{y+bh/2+5}" class="tv sm">{v}</text>'
    return s + '</svg>'

legenda = ''.join(f'<span class="lg"><i style="background:{c}"></i>{n}</span>' for n, c in CANAIS)
tot_wa, tot_em, tot_li = sum(wa), sum(em), sum(li)

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
:root{--verde:#16601a;--verde-esc:#0d3b10;--ambar:#b45309;--tinta:#1b1f1c;--sub:#5b625d;--fio:#e4e7e3;--fundo:#f6f7f5}
body{font-family:Manrope,system-ui,sans-serif;color:var(--tinta);background:var(--fundo);font-size:15px}
h1,h2,.sora{font-family:Sora,Manrope,sans-serif}
.num,svg text{font-variant-numeric:tabular-nums}
.barra{height:56px;background:var(--verde-esc);color:#e6efe6;display:flex;align-items:center;gap:16px;padding:0 32px}
.barra .m{font-family:Sora;font-weight:700;color:#fff;letter-spacing:.04em}
.barra .f{margin-left:auto;display:flex;gap:10px;align-items:center}
.chipb{border:1px solid rgba(255,255,255,.25);border-radius:8px;height:34px;display:inline-flex;align-items:center;gap:8px;padding:0 12px;font-weight:600;white-space:nowrap;font-size:14px}
.chipb.pri{background:#fff;color:var(--verde-esc);border-color:#fff}
.pg{max-width:1200px;margin:0 auto;padding:40px 40px 56px;display:flex;flex-direction:column;gap:28px}
.capa{display:flex;flex-direction:column;gap:14px;padding-bottom:8px}
.capa .eb{font-size:14px;font-weight:600;color:var(--sub)}
.capa h1{font-size:36px;line-height:1.15;font-weight:600;max-width:1000px}
.herois{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:10px}
.heroi{background:#fff;border-radius:14px;padding:18px 20px}
.heroi b{display:block;font-family:Sora;font-size:34px;font-weight:600;line-height:1.1}
.heroi span{color:var(--sub);font-size:14px}
.heroi.am b{color:var(--ambar)}
.sec{background:#fff;border-radius:16px;padding:28px 32px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:32px;align-items:center}
.sec .tx{display:flex;flex-direction:column;gap:10px}
.sec .n{font-size:13px;font-weight:700;color:var(--verde)}
.sec h2{font-size:24px;font-weight:600;line-height:1.25}
.sec p{color:var(--sub);line-height:1.55}
.sec .big{font-family:Sora;font-size:28px;font-weight:600;color:var(--tinta)}
.sec .big.am{color:var(--ambar)}
.graf{min-width:0;overflow:hidden}
.graf svg{max-width:100%;height:auto;display:block}
.tl{font-size:14px;fill:#1b1f1c;font-family:Manrope}
.tv{font-size:15px;font-weight:700;fill:#1b1f1c;font-family:Manrope}
.tv.sm{font-size:13px}
.tv.am{fill:#b45309}
.tp{font-weight:500;fill:#5b625d;font-size:13px}
.ax{font-size:12px;fill:#5b625d;font-family:Manrope}
.ann{font-size:12px;fill:#5b625d;font-family:Manrope;font-style:italic}
.grid{stroke:#eceeea;stroke-width:1}
.leg{display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap}
.lg{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--sub);font-weight:600}
.lg i{width:12px;height:12px;border-radius:3px;display:inline-block}
.kp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:6px}
.kp div{border-top:3px solid var(--fio);padding-top:8px}
.kp b{display:block;font-family:Sora;font-size:20px}
.kp span{font-size:13px;color:var(--sub)}
.cit{border-left:3px solid var(--fio);padding:4px 0 4px 14px;font-size:15px;line-height:1.5}
.cit span{display:block;font-size:12px;color:var(--sub);margin-top:2px}
.prop{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.pc{background:#fff;border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;gap:8px;border-top:4px solid var(--verde)}
.pc h3{font-family:Sora;font-size:18px;font-weight:600}
.pc p{color:var(--sub);line-height:1.5}
.rod{font-size:12px;color:var(--sub);line-height:1.6}
@media (max-width:1100px){
 .pg{padding:28px 24px 40px}
 .capa h1{font-size:30px}
 .herois{grid-template-columns:repeat(2,minmax(0,1fr))}
 .sec{grid-template-columns:1fr;gap:18px;padding:24px}
 .prop{grid-template-columns:1fr}
 .barra .chipb.fl{display:none}
}
"""

corpo = f'''
<div class="barra"><span class="m">SIGMA</span><span style="opacity:.7">BI · Raio-X do mercado · modo apresentação</span>
<div class="f"><span class="chipb fl">Pediatria · região de Lages, SC · abr a nov/2026</span><span class="chipb">{ic("chart",15,"#e6efe6")}Baixar PDF</span><span class="chipb pri">Sair da apresentação</span></div></div>
<main class="pg">
<section class="capa"><span class="eb">GSS Gestão Serviço Saúde · preparado para o Hospital Modelo Norte · novembro de 2026</span>
<h1>Pediatria na região de Lages: o que fizemos para completar a sua escala, e o que o mercado mostra</h1>
<div class="herois"><div class="heroi"><b class="num">16.070</b><span>médicos abordados</span></div><div class="heroi"><b class="num">31</b><span>semanas de busca ativa</span></div><div class="heroi"><b class="num">24</b><span>campanhas em 3 canais</span></div><div class="heroi am"><b class="num">8</b><span>pediatras contratados</span></div></div></section>

<section class="sec"><div class="tx"><span class="n">1 · O mercado</span><h2>A serra catarinense tem 3 vezes menos pediatras que a média do país</h2>
<p>Num raio de 150 km do hospital há <b>312 pediatras</b> com registro ativo. Só <b>41</b> têm menos de três vínculos e podem assumir plantão novo.</p></div>
<div class="graf"><p class="leve" style="color:var(--sub);font-size:13px;margin-bottom:12px">Pediatras por 100 mil habitantes</p>{barras_h([("Brasil",23.5,False),("Santa Catarina",19.8,False),("Serra catarinense",7.2,True)], 620)}</div></section>

<section class="sec"><div class="tx"><span class="n">2 · O esforço da equipe</span><h2>Toda semana, desde abril, a equipe procurou pediatras em três canais</h2>
<p>O WhatsApp fez o contato pessoal toda semana; o e-mail alcançou a base inteira em 4 ondas; o LinkedIn entrou em novembro para os perfis mais difíceis.</p>
<div class="kp"><div><b class="num">{fmt(tot_wa)}</b><span>no WhatsApp</span></div><div><b class="num">{fmt(tot_em)}</b><span>por e-mail</span></div><div><b class="num">517</b><span>conversas atendidas</span></div></div></div>
<div class="graf"><p style="font-size:13px;color:var(--sub);margin-bottom:8px">Contatos feitos, acumulado desde abril, por canal</p><div class="leg">{legenda}</div>{colunas()}</div></section>

<section class="sec"><div class="tx"><span class="n">3 · Do contato ao contrato</span><h2>Para cada pediatra contratado, a equipe abordou <span style="color:var(--ambar)">676</span></h2>
<p>O funil não trava no alcance. Trava depois do interesse: de 78 pediatras interessados, 8 aceitaram as condições atuais.</p></div>
<div class="graf">{funil(700)}</div></section>

<section class="sec"><div class="tx"><span class="n">4 · Por que dizem não</span><h2>Agenda cheia e distância explicam 19 de 23 recusas</h2>
<div class="cit">"No momento estou com a agenda lotada, quem sabe ano que vem."<span>Agenda cheia · pediatra da região (exemplo)</span></div>
<div class="cit">"Só iria se fosse plantão concentrado, não dá para subir a serra toda semana."<span>Mora longe · pediatra de Florianópolis (exemplo)</span></div></div>
<div class="graf"><p style="font-size:13px;color:var(--sub);margin-bottom:12px">Motivos citados pelos pediatras que recusaram</p>{motivos(560)}</div></section>

<section class="sec"><div class="tx"><span class="n">5 · Quanto o mercado paga</span><h2>A proposta fica dentro da faixa paga em licitações públicas de SC</h2>
<p>11 contratações públicas de pediatria em Santa Catarina nos últimos 12 meses, plantão de 12 horas. Fonte: Portal Nacional de Contratações Públicas.</p></div>
<div class="graf"><p style="font-size:13px;color:var(--sub);margin-bottom:4px">Valor do plantão de 12 h em contratações públicas de SC (cada ponto, uma contratação)</p>{precos(700)}</div></section>

<section><h2 style="font-size:24px;font-weight:600;margin-bottom:14px">O que propomos</h2><div class="prop">
<div class="pc"><h3>Valor de mercado</h3><p>Plantão de 12 h a R$ 2.100, ajustando ao meio da faixa paga na região.</p></div>
<div class="pc"><h3>Plantão concentrado</h3><p>4 plantões de 24 h por mês, com moradia, para trazer quem mora longe.</p></div>
<div class="pc"><h3>Contrato de 12 meses</h3><p>Escala fixa e previsível, que atrai quem tem a agenda cheia.</p></div></div></section>

<p class="rod">Fontes: Conselho Federal de Medicina (base de jun/2026), Portal Nacional de Contratações Públicas, registros de prospecção do Sigma. Nesta proposta, os números da região, das semanas e dos preços são ilustrativos.</p>
</main>'''

html = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raio-X apresentacao</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>{corpo}</body></html>'''
(OUT / 't-bi-apresentacao.html').write_text(html, encoding='utf-8')
print('ok', tot_wa, tot_em, tot_li)
