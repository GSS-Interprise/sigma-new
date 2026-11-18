import { useEffect, useRef } from "react";

/** Classe dos trechos escritos pela equipe. A mesma classe pinta o grifo na leitura (ver `GRIFO_EQUIPE`). */
export const CLASSE_EDICAO = "edicao-equipe";
/** Tailwind para o container que mostra o HTML: grifo amarelo legível no claro e no escuro. */
export const GRIFO_EQUIPE =
  "[&_mark.edicao-equipe]:bg-amber-200 [&_mark.edicao-equipe]:text-foreground [&_mark.edicao-equipe]:rounded-sm [&_mark.edicao-equipe]:px-0.5 dark:[&_mark.edicao-equipe]:bg-amber-500/40";

const TIPOS_DE_TEXTO = new Set(["insertText", "insertReplacementText", "insertFromPaste", "insertFromDrop", "insertFromYank"]);

/**
 * Texto corrigível em que TUDO que a pessoa digita ou cola sai grifado (Gustavo, licitações GSS, 18/11: corrigir o
 * que a IA leu errado e deixar visível o que foi escrito pela equipe).
 *
 * Como: o `beforeinput` de texto é interceptado e o texto entra num `<mark class="edicao-equipe">`. Se o cursor já
 * está dentro de um grifo da equipe, o texto entra nele (não vira um mark por letra). Colar entra como texto puro.
 * Apagar e Enter seguem o comportamento normal do navegador. Custo: o Ctrl+Z do navegador não desfaz o que foi
 * digitado; "Cancelar" descarta a correção inteira.
 */
export function EditorComGrifo({ htmlInicial, onChange, className }: {
  htmlInicial: string;
  onChange: (html: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const aoMudar = useRef(onChange);
  aoMudar.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = htmlInicial;

    const antesDeDigitar = (ev: Event) => {
      const e = ev as InputEvent;
      if (!TIPOS_DE_TEXTO.has(e.inputType)) return;
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

    el.addEventListener("beforeinput", antesDeDigitar);
    el.addEventListener("input", aoEditar);
    return () => {
      el.removeEventListener("beforeinput", antesDeDigitar);
      el.removeEventListener("input", aoEditar);
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
}
