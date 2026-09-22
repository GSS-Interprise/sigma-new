import { describe, expect, it } from "vitest";
import { pagamentoConferido, situacaoDoRelatorio } from "./fechamentoStatus";

// Reunião 22/09 com a GSS: "ali ele aparece não conferido, por mais que eu já tenha
// conferido ele... daí ele vem para aquelas aprovações, e eu aprovei". O relatório lia
// só o carimbo individual; o estado real da competência ficava de fora.

const FECH = { id: "fech-1", status: "aprovado" };
const naoCarimbado = { conferido_em: null, fechamento_id: "fech-1" };

describe("pagamentoConferido", () => {
  it("conferido quando tem carimbo, mesmo sem fechamento", () => {
    expect(pagamentoConferido({ conferido_em: "2026-09-22T12:00:00Z" }, null)).toBe(true);
  });

  it("conferido quando o fechamento da competência já avançou", () => {
    for (const status of ["em_nf", "aguardando_aprovacao", "aprovado", "pago"]) {
      expect(pagamentoConferido(naoCarimbado, { id: "fech-1", status })).toBe(true);
    }
  });

  it("NÃO conferido enquanto o fechamento está em aberto", () => {
    expect(pagamentoConferido(naoCarimbado, null)).toBe(false);
    expect(pagamentoConferido(naoCarimbado, { id: "fech-1", status: "cancelado" })).toBe(false);
    expect(pagamentoConferido({ conferido_em: null, fechamento_id: null }, null)).toBe(false);
  });

  it("lançamento importado depois não herda a conferência da competência", () => {
    expect(pagamentoConferido({ conferido_em: null, fechamento_id: null }, FECH)).toBe(false);
    expect(pagamentoConferido({ conferido_em: null, fechamento_id: "outro" }, FECH)).toBe(false);
  });
});

describe("situacaoDoRelatorio", () => {
  it("mostra a fase persistida do fechamento", () => {
    expect(situacaoDoRelatorio(naoCarimbado, FECH)).toBe("Aprovado pela diretoria");
    expect(situacaoDoRelatorio(naoCarimbado, { id: "fech-1", status: "em_nf" }))
      .toBe("Liberado para as notas fiscais");
  });

  it("lançamento fora do fechamento mostra a própria conferência", () => {
    expect(situacaoDoRelatorio({ conferido_em: null, fechamento_id: null }, FECH)).toBe("Em fechamento");
    expect(situacaoDoRelatorio({ conferido_em: "2026-09-22T12:00:00Z", fechamento_id: null }, FECH)).toBe("Conferido");
  });
});
