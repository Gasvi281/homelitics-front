import type { ReactNode } from "react";

type Variante = "info" | "error" | "exito" | "espera";

const ESTILO: Record<Variante, string> = {
  info: "bg-plano-claro text-plano-texto",
  error: "bg-alerta-claro text-alerta-hondo",
  exito: "bg-montana-claro text-montana-hondo",
  espera: "bg-sol-claro text-sol-texto",
};

/**
 * Banner de estado. Compartido porque "sin resultados", "no encontrado" y
 * "error de red" se repiten en casi todas las pantallas (ver
 * docs/API_CONTRACT.md, sección de errores que cambian la UI).
 *
 * - `info`: lo que hay que saber, sin urgencia.
 * - `error`: algo falló; el texto dice qué hacer.
 * - `exito`: una acción terminó bien.
 * - `espera`: el servicio está despertando o algo está pendiente de otro.
 *
 * El ícono acompaña al color para que el estado no dependa solo del tono.
 */
export function Aviso({
  variante = "info",
  children,
}: {
  variante?: Variante;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl px-5 py-4 text-[15px] leading-relaxed ${ESTILO[variante]}`}>
      <Icono variante={variante} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Icono({ variante }: { variante: Variante }) {
  const trazo = {
    info: <path d="M10 9v5M10 6v.5" strokeLinecap="round" />,
    error: <path d="M10 5.5v5M10 13.5v.5" strokeLinecap="round" />,
    exito: <path d="M6.5 10.5l2.5 2.5 4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />,
    espera: <path d="M10 6v4.5l3 2" strokeLinecap="round" />,
  }[variante];
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="10" cy="10" r="8" strokeWidth={1.8} />
      {trazo}
    </svg>
  );
}
