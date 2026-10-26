"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import { TERMINAL_APPOINTMENT_STATUS, type Appointment, type Channel } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";
import { TarjetaCita } from "@/components/TarjetaCita";
import { SelectorNuevoHorario } from "@/components/SelectorNuevoHorario";
import { fechaHoraLarga } from "@/lib/format";

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
    <div className="flex flex-col gap-5">
      <TarjetaCita
        scheduledAt={cita.scheduled_at}
        durationMin={cita.duration_min}
        status={cita.status}
        direccion={direccion}
        canalContacto={canalContacto}
      />

      {esTerminal && (
        <Aviso>{MOTIVO_TERMINAL[cita.status] ?? "Esta visita ya no se puede modificar."}</Aviso>
      )}

      {!esTerminal && error && modo.tipo === "normal" && <Aviso variante="error">{error}</Aviso>}

      {modo.tipo === "normal" && (
        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            disabled={esTerminal}
            onClick={() => {
              setError(null);
              setModo({ tipo: "moviendo" });
            }}
            className="btn btn-lg btn-secundario disabled:border-dashed disabled:border-borde-fuerte disabled:bg-[#f5f8f7] disabled:text-[#6c7e7b] disabled:opacity-100"
          >
            Mover la visita
          </button>
          <button
            type="button"
            disabled={esTerminal}
            onClick={() => {
              setError(null);
              setModo({ tipo: "confirmando_cancelacion" });
            }}
            className="btn btn-lg btn-peligro disabled:border-dashed disabled:border-borde-fuerte disabled:bg-[#f5f8f7] disabled:text-[#6c7e7b] disabled:opacity-100"
          >
            Cancelar la visita
          </button>
        </div>
      )}

      {(modo.tipo === "confirmando_cancelacion" || modo.tipo === "cancelando") && (
        <section
          role="alertdialog"
          aria-labelledby="cancelar-titulo"
          aria-describedby="cancelar-texto"
          className="flex flex-col gap-3.5 rounded-3xl border-2 border-alerta bg-white p-7"
        >
          <h2 id="cancelar-titulo" className="font-display text-[28px] leading-tight font-bold tracking-[-0.015em]">
            ¿Cancelar la visita del {fechaHoraLarga(cita.scheduled_at)}?
          </h2>
          <p id="cancelar-texto" className="max-w-[60ch] text-base leading-relaxed text-tinta-suave">
            Cancelar es definitivo: no se puede deshacer ni reagendar después. Si solo necesitas
            otro día, mejor muévela.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2.5">
            <button
              type="button"
              autoFocus
              onClick={confirmarCancelacion}
              disabled={modo.tipo === "cancelando"}
              className="btn btn-lg btn-peligro-lleno"
            >
              {modo.tipo === "cancelando" ? "Cancelando…" : "Sí, cancelar la visita"}
            </button>
            <button
              type="button"
              onClick={() => setModo({ tipo: "normal" })}
              disabled={modo.tipo === "cancelando"}
              className="btn btn-lg btn-secundario"
            >
              No, mantener la visita
            </button>
            <button
              type="button"
              onClick={() => setModo({ tipo: "moviendo" })}
              disabled={modo.tipo === "cancelando"}
              className="btn btn-lg bg-transparent text-plano underline hover:text-plano-hondo"
            >
              Mejor moverla
            </button>
          </div>
        </section>
      )}

      {(modo.tipo === "moviendo" || modo.tipo === "guardando_movimiento") && (
        <section aria-label="Mover la visita" className="flex flex-col gap-4 rounded-3xl border-2 border-plano bg-white px-7 py-6">
          {error && <Aviso variante="error">{error}</Aviso>}
          <SelectorNuevoHorario
            key={intentoMover}
            agentId={cita.agent_id}
            horarioActual={cita.scheduled_at}
            ahoraISO={new Date().toISOString()}
            enviando={modo.tipo === "guardando_movimiento"}
            onConfirmar={confirmarNuevoHorario}
            onCancelar={() => {
              setModo({ tipo: "normal" });
              setError(null);
            }}
          />
        </section>
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
