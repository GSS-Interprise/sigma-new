// Logos oficiais (simplificados em SVG inline) das redes sociais usadas no Dossiê
import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg",
});

export const WhatsAppIcon = ({ size = 18, ...rest }: Props) => (
  <svg {...base(size)} {...rest}>
    <path
      fill="#25D366"
      d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 2.1.55 4.15 1.6 5.96L2 22l4.25-1.11a9.93 9.93 0 0 0 5.79 1.84h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02A9.84 9.84 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-2.52.66.67-2.46-.2-.31a8.16 8.16 0 0 1-1.26-4.38c0-4.51 3.67-8.18 8.19-8.18 2.18 0 4.24.85 5.78 2.4a8.13 8.13 0 0 1 2.39 5.79c0 4.51-3.67 8.18-8.18 8.18Zm4.49-6.12c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.16.25-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.22-1.45-1.37-1.7-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.83-.2-.48-.4-.41-.55-.42l-.47-.01c-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.74 2.66 4.22 3.73.59.25 1.05.41 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.46-.6 1.66-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z"
    />
  </svg>
);

export const InstagramIcon = ({ size = 18, ...rest }: Props) => (
  <svg {...base(size)} {...rest}>
    <defs>
      <linearGradient id="igGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#feda75" />
        <stop offset="25%" stopColor="#fa7e1e" />
        <stop offset="50%" stopColor="#d62976" />
        <stop offset="75%" stopColor="#962fbf" />
        <stop offset="100%" stopColor="#4f5bd5" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#igGrad)" />
    <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.6" />
    <circle cx="17.5" cy="6.5" r="1.1" fill="#fff" />
  </svg>
);

export const LinkedInIcon = ({ size = 18, ...rest }: Props) => (
  <svg {...base(size)} {...rest}>
    <rect width="24" height="24" rx="3" fill="#0A66C2" />
    <path
      fill="#fff"
      d="M7.1 9.5h2.6V18H7.1V9.5Zm1.3-3.7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.3 9.5h2.5v1.16h.04c.35-.66 1.21-1.36 2.49-1.36 2.66 0 3.15 1.75 3.15 4.02V18h-2.6v-3.84c0-.92-.02-2.1-1.28-2.1-1.28 0-1.48 1-1.48 2.04V18h-2.6V9.5Z"
    />
  </svg>
);

export const TikTokIcon = ({ size = 18, ...rest }: Props) => (
  <svg {...base(size)} {...rest}>
    <path
      fill="#000"
      d="M19.6 8.3a6.6 6.6 0 0 1-3.86-1.24v7.6a5.46 5.46 0 1 1-5.46-5.46c.18 0 .35.01.52.03v2.7a2.78 2.78 0 1 0 1.94 2.65V2h2.6a4 4 0 0 0 4.26 3.7v2.6Z"
    />
    <path
      fill="#25F4EE"
      d="M18.6 7.4a6.6 6.6 0 0 1-2.86-1.24v7.6a5.46 5.46 0 1 1-5.46-5.46c.18 0 .35.01.52.03v2.7a2.78 2.78 0 1 0 1.94 2.65V1h2.6a4 4 0 0 0 3.26 3.7v2.7Z"
      opacity=".8"
    />
    <path
      fill="#FE2C55"
      d="M20.6 9.2a6.6 6.6 0 0 1-3.86-1.24v7.6a5.46 5.46 0 1 1-5.46-5.46c.18 0 .35.01.52.03v2.7a2.78 2.78 0 1 0 1.94 2.65V2.9h2.6a4 4 0 0 0 4.26 3.7v2.6Z"
      opacity=".8"
    />
  </svg>
);

export const GmailIcon = ({ size = 18, ...rest }: Props) => (
  <svg {...base(size)} {...rest}>
    <path fill="#4285F4" d="M2 6.5 12 13l10-6.5V18a2 2 0 0 1-2 2h-3V11l-5 3.3L7 11v9H4a2 2 0 0 1-2-2V6.5Z" />
    <path fill="#34A853" d="M4 4h3v7L2 7.3V6a2 2 0 0 1 2-2Z" />
    <path fill="#FBBC04" d="M17 4h3a2 2 0 0 1 2 2v1.3L17 11V4Z" />
    <path fill="#EA4335" d="M7 4h10v7l-5 3.3L7 11V4Z" />
  </svg>
);

export const PhoneCallIcon = ({ size = 18, ...rest }: Props) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="12" r="11" fill="#22c55e" />
    <path
      fill="#fff"
      d="M16.6 14.3a8 8 0 0 1-3.9-1.04 8 8 0 0 1-3-3 8 8 0 0 1-1.04-3.9c0-.4.32-.72.72-.72H11c.36 0 .67.27.72.62.07.55.2 1.08.39 1.59.07.2.02.43-.13.59l-.95.95a6.6 6.6 0 0 0 3.07 3.07l.95-.95c.16-.16.4-.2.59-.13.51.18 1.04.32 1.59.39.36.05.62.36.62.72v1.62c0 .4-.32.72-.72.72Z"
    />
  </svg>
);

export const TrafegoPagoIcon = ({ size = 18, ...rest }: Props) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="12" r="11" fill="hsl(var(--primary))" />
    <path
      fill="#fff"
      d="M7 14.5 7 11l4-1V8.2a.7.7 0 0 1 1.05-.6l5 2.85a.7.7 0 0 1 0 1.21l-5 2.85A.7.7 0 0 1 11 13.9V12.1l-3 .73v1.67a.5.5 0 0 1-.5.5H7.5a.5.5 0 0 1-.5-.5Z"
    />
  </svg>
);
