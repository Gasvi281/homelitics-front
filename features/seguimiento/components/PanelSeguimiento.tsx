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
    <section aria-labelledby="titulo-seguimiento" className="panel px-6 py-5">
      <h2 id="titulo-seguimiento" className="font-display text-[22px] font-bold">Seguimiento</h2>

      {abiertas.length === 0 ? (
        <p className="mt-3 text-sm text-tinta-tenue">No hay recordatorios pendientes.</p>
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
          <summary className="cursor-pointer text-sm font-medium text-tinta-suave">
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
    <div className={`rounded-2xl border p-3.5 ${vencida ? "border-alerta-borde bg-alerta-claro" : "border-borde"}`}>
      <p className="flex flex-wrap items-center gap-2 text-xs text-tinta-tenue">
        <span className={vencida ? "font-medium text-alerta-hondo" : undefined}>
          {fechaHoraLarga(tarea.due_at)}
        </span>
        {vencida && (
          <span className="insignia bg-alerta text-white">Vencido</span>
        )}
        {tarea.status === "SNOOZED" && (
          <span className="insignia bg-hoja text-tinta-suave">Pospuesto</span>
        )}
        {hecha && <span className="insignia bg-montana-claro text-montana-hondo">Hecho</span>}
      </p>
      <p className={`mt-1 text-sm ${hecha ? "text-tinta-tenue line-through" : "text-tinta"}`}>
        {tarea.note ?? "Sin nota"}
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-alerta-hondo">{error}</p>}
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
    "inline-flex h-8 items-center rounded-full border-[1.5px] border-borde-fuerte bg-white px-3 text-xs font-semibold text-tinta hover:border-tinta disabled:opacity-40";

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
          className="btn btn-sm bg-tinta text-white hover:bg-tinta-hondo"
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
            <label htmlFor={`${id}-fecha`} className="text-xs font-bold text-tinta">
              Fecha
              <input
                id={`${id}-fecha`}
                type="date"
                value={cuando.fecha}
                min={aBogota(new Date()).fecha}
                onChange={e => setCuando(prev => ({ ...prev, fecha: e.target.value }))}
                className="campo h-10 text-sm"
              />
            </label>
            <label htmlFor={`${id}-hora`} className="text-xs font-bold text-tinta">
              Hora
              <input
                id={`${id}-hora`}
                type="time"
                value={cuando.hora}
                onChange={e => setCuando(prev => ({ ...prev, hora: e.target.value }))}
                className="campo h-10 text-sm"
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-tinta-tenue">Hora de Bogotá.</p>
          {enPasado && (
            <p role="alert" className="mt-1 text-sm text-alerta-hondo">
              Esa fecha ya pasó. Elige una fecha y hora futuras.
            </p>
          )}
          <button
            type="submit"
            disabled={cambiando || !dueAt || enPasado}
            className="btn btn-sm mt-2 bg-tinta text-white hover:bg-tinta-hondo"
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
    <form onSubmit={guardar} className="mt-6 border-t border-borde pt-4" noValidate>
      <h3 className="text-[15px] font-bold text-tinta">Nuevo recordatorio</h3>

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
            className="inline-flex h-8 items-center rounded-full border-[1.5px] border-borde-fuerte bg-white px-3 text-xs font-semibold text-tinta hover:border-tinta disabled:opacity-40"
          >
            {a.etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-tinta">
          Fecha
          <input
            type="date"
            value={cuando.fecha}
            min={hoy}
            onChange={e => cambiar("fecha", e.target.value)}
            disabled={crear.isPending}
            required
            className="campo h-10 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-tinta">
          Hora
          <input
            type="time"
            value={cuando.hora}
            onChange={e => cambiar("hora", e.target.value)}
            disabled={crear.isPending}
            required
            className="campo h-10 text-sm"
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-tinta-tenue">Hora de Bogotá.</p>

      <label htmlFor="nota-recordatorio" className="mt-3 block text-xs font-bold text-tinta">
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
        className="campo"
      />
      <p className="text-right text-xs text-tinta-tenue" aria-live="polite">
        {nota.length}/{MAX_NOTA}
      </p>

      {aviso && <p role="alert" className="mt-2 text-sm text-alerta-hondo">{aviso}</p>}
      {crear.isSuccess && !aviso && (
        <p role="status" className="mt-2 text-sm text-montana-hondo">Recordatorio guardado.</p>
      )}

      <button
        type="submit"
        disabled={crear.isPending || !dueAt || enPasado}
        className="mt-3 btn w-full btn-primario"
      >
        {crear.isPending ? "Guardando…" : "Guardar recordatorio"}
      </button>
    </form>
  );
}
