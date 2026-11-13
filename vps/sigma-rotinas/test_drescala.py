"""Testes da rotina drescala_escalas sem falar com o Dr. Escala nem com o Sigma (API e fila são falsas).

Rodar: python -m unittest vps/sigma-rotinas/test_drescala.py   (só biblioteca padrão)
"""
import os
import sys
import unittest
from datetime import date
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import drescala as d  # noqa: E402


def plantao(id_, dia, **x):
    p = {"id": id_, "local_id": 10, "setor_id": 100, "inicio_plantao": f"{dia}T10:00:00.000Z",
         "fim_plantao": f"{dia}T22:00:00.000Z", "profissional_real": 55, "furo": False, "dateKey": dia,
         "situacao": {"situacao": "Designado"}, "tipo_do_plantao": {"tipo": "Normal"},
         "profissionalGlobal": {"nome": "Ana Souza"}, "valor_estimado": 1500, "valor_real": 1500}
    p.update(x)
    return p


class TestRegras(unittest.TestCase):
    def test_meses_do_periodo_atravessam_o_ano(self):
        self.assertEqual(d._meses(date(2026, 11, 6), date(2027, 1, 2)), ["2026-11", "2026-12", "2027-01"])
        self.assertEqual(d._meses(date(2026, 11, 6), date(2026, 11, 30)), ["2026-11"])

    def test_texto_vazio_vira_none(self):
        self.assertIsNone(d._texto("  "))
        self.assertIsNone(d._texto(None))
        self.assertEqual(d._texto(" UTI "), "UTI")

    def test_plantao_com_medico(self):
        l = d._plantao(plantao(1, "2026-11-13"))
        self.assertFalse(l["furo"])
        self.assertEqual(l["profissional_id"], 55)
        self.assertEqual(l["profissional_nome"], "Ana Souza")
        self.assertEqual((l["situacao"], l["tipo"]), ("Designado", "Normal"))

    def test_furo_pela_flag_ou_pelo_profissional_zero(self):
        # Dr. Escala: furo vem com furo=true, profissional 0 e "Sem Profissional Alocado".
        l = d._plantao(plantao(2, "2026-11-13", furo=True, profissional_real=0,
                               profissionalGlobal={"nome": "Sem Profissional Alocado"}))
        self.assertTrue(l["furo"])
        self.assertIsNone(l["profissional_nome"])
        self.assertIsNone(l["profissional_id"])
        # flag falsa mas sem médico: ainda é furo
        self.assertTrue(d._plantao(plantao(3, "2026-11-13", profissional_real=0))["furo"])

    def test_nome_pelo_caminho_alternativo(self):
        l = d._plantao(plantao(4, "2026-11-13", profissionalGlobal=None,
                               profissional={"profissionalGlobal": {"nome": "Bruno Lima"}}))
        self.assertEqual(l["profissional_nome"], "Bruno Lima")

    def test_dinheiro_nao_vai_para_o_sigma(self):
        l = d._plantao(plantao(5, "2026-11-13"))
        self.assertNotIn("valor", str(sorted(l)) + str(sorted(l["raw"])))

    def test_formato_mudou_avisa(self):
        with self.assertRaises(RuntimeError):
            d._plantao({"id": 1, "inicioPlantao": "x"})


class FalsoDrEscala:
    """Uma unidade com 2 setores (um arquivado), outra só com setor desligado. Grade de novembro repete dias."""
    instancias = []

    def __init__(self, falhar_em=None):
        self.chamadas = 0
        self.pedidos = []
        self.falhar_em = falhar_em
        FalsoDrEscala.instancias.append(self)

    def get(self, caminho):
        self.chamadas += 1
        self.pedidos.append(caminho)
        if caminho == "/locais/findAllListagem":
            return [
                {"id": 10, "nome": " Hospital A ", "habilitado": True, "setores": [
                    {"id": 100, "nome_setor": "UTI", "habilitado": True},
                    {"id": 101, "nome_setor": "Velho", "habilitado": True, "arquivado_em": "2025-01-01"},
                ]},
                {"id": 20, "nome": "Hospital B", "setores": [{"id": 200, "nome_setor": "PS", "habilitado": False}]},
            ]
        if caminho == "/locais/habilitados":
            return [{"id": 10, "cidade": "Itajaí", "uf": "SC"}]
        if caminho.startswith("/plantoes/mensal-setor"):
            if self.falhar_em and self.falhar_em in caminho:
                raise RuntimeError("429 sem fim")
            mes = caminho.split("mes=")[1]
            if mes != "2026-11":
                return []
            # Semana com dia do mês anterior (fora da janela) e o mesmo plantão em dois dias da grade.
            return [[
                {"plantoes": [plantao(1, "2026-10-31")]},
                {"plantoes": [plantao(2, "2026-11-13"), plantao(3, "2026-11-13", furo=True, profissional_real=0)]},
                {"plantoes": [plantao(2, "2026-11-13")]},
                {"plantoes": [plantao(4, "2026-11-20")]},
            ]]
        raise AssertionError("chamada inesperada " + caminho)


