"use client";

import { useEffect, useState } from "react";
import { apiPublico, HomeliticsError } from "@/lib/homelitics-navegador";
import { agruparSlotsPorDia, diaLocal, fechaHoraLarga, horaLocal, semanaHabil } from "@/lib/format";
import { Aviso } from "@/components/Aviso";
import { Cargando } from "@/components/Cargando";
import { ColumnasHorarios, NavSemana } from "@/components/SemanaHorarios";

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; error: HomeliticsError }
  | { tipo: "listo"; slots: string[] };

/**
 * Tarea 2.3. Grilla semanal para elegir el nuevo horario al "Mover" una cita
 * ya creada — mismo patrón de GrillaHorarios (tarea 2.1: `/agents/{id}/slots`
 * agrupado por día en hora de Bogotá), pero termina en un botón "Confirmar"
 * en vez de navegar a otra pantalla: CitaAcciones hace el PATCH y decide qué
 * pasa con el resultado (incluido el 409 por solapamiento).
 */
export function SelectorNuevoHorario({
  agentId,
  horarioActual,
  ahoraISO,
  enviando,
  onConfirmar,
  onCancelar,
}: {
  agentId: string;
  /** Cuándo es la visita hoy, para decir "de … a …" antes de confirmar. */
  horarioActual: string;
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

    apiPublico
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">Elige el nuevo horario</h2>
        <NavSemana
          dias={semana.dias}
          puedeAtras={offsetSemana > 0}
          deshabilitado={enviando}
          alAtras={() => setOffsetSemana((o) => o - 1)}
          alAdelante={() => setOffsetSemana((o) => o + 1)}
        />
      </div>

      {estado.tipo === "cargando" && <Cargando compacto mensaje="Buscando horarios disponibles…" />}

      {estado.tipo === "error" && (
        <Aviso variante="error">
          {estado.error.kind === "red"
            ? "No pudimos conectarnos con el servicio. Puede estar despertando, intenta de nuevo."
            : estado.error.detail}
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
          deshabilitado={enviando}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base">
          {seleccionado ? (
            <>
              De <strong>{fechaHoraLarga(horarioActual)}</strong> a{" "}
              <strong>{fechaHoraLarga(seleccionado)}</strong>
            </>
          ) : (
            <span className="text-tinta-suave">Elige un horario para ver el cambio.</span>
          )}
        </p>
        <div className="flex gap-2.5">
          <button type="button" onClick={onCancelar} disabled={enviando} className="btn bg-transparent text-tinta underline">
            Dejarla como estaba
          </button>
          <button
            type="button"
            disabled={!seleccionado || enviando}
            onClick={() => seleccionado && onConfirmar(seleccionado)}
            className="btn btn-primario"
          >
            {enviando ? "Moviendo…" : seleccionado ? `Mover a las ${horaLocal(seleccionado)}` : "Mover la visita"}
          </button>
        </div>
      </div>
    </div>
  );
}
