import React from "react";

/**
 * Renderiza texto com formatação estilo WhatsApp:
 *  *negrito*  _itálico_  ~tachado~  ```mono bloco```  `código`
 *  > citação (linha)
 *  * item / - item   (lista)
 *  1. item           (lista enumerada)
 *
 * Retorna React nodes — seguro contra HTML, não usa dangerouslySetInnerHTML.
 */

// Inline: negrito, itálico, tachado, código, bloco mono
// A ordem importa: bloco ``` antes de ` simples; inline antes de só-texto.
const INLINE_RE =
  /(```[\s\S]+?```)|(`[^`\n]+?`)|(\*[^*\n]+?\*)|(_[^_\n]+?_)|(~[^~\n]+?~)/g;

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  let i = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const k = `${keyBase}-i${i++}`;
    if (token.startsWith("```") && token.endsWith("```")) {
      out.push(
        <code
          key={k}
          className="font-mono text-[0.92em] bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 whitespace-pre-wrap"
        >
          {token.slice(3, -3)}
        </code>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      out.push(
        <code
          key={k}
          className="font-mono text-[0.92em] bg-black/10 dark:bg-white/10 rounded px-1"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      out.push(
        <strong key={k} className="font-semibold">
          {renderInline(token.slice(1, -1), k)}
        </strong>
      );
    } else if (token.startsWith("_") && token.endsWith("_")) {
      out.push(
        <em key={k} className="italic">
          {renderInline(token.slice(1, -1), k)}
        </em>
      );
    } else if (token.startsWith("~") && token.endsWith("~")) {
      out.push(
        <span key={k} className="line-through">
          {renderInline(token.slice(1, -1), k)}
        </span>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Formata um nó de texto puro em React nodes com a estilização do WhatsApp.
 * Mantém quebras de linha (whitespace-pre-wrap no container).
 * Para listas e citações usamos uma marcação leve por linha.
 */
export function formatWhatsappText(text: string, keyBase = "wpf"): React.ReactNode {
  if (!text) return text;

  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, idx) => {
    const k = `${keyBase}-l${idx}`;
    const trimmed = line.replace(/^\s+/, "");

    // Citação > texto
    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      nodes.push(
        <span
          key={k}
          className="block border-l-[3px] border-current/60 pl-2 my-0.5 italic opacity-90"
        >
          {renderInline(quote[1], k)}
        </span>
      );
    } else {
      // Bullet * texto / - texto
      const bullet = /^[*-]\s+(.+)$/.exec(trimmed);
      // Lista enumerada 1. texto
      const numbered = /^(\d+)\.\s+(.+)$/.exec(trimmed);

      if (bullet) {
        nodes.push(
          <span key={k} className="block">
            • {renderInline(bullet[1], k)}
          </span>
        );
      } else if (numbered) {
        nodes.push(
          <span key={k} className="block">
            {numbered[1]}. {renderInline(numbered[2], k)}
          </span>
        );
      } else {
        nodes.push(
          <React.Fragment key={k}>{renderInline(line, k)}</React.Fragment>
        );
      }
    }

    if (idx < lines.length - 1) nodes.push(<br key={`${k}-br`} />);
  });

  return <>{nodes}</>;
}

/**
 * Aplica formatação WhatsApp a um React.ReactNode existente, atravessando
 * apenas strings (preserva elementos React já criados — ex.: links de telefone).
 */
export function formatWhatsappNode(node: React.ReactNode): React.ReactNode {
  if (node == null || typeof node === "boolean") return node;
  if (typeof node === "string") return formatWhatsappText(node);
  if (typeof node === "number") return node;
  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <React.Fragment key={`wf-${i}`}>{formatWhatsappNode(child)}</React.Fragment>
    ));
  }
  if (React.isValidElement(node)) {
    // Não reformata dentro de elementos já React (ex.: <SigZapPhonePopover/>).
    return node;
  }
  return node;
}