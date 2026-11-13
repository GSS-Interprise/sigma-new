"""Testes do motor de IA (Hermes + assinatura do Claude) sem rodar nada na VPS.

Rodar: python -m unittest vps/sigma-rotinas/test_motor_claude.py   (só biblioteca padrão)
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motor_claude as m  # noqa: E402


class TestMotorClaude(unittest.TestCase):
    def test_link_do_login_le_so_a_linha_do_roteiro(self):
        saida = "lixo de terminal\nLINK: https://claude.com/cai/oauth/authorize?code=true&client_id=9\n"
        self.assertEqual(m.link_do_login(saida), "https://claude.com/cai/oauth/authorize?code=true&client_id=9")
        self.assertIsNone(m.link_do_login("ERRO: link-nao-apareceu\n"))
        # link no meio de outra linha não vale: o roteiro sempre imprime "LINK: " no começo
        self.assertIsNone(m.link_do_login("veja LINK: https://x.y"))

    def test_motivo_do_roteiro_vira_frase(self):
        self.assertEqual(m._motivo("algo\nERRO: token-nao-apareceu\n"), "token-nao-apareceu")
        self.assertIn("código", m.ERROS[m._motivo("ERRO: token-nao-apareceu")])
        self.assertIsNone(m._motivo("OK: token gravado"))

    def test_teste_so_passa_com_ok_e_codigo_zero(self):
        self.assertTrue(m.respondeu_ok(0, "OK\n"))
        self.assertTrue(m.respondeu_ok(0, "Resposta: OK."))
        self.assertFalse(m.respondeu_ok(1, "OK"))
        self.assertFalse(m.respondeu_ok(0, "TOKEN expirado"))  # "OK" dentro de outra palavra não conta
        self.assertFalse(m.respondeu_ok(None, ""))

    def test_saida_de_erro_nunca_mostra_token(self):
        saida = "iniciando\nfalha com sk-ant-oat01-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789 invalido"
        linha = m.ultima_linha_segura(saida)
        self.assertNotIn("sk-ant-", linha)
        self.assertIn("[token]", linha)
        self.assertEqual(m.ultima_linha_segura(""), "sem saída")
        self.assertLessEqual(len(m.ultima_linha_segura("x" * 500)), 200)

    def test_rotinas_registradas_batem_com_a_fila(self):
        # Os mesmos tipos que a migration 20261113170000 aceita em rotina_pedir.
        self.assertEqual(sorted(m.ROTINAS), sorted([
            "ia_claude_situacao", "ia_claude_login", "ia_claude_codigo", "ia_claude_teste", "ia_claude_sair"]))

    def test_codigo_invalido_nem_chega_na_vps(self):
        with self.assertRaises(RuntimeError):
            m.login_codigo({"codigo": "curto"})
        with self.assertRaises(RuntimeError):
            m.login_codigo({"codigo": "tem espaco no meio 12345"})


if __name__ == "__main__":
    unittest.main()
