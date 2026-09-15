"use client";

import { useEffect, useState } from "react";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import { agruparSlotsPorDia, diaLocal, etiquetaDia, horaLocal, semanaHabil } from "@/lib/format";

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; error: HomeliticsError }
  | { tipo: "listo"; slots: string[] };

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Tarea 2.3. Grilla semanal para elegir el nuevo horario al "Mover" una cita
 * ya creada — mismo patrón de GrillaHorarios (tarea 2.1: `/agents/{id}/slots`
 * agrupado por día en hora de Bogotá), pero termina en un botón "Confirmar"
 * en vez de navegar a otra pantalla: CitaAcciones hace el PATCH y decide qué
 * pasa con el resultado (incluido el 409 por solapamiento).
 */
export function SelectorNuevoHorario({
  agentId,
  ahoraISO,
  enviando,
  onConfirmar,
  onCancelar,
}: {
  agentId: string;
  ahoraISO: string;
  enviando: boolean;
  onConfirmar: (iso: string) => void;
  onCancelar: () => void;
}) {
  const [offsetSemana, setOffsetSemana] = useState(0);
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const semana = semanaHabil(ahoraISO, offsetSemana);

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: "cargando" });
    setSeleccionado(null);

    api
      .slots(agentId, semana.desde, semana.hasta)
      .then((resp) => {
        if (!cancelado) setEstado({ tipo: "listo", slots: resp.slots });
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        const error =
          e instanceof HomeliticsError ? e : new HomeliticsError("red", "No se pudo contactar el servicio.");
        setEstado({ tipo: "error", error });
      });

    return () => {
      cancelado = true;
    };
    // semana.desde/semana.hasta dependen solo de agentId + offsetSemana + ahoraISO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, offsetSemana]);

  const agrupados = estado.tipo === "listo" ? agruparSlotsPorDia(estado.slots) : [];
  const porDia = new Map(agrupados.map((g) => [g.dia, g.slots]));

  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffsetSemana((o) => o - 1)}
          disabled={offsetSemana <= 0 || enviando}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Semana anterior
        </button>
        <p className="text-sm font-medium text-neutral-700">{formatearRangoSemana(semana.dias)}</p>
        <button
          type="button"
          onClick={() => setOffsetSemana((o) => o + 1)}
          disabled={enviando}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
        >
          Semana siguiente →
        </button>
      </div>

      {estado.tipo === "cargando" && (
        <p className="mt-4 text-center text-sm text-neutral-500">Buscando horarios disponibles…</p>
      )}

      {estado.tipo === "error" && (
        <p className="mt-4 text-center text-sm text-red-700">
          {estado.error.kind === "red"
            ? "No pudimos conectarnos con el servicio. Puede estar despertando, intenta de nuevo."
            : estado.error.detail}
        </p>
      )}

      {estado.tipo === "listo" && estado.slots.length === 0 && (
        <p className="mt-4 text-center text-sm text-neutral-500">
          No hay horarios libres esta semana. Prueba con la semana siguiente.
        </p>
      )}

      {estado.tipo === "listo" && estado.slots.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {semana.dias.map((diaISO) => {
            const clave = diaLocal(diaISO);
            const slotsDelDia = porDia.get(clave) ?? [];
            return (
              <div key={clave} className="rounded border border-neutral-100 p-2">
                <p className="mb-2 text-center text-xs font-medium text-neutral-700">
                  {capitalizar(etiquetaDia(diaISO))}
                </p>
                {slotsDelDia.length === 0 ? (
                  <p className="text-center text-xs text-neutral-400">Sin horarios</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {slotsDelDia.map((slot) => {
                      const activo = slot === seleccionado;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={enviando}
                          onClick={() => setSeleccionado(slot)}
                          className={
                            "rounded border px-2 py-1 text-xs disabled:cursor-not-allowed " +
                            (activo
                              ? "border-neutral-900 bg-neutral-900 text-white"
                              : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400")
                          }
                        >
                          {horaLocal(slot)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={!seleccionado || enviando}
          onClick={() => seleccionado && onConfirmar(seleccionado)}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando ? "Moviendo…" : "Confirmar nuevo horario"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** "Semana del lun 15 al vie 19" a partir de los cinco días lunes-viernes. */
function formatearRangoSemana(dias: string[]): string {
  return `Semana del ${etiquetaDia(dias[0])} al ${etiquetaDia(dias[dias.length - 1])}`;
}
