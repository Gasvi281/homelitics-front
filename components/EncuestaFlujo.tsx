"use client";

import { useEffect, useState } from "react";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { Appointment, AppointmentStatus } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";
import { EncuestaAcciones } from "@/components/EncuestaAcciones";

type Estado =
  | { tipo: "verificando" }
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
 * Esta función cierra esa brecha: si ya pasó la hora de la visita (lo validó
 * `page.tsx` antes de montar este componente) y todavía no está `COMPLETED`,
 * esta misma pantalla la marca así con `PATCH {"status":"COMPLETED"}` antes
 * de mostrar el formulario. Es la única función del repo que hace esa
 * llamada con ese propósito — si la línea 1 agrega una forma real de cerrar
 * visitas (o cambia la regla del 409), se borra esta función completa y la
 * línea que la llama en `verificar()`, sin tocar nada más de la pantalla.
 *
 * Si la cita ya es terminal en otro estado (`CANCELLED`, `NO_SHOW`), el PATCH
 * da 409 "ya es terminal": ahí no hay nada que completar.
 */
async function completarVisitaProvisional(cita: Appointment): Promise<Appointment> {
  if (cita.status === "COMPLETED") return cita;
  return api.actualizarCita(cita.id, { status: "COMPLETED" });
}

const MOTIVO_NO_APLICA: Partial<Record<AppointmentStatus, string>> = {
  CANCELLED: "Esta visita se canceló, así que la encuesta ya no aplica.",
  NO_SHOW: "Quedó registrado que no se presentó a esta visita, así que la encuesta no aplica.",
};

/**
 * Único Client Component de `.../encuesta`. Todo lo que sigue al filtro de
 * "todavía no ha pasado la visita" (que sí puede resolverse en el servidor,
 * `page.tsx`, porque es de solo lectura) vive acá y no en el servidor a
 * propósito: marcar `COMPLETED` (arriba) y comprobar si ya hay una encuesta
 * (`GET .../feedback`) tienen que pasar por la MISMA mitad del API que el
 * envío del formulario. Con `USE_MOCKS=true` cada mitad (`lib/homelitics.ts`
 * en el servidor, `lib/homelitics-navegador.ts` en el navegador) tiene su
 * propia copia en memoria de `lib/mock/`, sin estado compartido entre ellas
 * (mismo límite que ya se documentó en la bitácora de la tarea 2.3); si el
 * `PATCH` se hiciera en el servidor y el `POST` del formulario en el
 * navegador, el navegador nunca se enteraría de que ya quedó `COMPLETED` y
 * el envío real (2.5) fallaría siempre con 409 contra el mock. Contra el API
 * real no habría problema (una sola base de datos), pero aun así conviene
 * mantener todo el flujo de mutaciones en un solo lado.
 */
export function EncuestaFlujo({
  appointmentId,
  citaInicial,
}: {
  appointmentId: string;
  citaInicial: Appointment;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "verificando" });

  useEffect(() => {
    let cancelado = false;

    async function verificar() {
      let cita = citaInicial;

      if (cita.status !== "COMPLETED") {
        try {
          cita = await completarVisitaProvisional(cita);
        } catch (e) {
          if (cancelado) return;
          if (e instanceof HomeliticsError && e.kind === "conflicto") {
            setEstado({
              tipo: "no_aplica",
              motivo: MOTIVO_NO_APLICA[cita.status] ?? "Esta visita ya no se puede marcar como realizada.",
            });
            return;
          }
          setEstado({ tipo: "error", mensaje: mensajeError(e) });
          return;
        }
      }

      try {
        const feedbackPrevio = await api.feedbackDeCita(appointmentId);
        if (cancelado) return;
        if (feedbackPrevio.some((f) => f.submitted_by === "CLIENT")) {
          setEstado({ tipo: "ya_enviada" });
          return;
        }
        setEstado({ tipo: "lista" });
      } catch (e) {
        if (cancelado) return;
        setEstado({ tipo: "error", mensaje: mensajeError(e) });
      }
    }

    verificar();
    return () => {
      cancelado = true;
    };
  }, [appointmentId, citaInicial]);

  if (estado.tipo === "verificando") {
    return <Aviso>Un momento, estamos revisando tu visita…</Aviso>;
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
