import type { ReactNode } from "react";

/** Los cuatro momentos de una visita, en el orden en que el cliente los vive. */
const PASOS = [
  "Elige un horario",
  "Confirma la visita",
  "Conoce la propiedad",
  "Cuéntanos qué te pareció",
] as const;

export type PasoVisita = 1 | 2 | 3 | 4;

/**
 * Las dos columnas de las pantallas de cliente: a la izquierda en qué paso
 * de la visita va (y lo que convenga tener a la vista, como la ficha de la
 * propiedad), a la derecha el contenido. Solo escritorio por ahora; en
 * pantallas angostas las columnas se apilan.
 */
export function MarcoCliente({
  paso,
  lateral,
  children,
}: {
  paso: PasoVisita;
  /** Lo que va debajo de los pasos: la ficha de la propiedad, una nota. */
  lateral?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-wrap items-start gap-8 px-10 py-8">
      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5 lg:max-w-[360px]">
        <PasosVisita actual={paso} />
        {lateral}
      </aside>
      <main className="flex min-w-0 flex-[999_1_620px] flex-col gap-5">{children}</main>
    </div>
  );
}

function PasosVisita({ actual }: { actual: PasoVisita }) {
  return (
    <ol aria-label="Pasos de tu visita" className="flex flex-col gap-1">
      {PASOS.map((texto, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const esActual = n === actual;
        return (
          <li
            key={texto}
            aria-current={esActual ? "step" : undefined}
            className={`flex items-center gap-3 rounded-full px-3.5 py-2.5 ${
              esActual
                ? "bg-tinta font-bold text-white"
                : hecho
                  ? "font-semibold text-montana-hondo"
                  : "text-tinta-suave"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-sm ${
                esActual
                  ? "bg-sol text-tinta"
                  : hecho
                    ? "bg-montana text-white"
                    : "border-[1.5px] border-[#9fb3ae]"
              }`}
            >
              {hecho ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7.5 L6 10 L11 4" />
                </svg>
              ) : (
                n
              )}
            </span>
            {texto}
            {hecho && <span className="sr-only"> (listo)</span>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Burbuja de mensaje del asistente: para el contexto que acompaña una
 * pantalla, con la misma voz que el chat de Telegram.
 */
export function NotaAsistente({ children }: { children: ReactNode }) {
  return (
    <p className="self-start rounded-[20px] rounded-bl-md border border-borde bg-white px-[18px] py-3.5 text-[15px] leading-relaxed text-tinta">
      {children}
    </p>
  );
}
