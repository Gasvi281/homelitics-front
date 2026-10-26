"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { Interaction, Task } from "@/lib/schemas";
import { construirLineaTiempo, textoInteraccion, type EventoTimeline } from "@/lib/lineaTiempo";
import { claveInteracciones } from "@/features/tablero-leads/claves";
import { PREFIJO_RIESGO } from "@/features/riesgo/claves";
import { useCitasLead, useInteracciones, useTareasLead } from "@/features/tablero-leads/hooks";
import { diaLocal, fechaHoraLarga, fechaLarga, horaLocal } from "@/lib/format";
import { Aviso } from "@/components/Aviso";
import { ETIQUETA_CANAL, InsigniaEstadoCita } from "@/components/TarjetaCita";

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
 *
 * También invalida los leads en riesgo (2.15). Hoy una nota no saca al lead
 * de at-risk (solo cuentan `MESSAGE` y `CALL`), pero es el único sitio que
 * registra interacciones y así queda listo para el mensaje de 2.23.
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
  const [resaltada, setResaltada] = useState<string | null>(null);
  const hayCitas = citas.length > 0;

  // Llegar con `#cita-…` (un aviso VISIT_SCHEDULED, tarea 2.34): el historial
  // es un Client Component sembrado, así que el navegador puede haber buscado
  // el ancla antes de que existiera. Se desplaza a mano tras montar y resalta
  // la cita un par de segundos.
  useEffect(() => {
    let quitar: ReturnType<typeof setTimeout> | undefined;
    const ir = () => {
      const id = window.location.hash.slice(1);      if (!id.startsWith("cita-")) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      setResaltada(id);
      clearTimeout(quitar);
      quitar = setTimeout(() => setResaltada(null), 2500);
    };
    ir();
    window.addEventListener("hashchange", ir);
    return () => {
      window.removeEventListener("hashchange", ir);
      clearTimeout(quitar);
    };
  }, [leadId, hayCitas]);

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
      void qc.invalidateQueries({ queryKey: PREFIJO_RIESGO });
      setNota("");
    } catch (err) {
      setError(mensajeErrorNota(err));
    } finally {
      setEnviando(false);
    }
  }

  // Separadores por día (hora de Bogotá), como en un chat.
  const porDia: { dia: string; eventos: EventoTimeline[] }[] = [];
  for (const evento of eventos) {
    const dia = diaLocal(evento.fecha);
    const ultimo = porDia.at(-1);
    if (ultimo?.dia === dia) ultimo.eventos.push(evento);
    else porDia.push({ dia, eventos: [evento] });
  }

  return (
    <section aria-labelledby="titulo-historial" className="panel flex min-h-full flex-col gap-3 px-7 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hoja pb-3">
        <h2 id="titulo-historial" className="font-display text-[22px] font-bold">Historial</h2>
        <span className="text-sm text-tinta-tenue">Del más antiguo al más reciente</span>
      </div>

      {eventos.length === 0 ? (
        <Aviso>Todavía no hay interacciones, citas ni tareas con este lead.</Aviso>
      ) : (
        <ol className="flex flex-col gap-3">
          {porDia.map(({ dia, eventos: delDia }) => (
            <li key={dia} className="flex flex-col gap-3">
              <p className="self-center rounded-full bg-neblina px-3.5 py-1 text-[13px] text-tinta-suave first-letter:uppercase">
                {fechaLarga(delDia[0].fecha)}
              </p>
              <ol className="flex flex-col gap-3">
                {delDia.map((evento) => (
                  <li key={`${evento.tipo}-${evento.id}`} className="flex flex-col">
                    <EntradaTimeline evento={evento} resaltada={resaltada} />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={enviarNota} className="mt-auto flex flex-wrap items-end gap-2.5 border-t border-hoja pt-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="nota-lead" className="etiqueta">
            Agregar una nota
          </label>
          <textarea
            id="nota-lead"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={enviando}
            maxLength={4000}
            rows={2}
            placeholder="Escribe qué pasó o qué acordaste con el cliente…"
            className="campo resize-none rounded-[18px]"
          />
        </div>
        <button type="submit" disabled={enviando || !nota.trim()} className="btn btn-lg bg-tinta text-white hover:bg-tinta-hondo">
          {enviando ? "Guardando…" : "Guardar la nota"}
        </button>
        {error && <p className="w-full text-sm font-semibold text-alerta-hondo">{error}</p>}
      </form>
    </section>
  );
}

/**
 * Cada entrada con la forma del chat: lo que escribe el cliente a la
 * izquierda, lo que sale hacia él a la derecha en azul, las notas internas
 * en amarillo; cambios de etapa, citas y tareas van al centro, como eventos.
 */
function EntradaTimeline({ evento, resaltada }: { evento: EventoTimeline; resaltada: string | null }) {
  if (evento.tipo === "interaccion") {
    const i = evento.interaccion;
    // "Lost: PRICE — nota" se lee "Perdido: Precio — nota".
    const texto = textoInteraccion(i);

    if (i.type === "STATUS_CHANGE") {
      return (
        <p className="self-center rounded-full border border-borde-fuerte px-3.5 py-1 text-center text-[13px] text-tinta-suave">
          <span className="font-semibold text-tinta">{ETIQUETA_TIPO_INTERACCION[i.type]}</span>
          {texto && `: ${texto}`} · {horaLocal(i.occurred_at)}
        </p>
      );
    }

    const saliente = i.direction === "OUTBOUND";
    const esNota = i.type === "NOTE";
    const burbuja = esNota
      ? "rounded-2xl bg-sol-claro text-[#4a3300]"
      : saliente
        ? "rounded-[20px] rounded-br-md bg-plano text-white"
        : "rounded-[20px] rounded-bl-md bg-neblina text-tinta";
    const origen = esNota
      ? "Nota interna"
      : i.type === "CALL"
        ? `Llamada ${ETIQUETA_DIRECCION[i.direction].toLowerCase()}`
        : `${ETIQUETA_TIPO_INTERACCION[i.type]} ${ETIQUETA_DIRECCION[i.direction].toLowerCase()} por ${ETIQUETA_CANAL[i.channel]}`;

    return (
      <div className={`flex max-w-[72%] flex-col gap-1 ${saliente || esNota ? "items-end self-end" : "items-start self-start"}`}>
        <p className={`px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line ${burbuja}`}>
          {texto ?? <span className="italic opacity-80">Sin contenido</span>}
        </p>
        <span className="text-xs text-tinta-tenue">
          <time dateTime={i.occurred_at} title={fechaHoraLarga(i.occurred_at)}>{horaLocal(i.occurred_at)}</time>, {origen}
        </span>
      </div>
    );
  }

  if (evento.tipo === "cita") {
    const c = evento.cita;
    const idCita = `cita-${c.id}`;
    return (
      <div
        id={idCita}
        className={`flex w-full max-w-[440px] scroll-mt-24 items-center justify-between gap-3 self-center rounded-2xl border-[1.5px] border-plano-borde px-4 py-3.5 transition-colors duration-700 ${
          resaltada === idCita ? "bg-sol-claro" : "bg-plano-tenue"
        }`}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-bold text-plano-texto">Cita · registrada a las {horaLocal(c.created_at)}</span>
          <strong className="font-display text-lg first-letter:uppercase">
            {fechaHoraLarga(c.scheduled_at)} ({c.duration_min} min)
          </strong>
        </div>
        <InsigniaEstadoCita status={c.status} />
      </div>
    );
  }

  const t = evento.tarea;
  return (
    <div className="flex w-full max-w-[440px] items-center justify-between gap-3 self-center rounded-2xl border border-borde px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-bold text-tinta-tenue">Tarea</span>
        <span className="text-[15px]">
          {t.note ?? "Sin descripción"}, vence el {fechaHoraLarga(t.due_at)}
        </span>
      </div>
      <span className={`insignia ${ESTILO_TAREA[t.status]}`}>{ETIQUETA_TAREA[t.status]}</span>
    </div>
  );
}

const ESTILO_TAREA: Record<Task["status"], string> = {
  PENDING: "bg-sol-claro text-sol-texto",
  DONE: "bg-montana-claro text-montana-hondo",
  SNOOZED: "bg-hoja text-tinta-suave",
};

function mensajeErrorNota(e: unknown): string {
  if (e instanceof HomeliticsError) {
    if (e.kind === "red") return "No pudimos conectarnos con el servicio. Intenta de nuevo.";
    return e.detail;
  }
  return "No se pudo guardar la nota. Intenta de nuevo.";
}
