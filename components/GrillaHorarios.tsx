"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiPublico, HomeliticsError } from "@/lib/homelitics-navegador";
import { agruparSlotsPorDia, diaLocal, fechaLarga, horaFin, horaLocal, semanaHabil } from "@/lib/format";
import { Aviso } from "@/components/Aviso";
import { Cargando } from "@/components/Cargando";
import { ColumnasHorarios, NavSemana } from "@/components/SemanaHorarios";

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; error: HomeliticsError }
  | { tipo: "listo"; slots: string[] };

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

    apiPublico
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
    <section className="panel flex flex-col gap-5 px-8 py-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-pagina">¿Cuándo quieres conocerla?</h1>
          <p className="mt-1.5 text-base text-tinta-suave">
            Solo ves los horarios en que tu asesor está libre. Cada visita dura 30 minutos.
          </p>
        </div>
        <NavSemana
          dias={semana.dias}
          puedeAtras={offsetSemana > 0}
          alAtras={() => setOffsetSemana((o) => o - 1)}
          alAdelante={() => setOffsetSemana((o) => o + 1)}
        />
      </div>

      {estado.tipo === "cargando" && <Cargando mensaje="Buscando horarios disponibles…" />}

      {estado.tipo === "error" && (
        <Aviso variante="error">
          <p>
            {estado.error.kind === "red"
              ? "No pudimos conectarnos con el servicio. Puede estar despertando, intenta de nuevo."
              : estado.error.detail}
          </p>
          <button type="button" onClick={() => setIntento((i) => i + 1)} className="btn btn-sm btn-peligro mt-3">
            Reintentar
          </button>
        </Aviso>
      )}

      {estado.tipo === "listo" && estado.slots.length === 0 && (
        <Aviso>No hay horarios libres esta semana. Prueba con la semana siguiente.</Aviso>
      )}

      {estado.tipo === "listo" && estado.slots.length > 0 && (
        <ColumnasHorarios
          dias={semana.dias}
          claveDia={diaLocal}
          porDia={porDia}
          seleccionado={seleccionado}
          alElegir={setSeleccionado}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-tinta px-5 py-4 text-white">
        {seleccionado ? (
          <div>
            <span className="block text-sm text-sobre-tinta">Elegiste</span>
            <strong className="block font-display text-[22px] font-bold first-letter:uppercase">
              {fechaLarga(seleccionado)}, de {horaLocal(seleccionado)} a {horaFin(seleccionado, 30)}
            </strong>
          </div>
        ) : (
          <span className="text-base text-sobre-tinta">Elige un horario de la grilla para seguir.</span>
        )}
        {seleccionado ? (
          <Link
            href={`/propiedades/${listingId}/agendar/confirmar?${params.toString()}`}
            className="btn btn-lg bg-sol font-extrabold text-tinta hover:bg-[#ffd666] focus-visible:outline-sol"
          >
            Continuar
          </Link>
        ) : (
          <span aria-disabled="true" className="btn btn-lg cursor-not-allowed bg-tinta-hondo text-sobre-tinta">
            Continuar
          </span>
        )}
      </div>
    </section>
  );
}

