"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import { TERMINAL_APPOINTMENT_STATUS, type Appointment, type Channel } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";
import { TarjetaCita } from "@/components/TarjetaCita";
import { SelectorNuevoHorario } from "@/components/SelectorNuevoHorario";

type Modo =
  | { tipo: "normal" }
  | { tipo: "confirmando_cancelacion" }
  | { tipo: "cancelando" }
  | { tipo: "moviendo" }
  | { tipo: "guardando_movimiento" };

/** No hay campo de "motivo" en el API: se deriva del estado terminal mismo. */
const MOTIVO_TERMINAL: Partial<Record<Appointment["status"], string>> = {
  CANCELLED: "Esta visita está cancelada. No se puede mover ni cancelar de nuevo.",
  COMPLETED: "Esta visita ya se realizó. No se puede modificar.",
  NO_SHOW: "El cliente no se presentó a esta visita. No se puede modificar.",
};

/**
 * Tarea 2.3 — HU-02. Único Client Component de `(cliente)/citas/[appointmentId]`:
 * mueve, cancela, y hace la relectura periódica que pide el criterio de
 * "tiempo real" (el API no tiene websockets, así que es un `refetchInterval`
 * de TanStack Query sobre `GET /appointments/{id}`, con la cita ya traída en
 * el servidor como `initialData`). Así, si el estado cambia por otro lado —el
 * agente lo confirma o lo cancela, u otra pestaña del mismo cliente lo mueve—
 * esta pantalla lo refleja sin que nadie recargue.
 *
 * CANCELLED, COMPLETED y NO_SHOW son terminales (docs/API_CONTRACT.md): las
 * acciones se deshabilitan y el motivo queda a la vista. Cancelar se advierte
 * ANTES de mandarlo, no después — es irreversible.
 */
export function CitaAcciones({
  appointmentId,
  citaInicial,
  direccion,
  canalContacto,
}: {
  appointmentId: string;
  citaInicial: Appointment;
  direccion?: string | null;
  canalContacto?: Channel;
}) {
  const queryClient = useQueryClient();
  const { data: cita } = useQuery({
    queryKey: ["cita", appointmentId],
    queryFn: () => api.cita(appointmentId),
    initialData: citaInicial,
    refetchInterval: 5000,
  });

  const [modo, setModo] = useState<Modo>({ tipo: "normal" });
  const [error, setError] = useState<string | null>(null);
  const [intentoMover, setIntentoMover] = useState(0);

  const esTerminal = TERMINAL_APPOINTMENT_STATUS.includes(
    cita.status as (typeof TERMINAL_APPOINTMENT_STATUS)[number],
  );

  // Si la cita quedó terminal mientras el cliente tenía abierto un flujo de
  // mover o cancelar (p. ej. el agente la marcó COMPLETED primero, o llegó
  // por la relectura de otra pestaña), no lo dejamos en un flujo que ya no
  // tiene sentido.
  useEffect(() => {
    if (esTerminal && modo.tipo !== "normal") {
      setModo({ tipo: "normal" });
      setError(null);
    }
  }, [esTerminal, modo.tipo]);

  function guardarEnCache(actualizada: Appointment) {
    queryClient.setQueryData(["cita", appointmentId], actualizada);
  }

  async function confirmarCancelacion() {
    setModo({ tipo: "cancelando" });
    setError(null);
    try {
      const actualizada = await api.actualizarCita(appointmentId, { status: "CANCELLED" });
      guardarEnCache(actualizada);
      setModo({ tipo: "normal" });
    } catch (e) {
      setError(mensajeErrorAccion(e));
      setModo({ tipo: "normal" });
    }
  }

  async function confirmarNuevoHorario(iso: string) {
    setModo({ tipo: "guardando_movimiento" });
    setError(null);
    try {
      const actualizada = await api.actualizarCita(appointmentId, { scheduled_at: iso });
      guardarEnCache(actualizada);
      setModo({ tipo: "normal" });
    } catch (e) {
      if (e instanceof HomeliticsError && e.kind === "conflicto") {
        setError("Ese horario se ocupó mientras lo elegías. Elige otro.");
        setIntentoMover((n) => n + 1);
        setModo({ tipo: "moviendo" });
        return;
      }
      setError(mensajeErrorAccion(e));
      setModo({ tipo: "moviendo" });
    }
  }

  return (
    <div className="mt-6">
      <TarjetaCita
        scheduledAt={cita.scheduled_at}
        durationMin={cita.duration_min}
        status={cita.status}
        direccion={direccion}
        canalContacto={canalContacto}
      />

      {esTerminal && (
        <div className="mt-4">
          <Aviso>{MOTIVO_TERMINAL[cita.status] ?? "Esta visita ya no se puede modificar."}</Aviso>
        </div>
      )}

      {!esTerminal && error && modo.tipo === "normal" && (
        <p className="mt-4 text-sm text-red-700">{error}</p>
      )}

      {modo.tipo === "normal" && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={esTerminal}
            onClick={() => {
              setError(null);
              setModo({ tipo: "moviendo" });
            }}
            className="rounded border border-neutral-300 px-4 py-3 text-center font-medium text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Mover
          </button>
          <button
            type="button"
            disabled={esTerminal}
            onClick={() => {
              setError(null);
              setModo({ tipo: "confirmando_cancelacion" });
            }}
            className="rounded border border-red-300 px-4 py-3 text-center font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancelar la visita
          </button>
        </div>
      )}

      {modo.tipo === "confirmando_cancelacion" && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>Cancelar es definitivo: no se puede deshacer ni reagendar después. ¿Confirmas?</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={confirmarCancelacion}
              className="rounded bg-red-700 px-4 py-2 text-center font-medium text-white"
            >
              Sí, cancelar la visita
            </button>
            <button
              type="button"
              onClick={() => setModo({ tipo: "normal" })}
              className="rounded border border-red-300 px-4 py-2 text-center font-medium text-red-700"
            >
              No, mantener la cita
            </button>
          </div>
        </div>
      )}

      {modo.tipo === "cancelando" && (
        <p className="mt-4 text-sm text-neutral-500">Cancelando…</p>
      )}

      {(modo.tipo === "moviendo" || modo.tipo === "guardando_movimiento") && (
        <div className="mt-4">
          {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
          <SelectorNuevoHorario
            key={intentoMover}
            agentId={cita.agent_id}
            ahoraISO={new Date().toISOString()}
            enviando={modo.tipo === "guardando_movimiento"}
            onConfirmar={confirmarNuevoHorario}
            onCancelar={() => {
              setModo({ tipo: "normal" });
              setError(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function mensajeErrorAccion(e: unknown): string {
  if (e instanceof HomeliticsError) {
    if (e.kind === "red") return "No pudimos conectarnos con el servicio. Intenta de nuevo.";
    if (e.kind === "conflicto") return "La cita ya no se puede modificar (cambió de estado mientras tanto).";
    return e.detail;
  }
  return "Algo salió mal. Intenta de nuevo.";
}
