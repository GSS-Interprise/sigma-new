import * as React from "react";
import { cn } from "@/lib/utils";

export interface MarkdownTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  showPreview?: boolean;
}

// Simple markdown renderer
function renderMarkdown(text: string): string {
  if (!text) return "";
  
  let html = text
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.*?)~~/gim, '<del>$1</del>')
    // Inline code
    .replace(/`(.*?)`/gim, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
    // Unordered lists
    .replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ml-4">$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\.\s+(.*)$/gim, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks
    .replace(/\n/gim, '<br/>');
  
  // Wrap consecutive li elements in ul
  html = html.replace(/(<li[^>]*>.*?<\/li>(<br\/>)?)+/gim, (match) => {
    return '<ul class="list-disc my-2">' + match.replace(/<br\/>/g, '') + '</ul>';
  });
  
  return html;
}

const MarkdownTextarea = React.forwardRef<HTMLTextAreaElement, MarkdownTextareaProps>(
  ({ className, showPreview = true, value, ...props }, ref) => {
    return (
      <div className="w-full space-y-1">
        <textarea
          className={cn(
            "flex min-h-[400px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y",
            className
          )}
          ref={ref}
          value={value}
          {...props}
        />
        <p className="text-[10px] text-muted-foreground">
          Markdown: **negrito**, *itálico*, # título, - lista
        </p>
      </div>
    );
  }
);

MarkdownTextarea.displayName = "MarkdownTextarea";

export { MarkdownTextarea, renderMarkdown };
