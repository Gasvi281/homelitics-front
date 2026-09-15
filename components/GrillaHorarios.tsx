"use client";

import Link from "next/link";
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
 * Tarea 2.1. Único Client Component de la pantalla: tiene selección y
 * navegación de semana, así que necesita estado real.
 *
 * El agentId que recibe es el del LEAD, no el del listing (ver
 * docs/API_CONTRACT.md, sección de /agents/{id}/slots) — lo resuelve
 * page.tsx antes de montar este componente.
 */
export function GrillaHorarios({
  agentId,
  leadId,
  listingId,
  ahoraISO,
}: {
  agentId: string;
  leadId: string;
  listingId: string;
  ahoraISO: string;
}) {
  const [offsetSemana, setOffsetSemana] = useState(0);
  const [intento, setIntento] = useState(0);
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
        const error = e instanceof HomeliticsError
          ? e
          : new HomeliticsError("red", "No se pudo contactar el servicio.");
        setEstado({ tipo: "error", error });
      });

    return () => {
      cancelado = true;
    };
    // semana.desde/semana.hasta dependen solo de agentId + offsetSemana + ahoraISO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, offsetSemana, intento]);

  const agrupados = estado.tipo === "listo" ? agruparSlotsPorDia(estado.slots) : [];
  const porDia = new Map(agrupados.map((g) => [g.dia, g.slots]));

  const params = new URLSearchParams();
  if (seleccionado) {
    params.set("leadId", leadId);
    params.set("horario", seleccionado);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffsetSemana((o) => o - 1)}
          disabled={offsetSemana <= 0}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Semana anterior
        </button>
        <p className="text-sm font-medium text-neutral-700">
          {formatearRangoSemana(semana.dias)}
        </p>
        <button
          type="button"
          onClick={() => setOffsetSemana((o) => o + 1)}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
        >
          Semana siguiente →
        </button>
      </div>

      {estado.tipo === "cargando" && (
        <div className="mt-6 rounded-lg border border-neutral-200 p-8 text-center text-sm text-neutral-500">
          <p>Buscando horarios disponibles…</p>
          <p className="mt-1 text-xs text-neutral-400">
            La primera consulta del día puede tardar hasta un minuto: el servicio se duerme sin uso.
          </p>
        </div>
      )}

      {estado.tipo === "error" && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          <p>
            {estado.error.kind === "red"
              ? "No pudimos conectarnos con el servicio. Puede estar despertando, intenta de nuevo."
              : estado.error.detail}
          </p>
          <button
            type="button"
            onClick={() => setIntento((i) => i + 1)}
            className="mt-3 rounded border border-red-300 px-3 py-1.5 text-red-700"
          >
            Reintentar
          </button>
        </div>
      )}

      {estado.tipo === "listo" && estado.slots.length === 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 p-8 text-center text-sm text-neutral-500">
          No hay horarios libres esta semana. Prueba con la semana siguiente.
        </div>
      )}

      {estado.tipo === "listo" && estado.slots.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {semana.dias.map((diaISO) => {
            const clave = diaLocal(diaISO);
            const slotsDelDia = porDia.get(clave) ?? [];
            return (
              <div key={clave} className="rounded-lg border border-neutral-200 p-3">
                <p className="mb-2 text-center text-sm font-medium text-neutral-700">
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
                          onClick={() => setSeleccionado(slot)}
                          className={
                            "rounded border px-2 py-1.5 text-sm " +
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

      <div className="mt-6">
        {seleccionado ? (
          <Link
            href={`/propiedades/${listingId}/agendar/confirmar?${params.toString()}`}
            className="block w-full rounded bg-neutral-900 px-4 py-3 text-center font-medium text-white sm:w-auto sm:inline-block"
          >
            Continuar
          </Link>
        ) : (
          <span className="block w-full cursor-not-allowed rounded bg-neutral-200 px-4 py-3 text-center font-medium text-neutral-400 sm:w-auto sm:inline-block">
            Continuar
          </span>
        )}
      </div>
    </div>
  );
}

/** "Semana del lun 15 al vie 19" a partir de los cinco días lunes-viernes. */
function formatearRangoSemana(dias: string[]): string {
  return `Semana del ${etiquetaDia(dias[0])} al ${etiquetaDia(dias[dias.length - 1])}`;
}
