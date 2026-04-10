import * as React from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { Button } from "./button";
import { 
  Bold, 
  Italic, 
  Underline, 
  Highlighter, 
  Type,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Palette,
  Eraser
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";

export interface RichTextEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeight?: string;
  onImagePaste?: (file: File) => void;
}

const HIGHLIGHT_COLORS = [
  { name: "Amarelo", color: "#fef08a" },
  { name: "Verde", color: "#bbf7d0" },
  { name: "Azul", color: "#bfdbfe" },
  { name: "Rosa", color: "#fbcfe8" },
  { name: "Laranja", color: "#fed7aa" },
  { name: "Roxo", color: "#ddd6fe" },
];

const TEXT_COLORS = [
  { name: "Preto", color: "#000000" },
  { name: "Vermelho", color: "#dc2626" },
  { name: "Verde", color: "#16a34a" },
  { name: "Azul", color: "#2563eb" },
  { name: "Laranja", color: "#ea580c" },
  { name: "Roxo", color: "#9333ea" },
  { name: "Rosa", color: "#db2777" },
  { name: "Cinza", color: "#6b7280" },
];

const RichTextEditor = React.forwardRef<HTMLDivElement, RichTextEditorProps>(
  ({ value, onChange, placeholder, className, disabled, minHeight = "300px", onImagePaste }, ref) => {
    const editorRef = React.useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = React.useState(false);
    const savedSelectionRef = React.useRef<Range | null>(null);
    const emptyEnterCountRef = React.useRef(0);

    React.useEffect(() => {
      if (editorRef.current && value !== undefined) {
        const sanitized = sanitizeHtml(value);
        if (editorRef.current.innerHTML !== sanitized) {
          editorRef.current.innerHTML = sanitized;
        }
      }
    }, [value]);

    const saveSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
      }
    };

    const restoreSelection = () => {
      const sel = window.getSelection();
      if (sel && savedSelectionRef.current) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRef.current);
      }
    };

    const execCommand = (command: string, val?: string) => {
      const sel = window.getSelection();
      
      // Check if inside a highlight box
      const isInsideBox = sel && sel.rangeCount > 0 && getBoxAncestor(sel.anchorNode);
      
      if (isInsideBox && (command === 'insertOrderedList' || command === 'insertUnorderedList')) {
        const box = getBoxAncestor(sel!.anchorNode)!;
        const textContent = box.innerText || '';
        const lines = textContent.split('\n').filter(l => l.trim());
        if (lines.length === 0) return;
        
        const isOrdered = command === 'insertOrderedList';
        const listTag = isOrdered ? 'ol' : 'ul';
        const listStyle = isOrdered ? 'list-style-type: decimal;' : 'list-style-type: disc;';
        const listHtml = `<${listTag} style="${listStyle} padding-left: 20px; margin: 4px 0;">` +
          lines.map(l => `<li>${l.trim()}</li>`).join('') +
          `</${listTag}>`;
        
        box.innerHTML = listHtml;
        saveSelection();
        handleInput();
        return;
      }
      
      // Selection should be preserved by onMouseDown preventDefault on toolbar
      // Only restore if selection is not inside the editor
      if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        // Selection is valid and inside editor, just execute
        document.execCommand(command, false, val);
      } else {
        // Selection was lost, restore it
        editorRef.current?.focus();
        restoreSelection();
        document.execCommand(command, false, val);
      }
      saveSelection();
      handleInput();
    };

    // Sanitiza HTML removendo atributos contenteditable antes de salvar
    const sanitizeHtml = (html: string): string => {
      let sanitized = html.replace(/\s*contenteditable\s*=\s*["']?true["']?/gi, '');
      sanitized = sanitized.replace(/\s*contenteditable\s*(?=[>\s])/gi, '');
      return sanitized;
    };

    const handleInput = () => {
      if (editorRef.current && onChange) {
        const sanitizedHtml = sanitizeHtml(editorRef.current.innerHTML);
        onChange(sanitizedHtml);
      }
    };

    const getBoxAncestor = (node: Node | null): HTMLElement | null => {
      if (!node) return null;
      const el = node instanceof HTMLElement ? node : node.parentElement;
      return el?.closest('[data-highlight-box]') as HTMLElement | null;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      // Save selection on every keydown for toolbar use
      saveSelection();

      // Handle Enter inside highlight box
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const node = selection.anchorNode;
          const box = getBoxAncestor(node);
          if (box) {
            // Check if cursor is at an empty line (text before cursor ends with newline/br)
            const range = selection.getRangeAt(0);
            
            // Count consecutive empty enters
            emptyEnterCountRef.current++;
            
            if (emptyEnterCountRef.current >= 2) {
              e.preventDefault();
              emptyEnterCountRef.current = 0;
              
              // Remove last <br> from box
              const lastBr = box.querySelector(':scope > br:last-child') || 
                             Array.from(box.childNodes).reverse().find(n => n.nodeName === 'BR');
              if (lastBr) lastBr.remove();
              
              // Ensure there's a paragraph after the box
              let afterEl = box.nextElementSibling;
              if (!afterEl) {
                afterEl = document.createElement('p');
                afterEl.innerHTML = '<br>';
                box.parentNode?.insertBefore(afterEl, box.nextSibling);
              }
              
              // Move cursor after the box
              const newRange = document.createRange();
              newRange.selectNodeContents(afterEl);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
              handleInput();
              return;
            }
            
            // First enter inside box: insert a <br> manually to prevent browser from cloning the div
            e.preventDefault();
            document.execCommand('insertLineBreak');
            handleInput();
            return;
          }
        }
      }
      
      // Reset empty enter counter for non-Enter keys
      if (e.key !== 'Enter') {
        emptyEnterCountRef.current = 0;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            execCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            execCommand('italic');
            break;
          case 'u':
            e.preventDefault();
            execCommand('underline');
            break;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              execCommand('redo');
            } else {
              execCommand('undo');
            }
            break;
        }
      }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            if (onImagePaste) {
              onImagePaste(file);
              toast.info('Imagem enviada para anexos');
            }
          }
          return;
        }
      }

      // Sanitize pasted HTML to remove dangerous styles (position:absolute, z-index, etc.)
      const pastedHtml = e.clipboardData?.getData('text/html');
      if (pastedHtml) {
        e.preventDefault();
        const sanitized = sanitizeHtml(pastedHtml);
        document.execCommand('insertHTML', false, sanitized);
      }
    };

    const applyHighlight = (color: string) => {
      execCommand('hiliteColor', color);
    };

    const applyTextColor = (color: string) => {
      execCommand('foreColor', color);
    };

    const clearAllFormatting = () => {
      restoreSelection();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        
        if (selectedText) {
          execCommand('removeFormat');
          execCommand('hiliteColor', 'transparent');
        } else if (editorRef.current) {
          const plainText = editorRef.current.innerText || '';
          editorRef.current.innerHTML = plainText;
          handleInput();
        }
      } else if (editorRef.current) {
        const plainText = editorRef.current.innerText || '';
        editorRef.current.innerHTML = plainText;
        handleInput();
      }
      editorRef.current?.focus();
    };

    const insertBox = (bgColor: string, borderColor: string) => {
      restoreSelection();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        
        // Extract HTML content from selection to preserve formatting and line breaks
        const fragment = range.cloneContents();
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(fragment);
        let htmlContent = tempDiv.innerHTML || "Texto aqui";
        
        // If content is plain text with no HTML tags, preserve newlines as <br>
        if (htmlContent === range.toString()) {
          htmlContent = htmlContent.split('\n').join('<br>');
        }
        
        const box = document.createElement('div');
        box.style.cssText = `
          background-color: ${bgColor};
          border: 2px solid ${borderColor};
          border-radius: 6px;
          padding: 12px;
          margin: 8px 0;
          display: block;
          min-width: 100px;
        `;
        box.setAttribute('data-highlight-box', 'true');
        box.innerHTML = htmlContent;
        
        // Add a paragraph after the box so user can click/type outside
        const afterParagraph = document.createElement('p');
        afterParagraph.innerHTML = '<br>';
        
        range.deleteContents();
        range.insertNode(afterParagraph);
        range.insertNode(box);
        
        // Place cursor inside the box
        const newRange = document.createRange();
        newRange.selectNodeContents(box);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        emptyEnterCountRef.current = 0;
        handleInput();
      }
    };

    // Save selection when editor loses focus (for toolbar clicks)
    const handleBlur = () => {
      saveSelection();
      setIsFocused(false);
    };

    const handleMouseUp = () => {
      saveSelection();
    };

    const ToolbarButton = ({ 
      onClick, 
      icon: Icon, 
      title,
      active = false 
    }: { 
      onClick: () => void; 
      icon: React.ElementType; 
      title: string;
      active?: boolean;
    }) => (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 w-8 p-0",
          active && "bg-muted"
        )}
        onMouseDown={(e) => {
          e.preventDefault(); // Prevent focus steal from editor
          onClick();
        }}
        title={title}
        disabled={disabled}
      >
        <Icon className="h-4 w-4" />
      </Button>
    );

    return (
      <div className={cn("w-full space-y-1", className)} ref={ref}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 p-1 border border-input rounded-t-md bg-muted/50" onMouseDown={(e) => e.preventDefault()}>
          <ToolbarButton onClick={() => execCommand('bold')} icon={Bold} title="Negrito (Ctrl+B)" />
          <ToolbarButton onClick={() => execCommand('italic')} icon={Italic} title="Itálico (Ctrl+I)" />
          <ToolbarButton onClick={() => execCommand('underline')} icon={Underline} title="Sublinhado (Ctrl+U)" />
          <ToolbarButton onClick={() => execCommand('strikeThrough')} icon={Strikethrough} title="Tachado" />
          
          <div className="w-px h-6 bg-border mx-1" />
          
          {/* Text Color Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="Cor do texto"
                disabled={disabled}
              >
                <Type className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="grid grid-cols-4 gap-1">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.color}
                    className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: c.color }}
                    onClick={() => applyTextColor(c.color)}
                    title={c.name}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Highlight Color Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="Destacar texto"
                disabled={disabled}
              >
                <Highlighter className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="grid grid-cols-3 gap-1">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.color}
                    className="w-8 h-6 rounded border border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: c.color }}
                    onClick={() => applyHighlight(c.color)}
                    title={c.name}
                  />
                ))}
                <button
                  className="w-8 h-6 rounded border border-border hover:scale-110 transition-transform bg-transparent text-xs"
                  onClick={() => execCommand('removeFormat')}
                  title="Remover formatação"
                >
                  ✕
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Box/Shape Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="Inserir caixa de destaque"
                disabled={disabled}
              >
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <p className="text-xs text-muted-foreground mb-2">Inserir caixa:</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  className="p-2 rounded border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 text-xs"
                  onClick={() => insertBox('#eff6ff', '#3b82f6')}
                  title="Caixa azul"
                >
                  Info
                </button>
                <button
                  className="p-2 rounded border-2 border-green-400 bg-green-50 hover:bg-green-100 text-xs"
                  onClick={() => insertBox('#f0fdf4', '#22c55e')}
                  title="Caixa verde"
                >
                  OK
                </button>
                <button
                  className="p-2 rounded border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 text-xs"
                  onClick={() => insertBox('#fffbeb', '#f59e0b')}
                  title="Caixa amarela"
                >
                  Alerta
                </button>
                <button
                  className="p-2 rounded border-2 border-red-400 bg-red-50 hover:bg-red-100 text-xs"
                  onClick={() => insertBox('#fef2f2', '#ef4444')}
                  title="Caixa vermelha"
                >
                  Erro
                </button>
                <button
                  className="p-2 rounded border-2 border-purple-400 bg-purple-50 hover:bg-purple-100 text-xs"
                  onClick={() => insertBox('#faf5ff', '#a855f7')}
                  title="Caixa roxa"
                >
                  Nota
                </button>
                <button
                  className="p-2 rounded border-2 border-gray-400 bg-gray-50 hover:bg-gray-100 text-xs"
                  onClick={() => insertBox('#f9fafb', '#6b7280')}
                  title="Caixa cinza"
                >
                  Citação
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <div className="w-px h-6 bg-border mx-1" />

          <ToolbarButton onClick={() => execCommand('insertUnorderedList')} icon={List} title="Lista" />
          <ToolbarButton onClick={() => execCommand('insertOrderedList')} icon={ListOrdered} title="Lista numerada" />
          
          <div className="w-px h-6 bg-border mx-1" />

          <ToolbarButton onClick={() => execCommand('justifyLeft')} icon={AlignLeft} title="Alinhar à esquerda" />
          <ToolbarButton onClick={() => execCommand('justifyCenter')} icon={AlignCenter} title="Centralizar" />
          <ToolbarButton onClick={() => execCommand('justifyRight')} icon={AlignRight} title="Alinhar à direita" />

          <div className="w-px h-6 bg-border mx-1" />

          <ToolbarButton onClick={() => execCommand('undo')} icon={Undo} title="Desfazer (Ctrl+Z)" />
          <ToolbarButton onClick={() => execCommand('redo')} icon={Redo} title="Refazer (Ctrl+Shift+Z)" />

          <div className="w-px h-6 bg-border mx-1" />

          <ToolbarButton onClick={clearAllFormatting} icon={Eraser} title="Limpar formatação (borracha)" />
        </div>

        {/* Editor Area */}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          className={cn(
            "w-full rounded-b-md border border-t-0 border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "overflow-auto relative",
            "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_li]:my-0.5",
            disabled && "cursor-not-allowed opacity-50",
            !value && !isFocused && "text-muted-foreground"
          )}
          style={{ minHeight }}
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onKeyUp={saveSelection}
          onMouseUp={handleMouseUp}
          onPaste={handlePaste}
          data-placeholder={placeholder}
          suppressContentEditableWarning
        />

        <p className="text-[10px] text-muted-foreground">
          Dica: Ctrl+B negrito, Ctrl+I itálico, Ctrl+U sublinhado
        </p>
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";

export { RichTextEditor };
