import { horaLocal, partesDia, rangoSemana } from "@/lib/format";

/**
 * Piezas visuales que comparten la grilla para agendar (GrillaHorarios, 2.1)
 * y la de mover una cita (SelectorNuevoHorario, 2.3). Son presentacionales:
 * el estado (semana, selección, carga) vive en cada uno de esos dos.
 */

export function NavSemana({
  dias,
  puedeAtras,
  deshabilitado = false,
  alAtras,
  alAdelante,
}: {
  dias: string[];
  puedeAtras: boolean;
  deshabilitado?: boolean;
  alAtras: () => void;
  alAdelante: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={alAtras}
        disabled={!puedeAtras || deshabilitado}
        aria-label="Semana anterior"
        className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-tinta bg-white text-tinta disabled:cursor-not-allowed disabled:border-borde disabled:bg-neblina disabled:text-[#9fb3ae]"
      >
        <Flecha direccion="izq" />
      </button>
      <span className="min-w-[13rem] text-center font-bold" aria-live="polite">
        {rangoSemana(dias)}
      </span>
      <button
        type="button"
        onClick={alAdelante}
        disabled={deshabilitado}
        aria-label="Semana siguiente"
        className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-tinta bg-white text-tinta disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Flecha direccion="der" />
      </button>
    </div>
  );
}

/**
 * Cinco columnas, lunes a viernes. Un día sin horarios libres se dice con
 * texto: `/slots` solo trae lo libre, así que no se pinta "ocupado" (ver la
 * nota de 2.1 en docs/SPRINT_LINEA2.md).
 */
export function ColumnasHorarios({
  dias,
  claveDia,
  porDia,
  seleccionado,
  alElegir,
  deshabilitado = false,
}: {
  dias: string[];
  claveDia: (iso: string) => string;
  porDia: Map<string, string[]>;
  seleccionado: string | null;
  alElegir: (slot: string) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 rounded-2xl border border-hoja bg-[#f5f8f7] p-4">
      {dias.map(diaISO => {
        const { semana, numero } = partesDia(diaISO);
        const slots = porDia.get(claveDia(diaISO)) ?? [];
        return (
          <div key={diaISO} className="flex min-w-0 flex-col gap-2">
            <p className="pb-1.5 text-center">
              <span className="block text-[13px] text-tinta-tenue first-letter:uppercase">{semana}</span>
              <span className="font-display text-[22px] font-bold">{numero}</span>
            </p>
            {slots.length === 0 ? (
              <p className="rounded-full border-[1.5px] border-dashed border-[#dce5e2] px-2 py-2 text-center text-[13px] text-tinta-tenue">
                Sin horarios
              </p>
            ) : (
              slots.map(slot => {
                const activo = slot === seleccionado;
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={deshabilitado}
                    onClick={() => alElegir(slot)}
                    aria-pressed={activo}
                    className={`h-10 rounded-full text-sm transition-colors disabled:cursor-not-allowed ${
                      activo
                        ? "border-2 border-tinta bg-sol font-extrabold text-tinta"
                        : "border-[1.5px] border-borde-fuerte bg-white font-semibold text-tinta hover:border-tinta"
                    }`}
                  >
                    {horaLocal(slot)}
                  </button>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

function Flecha({ direccion }: { direccion: "izq" | "der" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d={direccion === "izq" ? "M10 3 L5 8 L10 13" : "M6 3 L11 8 L6 13"} />
    </svg>
  );
}
