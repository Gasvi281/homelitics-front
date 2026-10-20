"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { Listing, Task } from "@/lib/schemas";
import { fechaHoraLarga } from "@/lib/format";
import { useTareasLead } from "@/features/tablero-leads/hooks";
import { ResponderConPlantilla } from "@/features/plantillas/components/ResponderConPlantilla";
import {
  ATAJOS, MAX_NOTA, POSPONER, aBogota, aUtc, atajo, estaVencida, posponerDesdeAhora,
  separarTareas, type FechaHoraLocal,
} from "../recordatorio";
import {
  mensajeErrorRecordatorio, mensajeErrorTarea, useActualizarTarea, useAhora,
  useCrearRecordatorio, useTareasCambiando, type CambioTarea,
} from "../hooks";

/**
 * Panel "Seguimiento" del lead (tarea 2.19 — HU-11 AC1). Lee las tareas de
 * `claveTareasLead`, que la página siembra en el servidor, y crea
 * recordatorios con POST /leads/{id}/tasks. Cada tarea abierta se pospone o
 * se marca hecha con PATCH, de forma optimista (2.20): si falla, la tarea
 * vuelve a como estaba y el error queda en su fila.
 *
 * Mezcla los recordatorios del agente con las tareas que crea el sistema
 * (barrido y first-touch): `TaskOut` no trae `source` (bloqueo 11) y el
 * texto de la nota no es una forma confiable de distinguirlas, así que no se
 * intenta.
 *
 * Debajo, "Responder con plantilla" (2.22 — HU-12): el `listing` llega de la
 * página, que ya lo trae.
 *
 * `ahoraInicial` viene del servidor: ver `useAhora`.
 */
