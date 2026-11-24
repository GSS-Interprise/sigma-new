# Login automatico do Vue PACS na estacao do SLA (23/11/2026). Chamado pelo vigia.ps1 (1 min), na sessao do usuario.
# Usa a senha que a GSS guardou com guardar-senha.ps1 (DPAPI do Windows; so este usuario neste PC abre). A senha
# nunca e gravada nem impressa: vai do DPAPI direto para o campo do Vue.
# Por que Python e nao PowerShell: o cliente UIA do .NET (System.Windows.Automation) enxerga a janela do Vue mas nao
# os campos de dentro; o pywinauto (UIA COM) enxerga (teste de 23/11 no PC do CEPON).
# Tela de login (medida em 23/11): WND_LoginDialog dentro da janela "Vue PACS Client", com txtUsername, txtPassword e
# btnLogin. O Vue tem protetor de tela proprio (WND_ScreenSaver) que derruba a sessao parada.
# Saida (uma linha): sem_tela_login | sem_senha_guardada | entrou | entrou:pasta_X | entrou:sem_pasta_X | falhou:<motivo>
# Uso: pythonw vue_login.py [Pasta]
import json, subprocess, sys, time
from pathlib import Path

BASE = Path(r"C:\ProgramData\ssh-tunel")
pasta = sys.argv[1] if len(sys.argv) > 1 else ""


def sai(msg):
    print(msg)
    sys.exit(0)


def senha_guardada():
    arq = BASE / "cred-vue.json"
    if not arq.exists():
        return None, None
    cred = json.loads(arq.read_text(encoding="utf-8-sig"))
    # O DPAPI de ConvertFrom-SecureString so o PowerShell abre direto; a senha volta pelo stdout do processo filho.
    cmd = ("$c = Get-Content '%s' -Raw | ConvertFrom-Json; $s = ConvertTo-SecureString $c.senha; "
           "[Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))") % arq
    r = subprocess.run(["powershell.exe", "-NoProfile", "-Command", cmd], capture_output=True, text=True,
                       creationflags=0x08000000, timeout=30)
    return cred.get("usuario") or "", r.stdout.rstrip("\r\n")


def filho(pai, auto_id):
    for c in pai.descendants():
        if c.element_info.automation_id == auto_id:
            return c
    return None


def main():
    from pywinauto import Desktop
    dlg = None
    # descendants() e o que achou a tela no teste de 23/11; child_window() em wrapper nao achava.
    for w in Desktop(backend="uia").windows():
        if "Vue" not in (w.window_text() or ""):
            continue
        for c in w.descendants(control_type="Window"):
            if c.element_info.automation_id == "WND_LoginDialog":
                dlg = c
                break
        if dlg is not None:
            break
    if dlg is None:
        sai("sem_tela_login")
    usuario, senha = senha_guardada()
    if not senha:
        sai("sem_senha_guardada")
    try:
        campo_user = filho(dlg, "txtUsername")
        # Na tela de bloqueio (protetor de tela do Vue) o usuario vem preenchido e o campo desabilitado:
        # escrever nele dava ElementNotEnabled e o login nunca acontecia (CEPON, 24/11). So a senha e pedida.
        if usuario and campo_user is not None and campo_user.is_enabled():
            campo_user.set_edit_text(usuario)
        campo = filho(dlg, "txtPassword")
        botao = filho(dlg, "btnLogin")
        if campo is None or botao is None:
            sai("falhou:campos_nao_achados")
        try:
            campo.set_edit_text(senha)
        except Exception:
            campo.set_focus()
            campo.type_keys(senha, with_spaces=True, pause=0.02)
        senha = None
        botao.invoke()
    except Exception as e:
        sai("falhou:" + type(e).__name__)
    for _ in range(20):  # ate 40 s para a tela de login sumir
        time.sleep(2)
        try:
            if not dlg.is_visible():
                break
        except Exception:
            break
    else:
        sai("falhou:continua_na_tela_login")
    if not pasta:
        sai("entrou")
    # Depois do login o Vue do CEPON abre o visualizador e um aviso modal "Pasta nao existe: Lista de arquivos\srv"
    # (janela "Cliente Vue PACS", botao OK); enquanto ele esta na tela a arvore de pastas nao aparece (24/11).
    for _ in range(15):  # ate ~45 s para a arvore de pastas carregar
        time.sleep(3)
        for w in Desktop(backend="uia").windows():
            if w.window_text() == "Cliente Vue PACS":
                try:
                    if any("Pasta n" in (t.window_text() or "") for t in w.descendants(control_type="Text")):
                        for b in w.descendants(control_type="Button"):
                            if b.window_text() == "OK":
                                b.invoke()
                except Exception:
                    pass
        for w in Desktop(backend="uia").windows():
            if "Vue" not in (w.window_text() or ""):
                continue
            for item in w.descendants(control_type="TreeItem"):
                if (item.window_text() or "").strip().lower() == pasta.lower():
                    # select() so marca o item; a lista so abre com clique (24/11). E logo apos o login automatico,
                    # quando ninguem esta usando o Vue.
                    try:
                        item.click_input()
                    except Exception:
                        try:
                            item.select()
                        except Exception:
                            pass
                    sai("entrou:pasta_" + pasta)
    sai("entrou:sem_pasta_" + pasta)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        print("falhou:" + type(e).__name__)
