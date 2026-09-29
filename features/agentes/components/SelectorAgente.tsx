"use client";

import { useId } from "react";
import { nombreAgente, useAgentes } from "../hooks";

/**
 * Selector de agente de la agencia: el destino de una reasignación (HU-08)
 * o el filtro por agente del embudo (HU-17). Un `<select>` nativo con su
 * `<label>`, así teclado y lector de pantalla funcionan sin más.
 *
 * Mientras GET /agents no exista en el API (`useAgentes()` en "pendiente")
 * queda deshabilitado y lo dice; no es un error del usuario ni del servicio.
 */
export function SelectorAgente({
  valor,
  alCambiar,
  etiqueta = "Agente",
  opcionVacia = "Elige un agente",
  excluir = [],
  soloActivos = false,
  deshabilitado = false,
  requerido = false,
  autoFocus = false,
}: {
  /** `id` del agente elegido, o `""` si ninguno. */
  valor: string;
  alCambiar: (agentId: string) => void;
  etiqueta?: string;
  /** Texto de la opción sin agente: "Elige un agente", "Todos los agentes"… */
  opcionVacia?: string;
  /** Ids que no se ofrecen; p. ej. el dueño actual del lead al reasignar. */
  excluir?: readonly string[];
  /** Solo agentes activos: a uno desactivado no se le puede reasignar (409). */
  soloActivos?: boolean;
  deshabilitado?: boolean;
  requerido?: boolean;
  /** Foco inicial, p. ej. dentro de un `<dialog>`. Deshabilitado no lo toma. */
  autoFocus?: boolean;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const estado = useAgentes();

  const opciones =
    estado.estado === "disponible"
      ? estado.agentes
          .filter(a => !excluir.includes(a.id) && (!soloActivos || a.active))
          .sort((a, b) => nombreAgente(a).localeCompare(nombreAgente(b), "es"))
      : [];

  const ayuda =
    estado.estado === "pendiente" ? "Disponible cuando el API liste los agentes"
    : estado.estado === "error" ? "No se pudieron cargar los agentes."
    : estado.estado === "disponible" && opciones.length === 0 ? "No hay otros agentes para elegir."
    : null;

  const textoVacio = estado.estado === "cargando" ? "Cargando agentes…" : opcionVacia;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
        {etiqueta}
      </label>
      <select
        id={id}
        value={estado.estado === "disponible" ? valor : ""}
        onChange={e => alCambiar(e.target.value)}
        disabled={deshabilitado || estado.estado !== "disponible" || opciones.length === 0}
        required={requerido}
        autoFocus={autoFocus}
        aria-describedby={ayuda ? idAyuda : undefined}
        className="mt-1 w-full rounded border border-neutral-300 bg-white p-2 text-sm text-neutral-900 disabled:opacity-60"
      >
        <option value="">{textoVacio}</option>
        {opciones.map(a => (
          <option key={a.id} value={a.id}>
            {nombreAgente(a)}{a.active ? "" : " (inactivo)"}
          </option>
        ))}
      </select>
      {ayuda && (
        <p
          id={idAyuda}
          className={`mt-1 text-xs ${estado.estado === "error" ? "text-red-700" : "text-neutral-500"}`}
        >
          {ayuda}
        </p>
      )}
    </div>
  );
}
