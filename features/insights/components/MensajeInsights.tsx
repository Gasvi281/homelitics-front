"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Aviso } from "@/components/Aviso";
import type { MensajeInsights as Mensaje } from "../InsightsProvider";

/**
 * Las tablas del asistente pueden ser más anchas que el panel: scroll propio
 * en vez de romper el ancho. Los enlaces abren aparte para no perder el chat.
 */
const COMPONENTES: Components = {
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/** Una burbuja del asistente de insights. */
export function MensajeInsights({ mensaje }: { mensaje: Mensaje }) {
  if (mensaje.role === "system") return <Aviso variante="error">{mensaje.text}</Aviso>;

  if (mensaje.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[20px] rounded-br-md bg-plano px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white">
          {mensaje.text}
        </p>
      </div>
    );
  }

  const fuentes = mensaje.sources ?? [];
  return (
    <div className="max-w-full rounded-[20px] rounded-bl-md bg-neblina px-4 py-3">
      <div className="prose-insights prose prose-sm max-w-none">
        <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTES}>
          {mensaje.text}
        </Markdown>
      </div>
      {fuentes.length > 0 && (
        <details className="mt-3 border-t border-borde pt-2 text-sm text-tinta-suave">
          <summary className="cursor-pointer font-semibold text-plano-texto">¿De dónde salen estos datos?</summary>
          <ul className="mt-2 space-y-1">
            {fuentes.map((fuente, i) => (
              <li key={`${fuente.endpoint}-${i}`}>
                <code className="rounded bg-hoja px-1.5 py-0.5 text-[13px] text-tinta">{fuente.endpoint}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
