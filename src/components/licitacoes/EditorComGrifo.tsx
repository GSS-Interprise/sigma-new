import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/** Classe dos trechos escritos pela equipe. A mesma classe pinta o grifo na leitura (ver `GRIFO_EQUIPE`). */
export const CLASSE_EDICAO = "edicao-equipe";
/** Tailwind para o container que mostra o HTML: grifo amarelo legível no claro e no escuro. */
export const GRIFO_EQUIPE =
  "[&_mark.edicao-equipe]:bg-amber-200 [&_mark.edicao-equipe]:text-foreground [&_mark.edicao-equipe]:rounded-sm [&_mark.edicao-equipe]:px-0.5 dark:[&_mark.edicao-equipe]:bg-amber-500/40";

const TIPOS_DE_TEXTO = new Set(["insertText", "insertReplacementText", "insertFromPaste", "insertFromDrop", "insertFromYank"]);
const MAX_PASSOS = 200;

export type EditorComGrifoRef = { desfazer: () => void; refazer: () => void };

type Passo = { html: string; cursor: number };

/** Posição do cursor como número de caracteres desde o começo do texto (sobrevive a trocar o innerHTML). */
function cursorEmTexto(raiz: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !raiz.contains(sel.anchorNode)) return raiz.textContent?.length ?? 0;
  const r = document.createRange();
  r.selectNodeContents(raiz);
  r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return r.toString().length;
}

function porCursor(raiz: HTMLElement, pos: number) {
  const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let resto = pos;
  let no = andar.nextNode() as Text | null;
  let ultimo: Text | null = null;
  while (no) {
    if (resto <= no.length) break;
    resto -= no.length;
    ultimo = no;
    no = andar.nextNode() as Text | null;
  }
  const alvo = no ?? ultimo;
  const sel = window.getSelection();
  if (!alvo || !sel) return;
  const r = document.createRange();
  r.setStart(alvo, Math.min(no ? resto : alvo.length, alvo.length));
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

/**
 * Texto corrigível em que TUDO que a pessoa digita ou cola sai grifado (Gustavo, licitações GSS, 18/11: corrigir o
 * que a IA leu errado e deixar visível o que foi escrito pela equipe).
 *
 * Como: o `beforeinput` de texto é interceptado e o texto entra num `<mark class="edicao-equipe">`. Se o cursor já
 * está dentro de um grifo da equipe, o texto entra nele (não vira um mark por letra). Colar entra como texto puro.
 *
 * Desfazer próprio (Luiz, 18/11: apagou um trecho sem querer e o Ctrl+Z não voltava): como o texto é inserido à mão,
 * a pilha do navegador fica inconsistente, então o editor guarda a sua. Cada edição (digitar, apagar, colar, Enter)
 * empilha o estado anterior; letras seguidas viram um passo só. Ctrl+Z desfaz, Ctrl+Y / Ctrl+Shift+Z refaz.
 */
export const EditorComGrifo = forwardRef<EditorComGrifoRef, {
  htmlInicial: string;
  onChange: (html: string) => void;
  /** Avisa se há o que desfazer/refazer, para os botões da tela. */
  onHistorico?: (h: { podeDesfazer: boolean; podeRefazer: boolean }) => void;
  className?: string;
}>(function EditorComGrifo({ htmlInicial, onChange, onHistorico, className }, refExterno) {
  const ref = useRef<HTMLDivElement>(null);
  const aoMudar = useRef(onChange);
  aoMudar.current = onChange;
  const aoHistorico = useRef(onHistorico);
  aoHistorico.current = onHistorico;
  const passado = useRef<Passo[]>([]);
  const futuro = useRef<Passo[]>([]);
  // agrupa letras digitadas em sequência num passo só de desfazer
  const ultimoTipo = useRef<{ tipo: string; em: number } | null>(null);

  const avisarHistorico = () =>
    aoHistorico.current?.({ podeDesfazer: passado.current.length > 0, podeRefazer: futuro.current.length > 0 });

  const fotografar = (): Passo => {
    const el = ref.current!;
    return { html: el.innerHTML, cursor: cursorEmTexto(el) };
  };

  const aplicar = (p: Passo) => {
    const el = ref.current!;
    el.innerHTML = p.html;
    el.focus();
    porCursor(el, p.cursor);
    ultimoTipo.current = null;
    aoMudar.current(el.innerHTML);
    avisarHistorico();
  };

  const desfazer = () => {
    const p = passado.current.pop();
    if (!p) return;
    futuro.current.push(fotografar());
    aplicar(p);
  };
  const refazer = () => {
    const p = futuro.current.pop();
    if (!p) return;
    passado.current.push(fotografar());
    aplicar(p);
  };
  useImperativeHandle(refExterno, () => ({ desfazer, refazer }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = htmlInicial;

    const empilhar = (tipo: string) => {
      const agora = Date.now();
      const ehLetra = tipo === "insertText";
      const mesmoGrupo = ehLetra && ultimoTipo.current?.tipo === tipo && agora - ultimoTipo.current.em < 1500;
      if (!mesmoGrupo) {
        passado.current.push(fotografar());
        if (passado.current.length > MAX_PASSOS) passado.current.shift();
      }
      futuro.current = [];
      ultimoTipo.current = { tipo, em: agora };
      avisarHistorico();
    };

    const antesDeEditar = (ev: Event) => {
      const e = ev as InputEvent;
      if (e.inputType === "historyUndo" || e.inputType === "historyRedo") {
        e.preventDefault(); // a pilha do navegador não vale aqui (ver o comentário do componente)
        return;
      }
      empilhar(e.inputType);
      if (!TIPOS_DE_TEXTO.has(e.inputType)) return; // apagar, Enter: comportamento normal do navegador
      const texto = e.data ?? e.dataTransfer?.getData("text/plain") ?? "";
      const sel = window.getSelection();
      if (!texto || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;

      e.preventDefault();
      if (!range.collapsed) range.deleteContents();
      const no = range.startContainer;
      const grifoAtual = (no.nodeType === Node.TEXT_NODE ? no.parentElement : (no as Element))
        ?.closest(`mark.${CLASSE_EDICAO}`);
      const textoNovo = document.createTextNode(texto);
      if (grifoAtual && el.contains(grifoAtual)) {
        range.insertNode(textoNovo);
      } else {
        const grifo = document.createElement("mark");
        grifo.className = CLASSE_EDICAO;
        grifo.title = "Escrito pela equipe";
        grifo.appendChild(textoNovo);
        range.insertNode(grifo);
      }
      // Cursor no fim do texto inserido, DENTRO do grifo: a próxima letra continua no mesmo mark.
      const depois = document.createRange();
      depois.setStart(textoNovo, texto.length);
      depois.collapse(true);
      sel.removeAllRanges();
      sel.addRange(depois);
      aoMudar.current(el.innerHTML);
    };
    const aoEditar = () => aoMudar.current(el.innerHTML);
    const atalhos = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); desfazer(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); refazer(); }
    };

    el.addEventListener("beforeinput", antesDeEditar);
    el.addEventListener("input", aoEditar);
    el.addEventListener("keydown", atalhos);
    return () => {
      el.removeEventListener("beforeinput", antesDeEditar);
      el.removeEventListener("input", aoEditar);
      el.removeEventListener("keydown", atalhos);
    };
    // htmlInicial só no começo da edição: reescrever o innerHTML a cada tecla perderia o cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Corrigir a análise do edital"
      className={className}
    />
  );
});
