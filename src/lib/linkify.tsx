import React from "react";

/**
 * Transforms URLs in plain text into clickable React anchor elements.
 * Links are styled in blue and open in a new tab.
 */
export function linkifyText(text: string): React.ReactNode {
  if (!text) return null;

  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

/**
 * Processes HTML string to make plain-text URLs clickable.
 * Uses a pure regex approach for maximum build compatibility.
 * Leaves existing <a> tags intact.
 */
export function linkifyHtml(html: string): string {
  if (!html) return "";

  // Split by existing anchor tags to preserve them
  const anchorRegex = /(<a\s[^>]*>.*?<\/a>)/gi;
  const parts = html.split(anchorRegex);
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

  return parts
    .map((part) => {
      // If this part is an existing anchor tag, leave it intact
      if (anchorRegex.test(part)) {
        anchorRegex.lastIndex = 0;
        return part;
      }
      // Replace URLs in text parts
      return part.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;word-break:break-all;cursor:pointer;pointer-events:auto;position:relative;z-index:10">${url}</a>`;
      });
    })
    .join("");
}
