"""Rotina lifeshub_lista: extrai médicos do Life's Hub (módulo The Connection) e devolve uma planilha limpa.

Fluxo (mapeado em 11/11/2026):
  1. Login em https://tc.lifeshub.com.br pelo navegador (Playwright). O login é feito pela tela porque o app
     cifra a senha no navegador antes de mandar para /api/auth/login; reproduzir essa cifra fora dele é frágil.
  2. Depois do login o app usa um token "BEARER ..." em toda chamada /api/*. Capturamos o token e chamamos a API
     direto, sem clicar em tela:
       POST /api/acting-es/search  {"especialidadeMedica":true,"text":"<termo>"} -> entries [{id,name}]
       POST /api/acting-es/export  {"filters":{"espMeds":[id],"crmUfs":["GO"]},...} -> .xlsx
  3. O .xlsx do Life's Hub tem as colunas Nome, CRM ("2062GO"), Especialidades, Telefone, Celular, E-Mail...
     Montamos uma planilha no formato da importação do Sigma (Nome, Telefone, UF, Email, CRM), só com quem tem
     telefone, e o Sigma importa pela edge import-leads-excel (mesma deduplicação e blacklist da importação manual).

A conta é compartilhada com a equipe e o Life's Hub derruba a sessão de quem estava logado quando outra pessoa
entra (SessionRevoked). A rotina faz o login, exporta e fecha em menos de um minuto.

Credenciais em /opt/sigma-rotinas/.env: LIFESHUB_EMAIL e LIFESHUB_SENHA (nunca no repositório).
"""
import base64
import io
import os
import re
import unicodedata

BASE = "https://tc.lifeshub.com.br"
UFS = {"AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
       "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"}


