"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import { TarjetaCita } from "@/components/TarjetaCita";
import type { Appointment } from "@/lib/schemas";

type Estado =
  | { tipo: "listo" }
  | { tipo: "vencido" }
  | { tipo: "enviando" }
  | { tipo: "conflicto" }
  | { tipo: "lead_cerrado" }
  | { tipo: "visita_abierta"; idExistente: string | null }
  | { tipo: "error"; mensaje: string }
  | { tipo: "exito"; cita: Appointment };

/**
 * Tarea 2.2. Único Client Component de la pantalla de confirmar: es el que
 * dispara `POST /leads/{id}/appointments` y necesita estado real para el
 * envío y sus caminos de error.
 *
 * El `POST` puede dar 409 por tres razones distintas (docs/API_CONTRACT.md,
 * sección de la ruta) y el API no las separa por código, solo por texto en
 * `detail` — no hay campo de "razón" propio. `clasificarConflicto()` matchea
 * ese texto contra los dos casos documentados (encontrados el 2026-09-14
 * contra el API real); lo que no matchea ninguno de los dos es el
 * solapamiento de horario, el caso original y el único que existía antes de
 * esa fecha.
 */
function clasificarConflicto(detail: string): Estado {
  if (detail.includes("takes no visits")) {
    return { tipo: "lead_cerrado" };
  }
  if (detail.includes("already has an open visit")) {
    // El mensaje trae el uuid de la cita existente entre paréntesis, ej.:
    // "Lead already has an open visit (<uuid>, PENDING_CONFIRMATION) at <iso>; ..."
    const idExistente = detail.match(/\(([0-9a-f-]{36})/i)?.[1] ?? null;
    return { tipo: "visita_abierta", idExistente };
  }
  return { tipo: "conflicto" };
}

export function ConfirmarCitaAcciones({
  leadId,
  listingId,
  horario,
}: {
  leadId: string;
  listingId: string;
  horario: string;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "listo" });

  const urlGrilla = (aviso?: string) => {
    const params = new URLSearchParams({ leadId });
    if (aviso) params.set("aviso", aviso);
    return `/propiedades/${listingId}/agendar?${params.toString()}`;
  };

  // El horario pudo vencerse mientras el cliente tenía esta pantalla abierta.
  useEffect(() => {
    if (new Date(horario).getTime() <= Date.now()) setEstado({ tipo: "vencido" });
  }, [horario]);

  async function pedirVisita() {
    if (new Date(horario).getTime() <= Date.now()) {
      setEstado({ tipo: "vencido" });
      return;
    }

    setEstado({ tipo: "enviando" });
    try {
      const cita = await api.crearCita(leadId, { scheduled_at: horario, duration_min: 30 });
      setEstado({ tipo: "exito", cita });
    } catch (e) {
      if (e instanceof HomeliticsError && e.kind === "conflicto") {
        setEstado(clasificarConflicto(e.detail));
        return;
      }
      if (e instanceof HomeliticsError && e.kind === "invalido") {
        setEstado({ tipo: "vencido" });
        return;
      }
      const mensaje =
        e instanceof HomeliticsError
          ? e.kind === "red"
            ? "No pudimos conectarnos con el servicio. Intenta de nuevo."
            : e.detail
          : "Algo salió mal. Intenta de nuevo.";
      setEstado({ tipo: "error", mensaje });
    }
  }

  if (estado.tipo === "exito") {
    const { cita } = estado;
    return (
      <div className="mt-6">
        <TarjetaCita
          scheduledAt={cita.scheduled_at}
          durationMin={cita.duration_min}
          status={cita.status}
        />
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-6 text-sm text-green-700">
          {cita.status === "CONFIRMED"
            ? "Listo, la visita quedó confirmada. Te esperamos en el horario elegido."
            : "Listo, pedimos la visita. El agente recibió la solicitud y te avisamos apenas la confirme."}
        </div>
      </div>
    );
  }

  if (estado.tipo === "conflicto") {
    return (
      <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p>Alguien más tomó ese horario mientras lo elegías. No es nada que hayas hecho mal.</p>
        <button
          type="button"
          onClick={() => router.push(urlGrilla("conflicto"))}
          className="mt-3 rounded border border-red-300 px-3 py-1.5 text-red-700"
        >
          Ver horarios actualizados
        </button>
      </div>
    );
  }

  if (estado.tipo === "lead_cerrado") {
    return (
      <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Esta conversación ya se cerró, así que no se pueden pedir más visitas sobre ella.
      </div>
    );
  }

  if (estado.tipo === "visita_abierta") {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
        <p>Ya hay una visita agendada para esta conversación. El horario que elegiste sigue
        libre, pero primero hay que mover o cancelar esa otra.</p>
        {estado.idExistente && (
          <Link
            href={`/citas/${estado.idExistente}`}
            className="mt-3 inline-block rounded border border-amber-300 px-3 py-1.5 text-amber-700"
          >
            Ver esa visita
          </Link>
        )}
      </div>
    );
  }

  if (estado.tipo === "vencido") {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
        <p>Ese horario ya pasó. Elige otro para seguir.</p>
        <button
          type="button"
          onClick={() => router.push(urlGrilla())}
          className="mt-3 rounded border border-amber-300 px-3 py-1.5 text-amber-700"
        >
          Elegir otro horario
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {estado.tipo === "error" && (
        <p className="mb-3 text-sm text-red-700">{estado.mensaje}</p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={pedirVisita}
          disabled={estado.tipo === "enviando"}
          className="rounded bg-neutral-900 px-4 py-3 text-center font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {estado.tipo === "enviando" ? "Enviando…" : "Pedir la visita"}
        </button>
        <Link
          href={urlGrilla()}
          className="rounded border border-neutral-300 px-4 py-3 text-center font-medium text-neutral-700"
        >
          Cambiar el horario
        </Link>
      </div>
    </div>
  );
}
