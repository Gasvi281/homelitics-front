"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { Appointment, AppointmentStatus } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";
import { EncuestaAcciones } from "@/components/EncuestaAcciones";

type Estado =
  | { tipo: "verificando" }
  | { tipo: "preguntar_asistencia" }
  | { tipo: "completando" }
  | { tipo: "no_asistio" }
  | { tipo: "no_aplica"; motivo: string }
  | { tipo: "ya_enviada" }
  | { tipo: "lista" }
  | { tipo: "error"; mensaje: string };

/**
 * PARCHE PROVISIONAL — bloqueo 2 de docs/SPRINT_LINEA2.md, acordado con el
 * equipo, no asumido.
 *
 * `POST /appointments/{id}/feedback` devuelve 409 si la visita no está en
 * `COMPLETED`, pero ningún flujo del sistema la pone en ese estado sola: ni
 * el cliente ni el agente tienen hoy un botón de "marcar como realizada". El
 * AC de HU-14 pide que el formulario "aparezca como pendiente después de la
 * fecha y hora de la visita", que no es lo mismo que `COMPLETED`.
 *
 * Esta función cierra esa brecha con `PATCH {"status":"COMPLETED"}`, que es
 * TERMINAL e irreversible. Por eso solo se llama cuando el cliente responde
 * "Sí, fui a la visita" (`confirmarAsistencia`), nunca por solo abrir el
 * link, y solo sobre `COMPLETABLE`: una visita que el agente nunca confirmó
 * no se da por realizada. Es la única función del repo que hace esa llamada
 * con ese propósito — si la línea 1 agrega una forma real de cerrar visitas
 * (o cambia la regla del 409), se borra esta función completa y el paso de
 * `preguntar_asistencia`, sin tocar nada más de la pantalla.
 */
async function completarVisitaProvisional(cita: Appointment): Promise<Appointment> {
  return api.actualizarCita(cita.id, { status: "COMPLETED" });
}

/** Únicos estados que se pueden dar por realizados: la visita estaba en pie. */
const COMPLETABLE: ReadonlySet<AppointmentStatus> = new Set(["CONFIRMED", "RESCHEDULED"]);

const MOTIVO_NO_APLICA: Partial<Record<AppointmentStatus, string>> = {
  PENDING_CONFIRMATION: "El agente nunca confirmó esta visita, así que no hay encuesta pendiente.",
  CANCELLED: "Esta visita se canceló, así que la encuesta ya no aplica.",
  NO_SHOW: "Quedó registrado que no se presentó a esta visita, así que la encuesta no aplica.",
};

function estadoInicial(cita: Appointment): Estado {
  if (cita.status === "COMPLETED") return { tipo: "verificando" };
  if (COMPLETABLE.has(cita.status)) return { tipo: "preguntar_asistencia" };
  return {
    tipo: "no_aplica",
    motivo: MOTIVO_NO_APLICA[cita.status] ?? "Esta visita ya no admite encuesta.",
  };
}

/**
 * Único Client Component de `.../encuesta`. Lo que es de solo lectura (cita
 * inexistente, visita que todavía no ha pasado) lo resuelve `page.tsx` en el
 * servidor. Todo lo que implica escribir — marcar `COMPLETED` (arriba) y el
 * envío del formulario — y la comprobación de si ya hay encuesta
 * (`GET .../feedback`) viven acá a propósito: tienen que pasar por la MISMA
 * mitad del API. Con `USE_MOCKS=true` cada mitad (`lib/homelitics.ts` en el
 * servidor, `lib/homelitics-navegador.ts` en el navegador) tiene su propia
 * copia en memoria de `lib/mock/`, sin estado compartido entre ellas (mismo
 * límite que ya se documentó en la bitácora de la tarea 2.3); si el `PATCH`
 * se hiciera en el servidor y el `POST` del formulario en el navegador, el
 * envío fallaría siempre con 409 contra el mock.
 */
export function EncuestaFlujo({
  appointmentId,
  citaInicial,
}: {
  appointmentId: string;
  citaInicial: Appointment;
}) {
  const [estado, setEstado] = useState<Estado>(() => estadoInicial(citaInicial));

  // Solo una visita ya COMPLETED puede tener encuesta previa: el API no
  // acepta feedback antes de ese estado.
  useEffect(() => {
    if (citaInicial.status !== "COMPLETED") return;
    let cancelado = false;

    api.feedbackDeCita(appointmentId).then(
      (previo) => {
        if (cancelado) return;
        setEstado(
          previo.some((f) => f.submitted_by === "CLIENT") ? { tipo: "ya_enviada" } : { tipo: "lista" },
        );
      },
      (e) => {
        if (!cancelado) setEstado({ tipo: "error", mensaje: mensajeError(e) });
      },
    );

    return () => {
      cancelado = true;
    };
  }, [appointmentId, citaInicial.status]);

  async function confirmarAsistencia() {
    setEstado({ tipo: "completando" });
    try {
      await completarVisitaProvisional(citaInicial);
      // Recién quedó COMPLETED: no puede haber encuesta previa, el API la
      // habría rechazado antes de este PATCH.
      setEstado({ tipo: "lista" });
    } catch (e) {
      if (e instanceof HomeliticsError && e.kind === "conflicto") {
        setEstado({
          tipo: "no_aplica",
          motivo: "Esta visita cambió de estado mientras tanto y ya no admite encuesta.",
        });
        return;
      }
      setEstado({ tipo: "error", mensaje: mensajeError(e) });
    }
  }

  if (estado.tipo === "verificando") {
    return <Aviso>Un momento, estamos revisando tu visita…</Aviso>;
  }
  if (estado.tipo === "preguntar_asistencia") {
    return (
      <div className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-700">
        <p>Antes de la encuesta: ¿sí pudiste ir a la visita?</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={confirmarAsistencia}
            className="rounded bg-neutral-900 px-4 py-2 text-center font-medium text-white"
          >
            Sí, fui a la visita
          </button>
          <button
            type="button"
            onClick={() => setEstado({ tipo: "no_asistio" })}
            className="rounded border border-neutral-300 px-4 py-2 text-center font-medium text-neutral-700"
          >
            No, no pude ir
          </button>
        </div>
      </div>
    );
  }
  if (estado.tipo === "completando") {
    return <p className="text-sm text-neutral-500">Guardando…</p>;
  }
  if (estado.tipo === "no_asistio") {
    return (
      <Aviso>
        Entendido, no marcamos nada. Si quieres, puedes{" "}
        <Link className="underline" href={`/citas/${appointmentId}`}>
          buscar un nuevo horario para la visita
        </Link>
        .
      </Aviso>
    );
  }
  if (estado.tipo === "no_aplica") {
    return <Aviso variante="error">{estado.motivo}</Aviso>;
  }
  if (estado.tipo === "error") {
    return <Aviso variante="error">{estado.mensaje}</Aviso>;
  }
  if (estado.tipo === "ya_enviada") {
    return <Aviso>Ya enviaste tu encuesta sobre esta visita. Gracias por tu tiempo.</Aviso>;
  }

  return <EncuestaAcciones appointmentId={appointmentId} />;
}

function mensajeError(e: unknown): string {
  if (e instanceof HomeliticsError) {
    if (e.kind === "red") return "No pudimos conectarnos con el servicio. Intenta de nuevo.";
    return e.detail;
  }
  return "Algo salió mal. Intenta de nuevo.";
}