def _sem_acento(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().upper().strip()


def _login_e_token(page):
    """Entra no The Connection e devolve o token BEARER que o app passa a usar."""
    email, senha = os.environ.get("LIFESHUB_EMAIL", ""), os.environ.get("LIFESHUB_SENHA", "")
    if not email or not senha:
        raise RuntimeError("faltam LIFESHUB_EMAIL e LIFESHUB_SENHA no .env da VPS")

    page.goto(BASE + "/", wait_until="networkidle", timeout=60_000)
    campo_senha = page.locator("input[type=password]")
    try:
        # O app é SPA: "networkidle" chega antes do formulário aparecer em algumas cargas.
        campo_senha.first.wait_for(state="visible", timeout=30_000)
    except Exception:
        tela = page.inner_text("body")[:200].replace("\n", " | ")
        raise RuntimeError(f"tela de login do Life's Hub não apareceu. Tela: {tela}")
    page.locator("input[type=email], input[placeholder*='@']").first.fill(email)
    campo_senha.first.fill(senha)
    # O token vem na resposta do login ({accessToken, ...}); o app manda "BEARER <accessToken>" nas chamadas.
    with page.expect_response(lambda r: r.url.endswith("/api/auth/login"), timeout=60_000) as resp:
        page.get_by_role("button", name=re.compile("acessar plataforma", re.I)).click()
    r = resp.value
    token = (r.json() or {}).get("accessToken") if r.status in (200, 201) else None
    if not token:
        raise RuntimeError(f"login no Life's Hub recusado ({r.status}): senha mudou ou a conta foi bloqueada")
    return "BEARER " + token


def _post(ctx, token, caminho, corpo, binario=False):
    r = ctx.request.post(BASE + caminho, data=corpo, timeout=180_000,
                         headers={"Authorization": token, "Content-Type": "application/json;charset=utf-8"})
    if r.status not in (200, 201):
        raise RuntimeError(f"{caminho} respondeu {r.status}: {r.text()[:200]}")
    return r.body() if binario else r.json()


def _id_especialidade(ctx, token, especialidade):
    """Acha o id exato da especialidade (ex.: GINECOLOGIA E OBSTETRÍCIA -> 222), sem pegar subáreas."""
    alvo = _sem_acento(especialidade)
    r = _post(ctx, token, "/api/acting-es/search",
              {"especialidadeMedica": True, "text": especialidade, "nonActives": True, "compliance": False})
    opcoes = r.get("entries") or []
    for o in opcoes:
        if _sem_acento(o.get("name")) == alvo:
            return o["id"], o["name"]
    nomes = ", ".join(o.get("name", "") for o in opcoes[:8])
    raise RuntimeError(f"especialidade '{especialidade}' não encontrada no Life's Hub. Parecidas: {nomes}")


def _so_digitos(v):
    return re.sub(r"\D", "", str(v or ""))


def _planilha_sigma(xlsx_bytes, especialidade):
    """Converte o .xlsx do Life's Hub para o formato da importação do Sigma. Devolve (bytes, contagens)."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True)
    linhas = list(wb.active.iter_rows(values_only=True))
    if not linhas:
        return None, {"exportados": 0, "com_telefone": 0}
    cab = [_sem_acento(c) for c in linhas[0]]

    def col(nome):
        return cab.index(nome) if nome in cab else None

    i_nome, i_crm, i_cel, i_tel, i_mail = col("NOME"), col("CRM"), col("CELULAR"), col("TELEFONE"), col("E-MAIL")
    if i_nome is None or i_crm is None:
        raise RuntimeError(f"planilha do Life's Hub mudou de formato: colunas {linhas[0]}")

    saida = openpyxl.Workbook()
    ws = saida.active
    ws.append(["Nome", "Telefone", "UF", "Email", "CRM", "Especialidade"])
    exportados = com_tel = 0
    for ln in linhas[1:]:
        if not ln or not ln[i_nome]:
            continue
        exportados += 1
        tel = _so_digitos(ln[i_cel]) if i_cel is not None else ""
        if len(tel) < 10 and i_tel is not None:
            tel = _so_digitos(ln[i_tel])
        if len(tel) < 10:
            continue  # sem telefone não serve para disparo
        crm = str(ln[i_crm] or "").strip()
        uf = crm[-2:].upper() if crm[-2:].upper() in UFS else ""
        email = str(ln[i_mail] or "").strip() if i_mail is not None else ""
        ws.append([str(ln[i_nome]).strip(), tel, uf, email if "@" in email else "", crm, especialidade])
        com_tel += 1
    buf = io.BytesIO()
    saida.save(buf)
    return buf.getvalue(), {"exportados": exportados, "com_telefone": com_tel}


def extrair(payload):
    """payload: {especialidade: "GINECOLOGIA E OBSTETRÍCIA", ufs: ["GO"], limite?: 50}.

    Devolve {especialidade, especialidade_id, ufs, exportados, com_telefone, xlsx_b64}.
    """
    from playwright.sync_api import sync_playwright

    especialidade = str(payload.get("especialidade") or "").strip()
    ufs = sorted({str(u).strip().upper() for u in (payload.get("ufs") or []) if str(u).strip().upper() in UFS})
    if not especialidade:
        raise RuntimeError("informe a especialidade")
    if not ufs:
        raise RuntimeError("informe ao menos uma UF")
    limite = int(payload.get("limite") or 0)

    with sync_playwright() as p:
        nav = p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            ctx = nav.new_context(viewport={"width": 1440, "height": 900}, locale="pt-BR")
            page = ctx.new_page()
            token = _login_e_token(page)
            esp_id, esp_nome = _id_especialidade(ctx, token, especialidade)
            filtros = {"espMeds": [esp_id], "crmUfs": ufs}
            corpo = {"compliant": False, "professional": {}, "filters": filtros, "criteria": {},
                     "excludeCompanyDocIds": [], "excludeProfessionalDocIds": []}
            if limite > 0:
                corpo["qttRecordsToDownload"] = limite
            xlsx = _post(ctx, token, "/api/acting-es/export", corpo, binario=True)
        finally:
            nav.close()

    planilha, contagem = _planilha_sigma(xlsx, esp_nome)
    return {
        "especialidade": esp_nome,
        "especialidade_id": esp_id,
        "ufs": ufs,
        **contagem,
        "xlsx_b64": base64.b64encode(planilha).decode() if planilha and contagem["com_telefone"] else None,
    }