export function PanelSeguimiento({
  leadId, listing, ahoraInicial,
}: { leadId: string; listing: Listing; ahoraInicial: string }) {
  const tareas = useTareasLead(leadId).data ?? [];
  const ahora = useAhora(ahoraInicial);
  const { abiertas, hechas } = separarTareas(tareas);
  const cambiando = useTareasCambiando(leadId);
  // Por tarea: el error de una no tapa el de otra.
  const [errores, setErrores] = useState<Record<string, string>>({});
  const actualizar = useActualizarTarea(leadId, {
    alFallar: (e, { tareaId, cambio }) =>
      setErrores(prev => ({ ...prev, [tareaId]: mensajeErrorTarea(e, cambio) })),
  });

  function cambiar(tareaId: string, cambio: CambioTarea["cambio"]) {
    setErrores(prev => {
      const resto = { ...prev };
      delete resto[tareaId];
      return resto;
    });
    actualizar.mutate({ tareaId, cambio });
  }

  return (
    <section aria-labelledby="titulo-seguimiento" className="rounded-lg border border-neutral-200 p-4">
      <h2 id="titulo-seguimiento" className="text-base font-semibold text-neutral-900">Seguimiento</h2>

      {abiertas.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No hay recordatorios pendientes.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {abiertas.map(t => (
            <li key={t.id}>
              <FilaTarea
                tarea={t}
                vencida={estaVencida(t, ahora)}
                error={errores[t.id]}
                acciones={
                  <AccionesTarea
                    tareaId={t.id}
                    cambiando={cambiando.has(t.id)}
                    alCambiar={cambio => cambiar(t.id, cambio)}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}

      {hechas.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-neutral-600">
            Hechos ({hechas.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {hechas.map(t => (
              <li key={t.id}>
                <FilaTarea tarea={t} vencida={false} />
              </li>
            ))}
          </ul>
        </details>
      )}

      <FormularioRecordatorio leadId={leadId} ahora={ahora} />

      <ResponderConPlantilla leadId={leadId} listing={listing} ahora={ahora} />
    </section>
  );
}

function FilaTarea({
  tarea, vencida, error, acciones,
}: { tarea: Task; vencida: boolean; error?: string; acciones?: ReactNode }) {
  const hecha = tarea.status === "DONE";
  return (
    <div className={`rounded border p-3 ${vencida ? "border-red-300 bg-red-50" : "border-neutral-200"}`}>
      <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span className={vencida ? "font-medium text-red-700" : undefined}>
          {fechaHoraLarga(tarea.due_at)}
        </span>
        {vencida && (
          <span className="rounded bg-red-700 px-1.5 py-0.5 font-semibold text-white">Vencido</span>
        )}
        {tarea.status === "SNOOZED" && (
          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-neutral-700">Pospuesto</span>
        )}
        {hecha && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">Hecho</span>}
      </p>
      <p className={`mt-1 text-sm ${hecha ? "text-neutral-500 line-through" : "text-neutral-800"}`}>
        {tarea.note ?? "Sin nota"}
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {/* Una tarea DONE no tiene acciones: el panel no le pasa ninguna. */}
      {acciones}
    </div>
  );
}

/**
 * "Posponer" (1 día, 3 días o una fecha elegida, siempre en el futuro) y
 * "Hecho". Solo para PENDING y SNOOZED. `cambiando` las congela mientras el
 * PATCH de esa tarea está en vuelo, para no mandar dos cambios cruzados.
 */
function AccionesTarea({
  tareaId, cambiando, alCambiar,
}: { tareaId: string; cambiando: boolean; alCambiar: (cambio: CambioTarea["cambio"]) => void }) {
  const [modo, setModo] = useState<"cerrado" | "opciones" | "fecha">("cerrado");
  const [cuando, setCuando] = useState<FechaHoraLocal>({ fecha: "", hora: "" });

  const dueAt = aUtc(cuando);
  const enPasado = dueAt !== null && new Date(dueAt).getTime() <= Date.now();
  const id = `posponer-${tareaId}`;

  function posponer(due_at: string) {
    setModo("cerrado");
    alCambiar({ status: "SNOOZED", due_at });
  }

  function posponerAFecha(e: FormEvent) {
    e.preventDefault();
    // Contra el reloj de este momento: el campo pudo quedar abierto un rato.
    if (!dueAt || new Date(dueAt).getTime() <= Date.now()) return;
    posponer(dueAt);
  }

  const boton =
    "rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModo(m => (m === "cerrado" ? "opciones" : "cerrado"))}
          disabled={cambiando}
          aria-expanded={modo !== "cerrado"}
          className={boton}
        >
          Posponer
        </button>
        <button
          type="button"
          onClick={() => {
            setModo("cerrado");
            alCambiar({ status: "DONE" });
          }}
          disabled={cambiando}
          className="rounded bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Hecho
        </button>
      </div>

      {modo !== "cerrado" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {POSPONER.map(p => (
            <button
              key={p.dias}
              type="button"
              onClick={() => posponer(posponerDesdeAhora(new Date(), p.dias))}
              disabled={cambiando}
              className={boton}
            >
              {p.etiqueta}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCuando(atajo(new Date(), 1));
              setModo("fecha");
            }}
            disabled={cambiando}
            aria-expanded={modo === "fecha"}
            className={boton}
          >
            Elegir fecha
          </button>
        </div>
      )}

      {modo === "fecha" && (
        <form onSubmit={posponerAFecha} className="mt-2" noValidate>
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor={`${id}-fecha`} className="text-xs font-medium text-neutral-700">
              Fecha
              <input
                id={`${id}-fecha`}
                type="date"
                value={cuando.fecha}
                min={aBogota(new Date()).fecha}
                onChange={e => setCuando(prev => ({ ...prev, fecha: e.target.value }))}
                className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
              />
            </label>
            <label htmlFor={`${id}-hora`} className="text-xs font-medium text-neutral-700">
              Hora
              <input
                id={`${id}-hora`}
                type="time"
                value={cuando.hora}
                onChange={e => setCuando(prev => ({ ...prev, hora: e.target.value }))}
                className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Hora de Bogotá.</p>
          {enPasado && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              Esa fecha ya pasó. Elige una fecha y hora futuras.
            </p>
          )}
          <button
            type="submit"
            disabled={cambiando || !dueAt || enPasado}
            className="mt-2 rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Posponer a esa fecha
          </button>
        </form>
      )}
    </div>
  );
}

function FormularioRecordatorio({ leadId, ahora }: { leadId: string; ahora: Date }) {
  const crear = useCrearRecordatorio(leadId);
  const [cuando, setCuando] = useState<FechaHoraLocal>({ fecha: "", hora: "" });
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dueAt = aUtc(cuando);
  const enPasado = dueAt !== null && new Date(dueAt).getTime() <= Date.now();
  const hoy = aBogota(ahora).fecha;

  function cambiar(campo: keyof FechaHoraLocal, valor: string) {
    setCuando(prev => ({ ...prev, [campo]: valor }));
    setError(null);
    crear.reset();
  }

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (crear.isPending) return;
    // Se revisa contra el reloj de este momento, no el `ahora` del minuto.
    if (!dueAt) return setError("Elige la fecha y la hora del recordatorio.");
    if (new Date(dueAt).getTime() <= Date.now()) {
      return setError("Esa fecha ya pasó. Elige una fecha y hora futuras.");
    }
    setError(null);
    const texto = nota.trim();
    crear.mutate(
      { dueAt, nota: texto || null },
      {
        onSuccess: () => {
          setCuando({ fecha: "", hora: "" });
          setNota("");
        },
        onError: err => setError(mensajeErrorRecordatorio(err)),
      },
    );
  }

  const aviso = error ?? (enPasado ? "Esa fecha ya pasó. Elige una fecha y hora futuras." : null);

  return (
    <form onSubmit={guardar} className="mt-6 border-t border-neutral-200 pt-4" noValidate>
      <h3 className="text-sm font-semibold text-neutral-900">Nuevo recordatorio</h3>

      <div className="mt-3 flex flex-wrap gap-2">
        {ATAJOS.map(a => (
          <button
            key={a.dias}
            type="button"
            onClick={() => {
              setCuando(atajo(new Date(), a.dias));
              setError(null);
              crear.reset();
            }}
            disabled={crear.isPending}
            className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            {a.etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-neutral-700">
          Fecha
          <input
            type="date"
            value={cuando.fecha}
            min={hoy}
            onChange={e => cambiar("fecha", e.target.value)}
            disabled={crear.isPending}
            required
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
          />
        </label>
        <label className="text-xs font-medium text-neutral-700">
          Hora
          <input
            type="time"
            value={cuando.hora}
            onChange={e => cambiar("hora", e.target.value)}
            disabled={crear.isPending}
            required
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-neutral-500">Hora de Bogotá.</p>

      <label htmlFor="nota-recordatorio" className="mt-3 block text-xs font-medium text-neutral-700">
        Nota (opcional)
      </label>
      <textarea
        id="nota-recordatorio"
        value={nota}
        onChange={e => setNota(e.target.value)}
        maxLength={MAX_NOTA}
        rows={3}
        disabled={crear.isPending}
        placeholder="Qué hay que hacer: llamar, mandar fotos, confirmar la visita…"
        className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm text-neutral-900 disabled:opacity-60"
      />
      <p className="text-right text-xs text-neutral-500" aria-live="polite">
        {nota.length}/{MAX_NOTA}
      </p>

      {aviso && <p role="alert" className="mt-2 text-sm text-red-700">{aviso}</p>}
      {crear.isSuccess && !aviso && (
        <p role="status" className="mt-2 text-sm text-green-700">Recordatorio guardado.</p>
      )}

      <button
        type="submit"
        disabled={crear.isPending || !dueAt || enPasado}
        className="mt-3 w-full rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {crear.isPending ? "Guardando…" : "Guardar recordatorio"}
      </button>
    </form>
  );
}
