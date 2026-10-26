"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import { Aviso } from "@/components/Aviso";
import { InsigniaEstadoCita } from "@/components/TarjetaCita";
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
      // La tarjeta de la cita ya está arriba (la pinta la página); aquí solo
      // el resultado, con el estado real que devolvió el API (bloqueo 5).
      <Aviso variante="exito">
        <p>
          <strong className="font-bold">
            {cita.status === "CONFIRMED"
              ? "Listo, la visita quedó confirmada."
              : "Listo, pedimos la visita."}
          </strong>{" "}
          {cita.status === "CONFIRMED"
            ? "Te esperamos en el horario elegido."
            : "El agente recibió la solicitud y te avisamos apenas la confirme."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <InsigniaEstadoCita status={cita.status} />
          <Link href={`/citas/${cita.id}`} className="btn btn-sm btn-secundario">
            Ver mi visita
          </Link>
        </div>
      </Aviso>
    );
  }

  if (estado.tipo === "conflicto") {
    return (
      <Aviso variante="error">
        <p>
          <strong className="font-bold">Ese horario ya no está libre.</strong> Alguien más lo tomó
          mientras lo elegías. No es nada que hayas hecho mal.
        </p>
        <button
          type="button"
          onClick={() => router.push(urlGrilla("conflicto"))}
          className="btn btn-sm btn-peligro mt-3"
        >
          Ver horarios actualizados
        </button>
      </Aviso>
    );
  }

  if (estado.tipo === "lead_cerrado") {
    return (
      <Aviso variante="error">
        Esta conversación ya se cerró, así que no se pueden pedir más visitas sobre ella. Si te
        sigue interesando la propiedad, escríbele de nuevo al asistente.
      </Aviso>
    );
  }

  if (estado.tipo === "visita_abierta") {
    return (
      <Aviso variante="espera">
        <p>
          <strong className="font-bold">Ya tienes una visita agendada para esta propiedad.</strong>{" "}
          El horario que elegiste sigue libre, pero primero hay que mover o cancelar esa otra.
        </p>
        {estado.idExistente && (
          <Link href={`/citas/${estado.idExistente}`} className="btn btn-sm btn-primario mt-3">
            Ver esa visita
          </Link>
        )}
      </Aviso>
    );
  }

  if (estado.tipo === "vencido") {
    return (
      <Aviso variante="espera">
        <p>Ese horario ya pasó. Elige otro para seguir.</p>
        <button type="button" onClick={() => router.push(urlGrilla())} className="btn btn-sm btn-secundario mt-3">
          Elegir otro horario
        </button>
      </Aviso>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {estado.tipo === "error" && <Aviso variante="error">{estado.mensaje}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={pedirVisita}
          disabled={estado.tipo === "enviando"}
          className="btn btn-lg btn-primario"
        >
          {estado.tipo === "enviando" ? "Pidiendo la visita…" : "Pedir la visita"}
        </button>
        <Link href={urlGrilla()} className="btn btn-lg btn-secundario">
          Cambiar el horario
        </Link>
      </div>
    </div>
  );
}
