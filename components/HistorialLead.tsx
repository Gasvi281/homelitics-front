"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { Interaction, Task } from "@/lib/schemas";
import { construirLineaTiempo, textoInteraccion, type EventoTimeline } from "@/lib/lineaTiempo";
import { claveInteracciones } from "@/features/tablero-leads/claves";
import { useCitasLead, useInteracciones, useTareasLead } from "@/features/tablero-leads/hooks";
import { fechaHoraLarga } from "@/lib/format";
import { Aviso } from "@/components/Aviso";
import { ETIQUETA_CANAL, ETIQUETA_ESTADO } from "@/components/TarjetaCita";

const ETIQUETA_TIPO_INTERACCION: Record<Interaction["type"], string> = {
  MESSAGE: "Mensaje",
  CALL: "Llamada",
  NOTE: "Nota",
  STATUS_CHANGE: "Cambio de etapa",
};

const ETIQUETA_DIRECCION: Record<Interaction["direction"], string> = {
  INBOUND: "Entrante",
  OUTBOUND: "Saliente",
};

const ETIQUETA_TAREA: Record<Task["status"], string> = {
  PENDING: "Pendiente",
  DONE: "Hecha",
  SNOOZED: "Pospuesta",
};

/**
 * Línea de tiempo vertical del lead más el campo de nota manual (tarea 2.4 —
 * HU-07). Interacciones, citas y tareas llegan sembradas por la página en el
 * caché de TanStack Query (mismas keys que features/tablero-leads/claves.ts):
 * así, marcar el lead como perdido (components/EtapaLead.tsx) las invalida y
 * aparecen la línea del motivo y las visitas canceladas sin recargar.
 *
 * La nota se manda con `direction: "OUTBOUND"`, `type: "NOTE"`,
 * `channel: "IN_APP"` (docs/API_CONTRACT.md: así es "una nota manual del
 * agente"). Al éxito se agrega al final de las interacciones en caché — no
 * hace falta releer: el API le pone `occurred_at` a "ahora", que siempre cae
 * después de todo lo histórico.
 */
export function HistorialLead({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const interacciones = useInteracciones(leadId).data ?? [];
  const citas = useCitasLead(leadId).data ?? [];
  const tareas = useTareasLead(leadId).data ?? [];
  const eventos = construirLineaTiempo({ interacciones, citas, tareas });
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviarNota(e: FormEvent) {
    e.preventDefault();
    const texto = nota.trim();
    if (!texto || enviando) return;

    setEnviando(true);
    setError(null);
    try {
      const interaccion = await api.crearInteraccion(leadId, {
        direction: "OUTBOUND",
        type: "NOTE",
        channel: "IN_APP",
        body: texto,
      });
      qc.setQueryData<Interaction[]>(claveInteracciones(leadId), (prev = []) => [...prev, interaccion]);
      setNota("");
    } catch (err) {
      setError(mensajeErrorNota(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-6">
      {eventos.length === 0 ? (
        <Aviso>Todavía no hay interacciones, citas ni tareas con este lead.</Aviso>
      ) : (
        <ol className="flex flex-col gap-4 border-l border-neutral-200 pl-4">
          {eventos.map((evento) => (
            <li key={`${evento.tipo}-${evento.id}`}>
              <EntradaTimeline evento={evento} />
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={enviarNota} className="mt-6 border-t border-neutral-200 pt-4">
        <label htmlFor="nota-lead" className="block text-sm font-medium text-neutral-700">
          Agregar una nota
        </label>
        <textarea
          id="nota-lead"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          disabled={enviando}
          maxLength={4000}
          rows={3}
          placeholder="Escribe qué pasó o qué acordaste con el cliente…"
          className="mt-2 w-full rounded border border-neutral-300 p-3 text-sm text-neutral-900 disabled:opacity-60"
        />
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={enviando || !nota.trim()}
          className="mt-3 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enviando ? "Guardando…" : "Guardar la nota"}
        </button>
      </form>
    </div>
  );
}

function EntradaTimeline({ evento }: { evento: EventoTimeline }) {
  if (evento.tipo === "interaccion") {
    const i = evento.interaccion;
    // "Lost: PRICE — nota" se lee "Perdido: Precio — nota".
    const texto = textoInteraccion(i);
    return (
      <div>
        <p className="text-xs text-neutral-400">{fechaHoraLarga(i.occurred_at)}</p>
        <p className="text-sm font-medium text-neutral-700">
          {ETIQUETA_TIPO_INTERACCION[i.type]}
          {i.type !== "STATUS_CHANGE" && ` · ${ETIQUETA_DIRECCION[i.direction]} por ${ETIQUETA_CANAL[i.channel]}`}
        </p>
        {texto && <p className="mt-1 text-sm text-neutral-600">{texto}</p>}
      </div>
    );
  }

  if (evento.tipo === "cita") {
    const c = evento.cita;
    return (
      <div>
        <p className="text-xs text-neutral-400">{fechaHoraLarga(c.created_at)}</p>
        <p className="text-sm font-medium text-neutral-700">Cita</p>
        <p className="mt-1 text-sm text-neutral-600">
          Visita para el {fechaHoraLarga(c.scheduled_at)} ({c.duration_min} min) —{" "}
          {ETIQUETA_ESTADO[c.status]}
        </p>
      </div>
    );
  }

  const t = evento.tarea;
  return (
    <div>
      <p className="text-xs text-neutral-400">{fechaHoraLarga(t.created_at)}</p>
      <p className="text-sm font-medium text-neutral-700">Tarea · {ETIQUETA_TAREA[t.status]}</p>
      <p className="mt-1 text-sm text-neutral-600">
        {t.note ?? "Sin descripción"} — vence {fechaHoraLarga(t.due_at)}
      </p>
    </div>
  );
}

function mensajeErrorNota(e: unknown): string {
  if (e instanceof HomeliticsError) {
    if (e.kind === "red") return "No pudimos conectarnos con el servicio. Intenta de nuevo.";
    return e.detail;
  }
  return "No se pudo guardar la nota. Intenta de nuevo.";
}