class TestSincronizar(unittest.TestCase):
    def setUp(self):
        FalsoDrEscala.instancias = []
        self.enviados = []

    def enviar(self, acao, corpo):
        self.enviados.append((acao, corpo))
        if acao == "drescala_abrir":
            return {"sync_id": "s1"}
        if acao == "drescala_fechar":
            return {"removidos": 0}
        return {}

    def test_janela_dedup_e_setores_desligados(self):
        with mock.patch.object(d, "DrEscala", FalsoDrEscala):
            r = d.sincronizar({"inicio": "2026-11-06", "dias": 10}, self.enviar)
        # janela 06/11 a 15/11: o plantão 1 (31/10) e o 4 (20/11) ficam de fora; o 2 aparece duas vezes na grade.
        plantoes = [p for a, c in self.enviados if a == "drescala_gravar" for p in c["plantoes"]]
        self.assertEqual(sorted(p["id"] for p in plantoes), [2, 3])
        self.assertEqual((r["plantoes"], r["furos"], r["setores"], r["locais"]), (2, 1, 1, 2))
        self.assertEqual((r["inicio"], r["fim"]), ("2026-11-06", "2026-11-15"))
        # só o setor ativo é consultado; setor arquivado e desligado poupam chamada
        grades = [c for c in FalsoDrEscala.instancias[0].pedidos if "mensal-setor" in c]
        self.assertEqual(grades, ["/plantoes/mensal-setor?setor_id=100&mes=2026-11"])
        # ordem com a fila: abre, grava locais/setores, grava plantões, fecha ok
        self.assertEqual([a for a, _ in self.enviados], ["drescala_abrir", "drescala_gravar", "drescala_gravar", "drescala_fechar"])
        self.assertEqual(self.enviados[-1][1], {"sync_id": "s1", "ok": True})
        locais = self.enviados[1][1]["locais"]
        self.assertEqual(locais[0]["nome"], "Hospital A")
        self.assertEqual((locais[0]["cidade"], locais[1]["cidade"]), ("Itajaí", None))

    def test_periodo_limitado_a_62_dias(self):
        with mock.patch.object(d, "DrEscala", FalsoDrEscala):
            r = d.sincronizar({"inicio": "2026-11-01", "dias": 500}, self.enviar)
        self.assertEqual(r["fim"], "2027-01-01")

    def test_so_alguns_locais(self):
        with mock.patch.object(d, "DrEscala", FalsoDrEscala):
            r = d.sincronizar({"inicio": "2026-11-06", "dias": 10, "local_ids": ["20"]}, self.enviar)
        self.assertEqual((r["locais"], r["setores"], r["plantoes"]), (1, 0, 0))
        self.assertEqual(self.enviados[0][1]["local_ids"], [20])

    def test_erro_no_meio_fecha_a_sync_com_erro(self):
        # Sem fechar com erro, drescala_fechar(ok) apagaria os plantões que não chegaram.
        with mock.patch.object(d, "DrEscala", lambda: FalsoDrEscala(falhar_em="setor_id=100")):
            with self.assertRaises(RuntimeError):
                d.sincronizar({"inicio": "2026-11-06", "dias": 10}, self.enviar)
        acao, corpo = self.enviados[-1]
        self.assertEqual(acao, "drescala_fechar")
        self.assertFalse(corpo["ok"])
        self.assertIn("429", corpo["erro"])


class TestHttp(unittest.TestCase):
    def test_429_espera_e_tenta_de_novo(self):
        import urllib.error

        respostas = [urllib.error.HTTPError("u", 429, "x", {}, None), urllib.error.HTTPError("u", 429, "x", {}, None)]

        class Resp:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b'{"ok": 1}'

        def abrir(req, timeout):
            if respostas:
                raise respostas.pop(0)
            return Resp()

        de = d.DrEscala.__new__(d.DrEscala)
        de.token = "t"
        with mock.patch.object(d.urllib.request, "urlopen", abrir), mock.patch.object(d.time, "sleep") as dorme:
            self.assertEqual(de._req("GET", "/x"), {"ok": 1})
        self.assertEqual([c.args[0] for c in dorme.call_args_list], [10, 20])

    def test_login_recusado_tem_mensagem_clara(self):
        import urllib.error

        def abrir(req, timeout):
            raise urllib.error.HTTPError("u", 401, "x", {}, None)

        with mock.patch.dict(os.environ, {"DRESCALA_EMAIL": "a", "DRESCALA_SENHA": "b"}), \
                mock.patch.object(d.urllib.request, "urlopen", abrir):
            with self.assertRaisesRegex(RuntimeError, "senha mudou"):
                d.DrEscala()

    def test_sem_credencial_nem_tenta(self):
        with mock.patch.dict(os.environ, {"DRESCALA_EMAIL": "", "DRESCALA_SENHA": ""}):
            with self.assertRaisesRegex(RuntimeError, "DRESCALA_EMAIL"):
                d.DrEscala()


if __name__ == "__main__":
    unittest.main()
