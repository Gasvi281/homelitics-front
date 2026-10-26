"use client";

import { useId, useState, type FormEvent } from "react";
import { UMBRAL_MAX, UMBRAL_MIN, esUmbralValido } from "@/lib/umbral";
import { useUmbral } from "@/lib/umbral-navegador";

/** Los valores de un clic. Cualquier otro entra por "otro". */
const OPCIONES = [12, 24, 48, 72] as const;

/**
 * Selector del umbral de horas sin respuesta (HU-10 AC1, tarea 2.14). Lo
 * montan los filtros del tablero (2.16) y el reporte de riesgo (2.17); el valor
 * vive en lib/umbral.ts y cambiarlo aquí lo cambia en todas las pantallas.
 *
 * `inicial` es lo que leyó el servidor con `leerUmbral()`: evita que el
 * selector parpadee de 24 al valor real al hidratar.
 */
export function SelectorUmbral({ inicial }: { inicial?: number }) {
  const id = useId();
  const idError = `${id}-error`;
  const [umbral, cambiarUmbral] = useUmbral(inicial);
  const esOtro = !(OPCIONES as readonly number[]).includes(umbral);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);

  function elegir(horas: number) {
    setAbierto(false);
    setError(null);
    cambiarUmbral(horas);
  }

  function abrirOtro() {
    setTexto(esOtro ? String(umbral) : "");
    setError(null);
    setAbierto(true);
  }

  function guardarOtro(e: FormEvent) {
    e.preventDefault();
    const horas = Number(texto.trim());
    if (texto.trim() === "" || !esUmbralValido(horas)) {
      setError(`Escribe un número entero de horas entre ${UMBRAL_MIN} y ${UMBRAL_MAX}.`);
      return;
    }
    elegir(horas);
  }

  const boton = (activo: boolean) =>
    `inline-flex h-9 items-center rounded-full px-3.5 text-sm font-bold ${
      activo ? "bg-tinta text-white" : "border-[1.5px] border-borde-fuerte bg-white text-tinta hover:border-tinta"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={`${id}-etiqueta`} className="text-sm font-bold text-tinta">
        Sin respuesta hace más de
      </span>
      <div role="group" aria-labelledby={`${id}-etiqueta`} className="flex flex-wrap items-center gap-1">
        {OPCIONES.map(h => (
          <button
            key={h}
            type="button"
            onClick={() => elegir(h)}
            aria-pressed={umbral === h}
            className={boton(umbral === h)}
          >
            {h} h
          </button>
        ))}
        {!abierto && (
          <button type="button" onClick={abrirOtro} aria-pressed={esOtro} className={boton(esOtro)}>
            {esOtro ? `${umbral} h` : "Otro"}
          </button>
        )}
      </div>

      {abierto && (
        // noValidate: el rango se frena aquí, con este mensaje y no el globo del navegador.
        <form onSubmit={guardarOtro} noValidate className="flex flex-wrap items-center gap-1">
          <label htmlFor={id} className="sr-only">Horas sin respuesta</label>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={UMBRAL_MIN}
            max={UMBRAL_MAX}
            step={1}
            value={texto}
            onChange={e => {
              setTexto(e.target.value);
              setError(null);
            }}
            autoFocus
            aria-invalid={error !== null}
            aria-describedby={error ? idError : undefined}
            className="h-9 w-20 rounded-full border-[1.5px] border-borde-fuerte bg-white px-3 text-sm font-semibold text-tinta"
          />
          <span className="text-sm text-tinta">h</span>
          <button type="submit" className={boton(true)}>Usar este umbral</button>
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              setError(null);
            }}
            className="px-2 py-1 text-sm text-tinta-suave underline"
          >
            Cancelar
          </button>
        </form>
      )}

      {error && (
        <p id={idError} className="w-full text-xs text-alerta-hondo">{error}</p>
      )}
    </div>
  );
}
