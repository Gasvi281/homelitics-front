"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Aviso } from "@/components/Aviso";
import { useInsights } from "../InsightsProvider";
import { MensajeInsights } from "./MensajeInsights";

/** A partir de aquí se avisa que la respuesta puede tardar. */
const ESPERA_LARGA_MS = 15_000;

/**
 * Botón flotante y panel lateral del asistente de insights (solo
 * `TEAM_ADMIN`, ver `app/(agente)/layout.tsx`).
 *
 * El panel no es modal: el admin puede seguir mirando el tablero o el
 * embudo mientras pregunta. Se cierra con Escape o con la equis; cerrarlo
 * no pierde la conversación (vive en `InsightsProvider`).
 *
 * El botón va en `z-10`, debajo de la zona "Perdido" del tablero (`z-20`,
 * solo visible al arrastrar) y del aviso flotante de `CentroAvisos` (`z-30`).
 */
export function AsistenteInsights() {
  const { isOpen, abrir } = useInsights();
  return isOpen ? (
    <Panel />
  ) : (
    <button
      type="button"
      onClick={abrir}
      className="btn btn-primario btn-lg fixed right-6 bottom-6 z-10 shadow-[0_16px_40px_rgba(19,48,58,0.3)]"
    >
      <IconoChispa />
      Preguntar al asistente
    </button>
  );
}

function Panel() {
  const {
    mensajes, isPending, bloqueado, borrador, setBorrador, enviar, cerrar, nuevaConversacion,
  } = useInsights();
  const idTitulo = useId();
  const entrada = useRef<HTMLTextAreaElement>(null);
  const final = useRef<HTMLDivElement>(null);
  const lento = useEsperaLarga(isPending);

  useEffect(() => {
    entrada.current?.focus();
  }, []);

  useEffect(() => {
    const alTecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [cerrar]);

  // Lo último a la vista: cada mensaje nuevo, el "escribiendo…" y el aviso de espera.
  useEffect(() => {
    final.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length, isPending, lento]);

  // Al terminar (o fallar y devolver el texto), el foco vuelve al input.
  useEffect(() => {
    if (!isPending) entrada.current?.focus();
  }, [isPending]);

  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    void enviar();
  };

  // Enter envía; Shift+Enter hace salto de línea.
  const alTeclaEntrada = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar();
    }
  };

  return (
    <aside
      aria-labelledby={idTitulo}
      className="fixed inset-y-0 right-0 z-40 flex w-[28rem] max-w-full flex-col border-l border-borde bg-white text-tinta shadow-[0_24px_60px_rgba(19,48,58,0.35)]"
    >
      <header className="flex items-center gap-3 border-b border-borde px-6 py-4">
        <div className="min-w-0 flex-1">
          <h2 id={idTitulo} className="font-display text-xl font-bold">
            Asistente de la agencia
          </h2>
          <p className="text-sm text-tinta-tenue">Leads, embudo y demanda de inmuebles</p>
        </div>
        {!bloqueado && (
          <button
            type="button"
            onClick={nuevaConversacion}
            disabled={isPending || mensajes.length === 0}
            className="btn btn-suave btn-sm"
          >
            Nueva conversación
          </button>
        )}
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar el asistente"
          className="grid size-9 place-items-center rounded-full text-tinta-suave hover:bg-neblina"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {bloqueado ? (
        <div className="p-6">
          <Aviso variante="info">Solo administradores pueden usar el asistente.</Aviso>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5" aria-live="polite">
            {mensajes.length === 0 && !isPending && (
              <p className="text-[15px] leading-relaxed text-tinta-suave">
                Pregunta lo que quieras saber de la agencia. Por ejemplo: “¿cuántos leads entraron esta semana?” o
                “¿en qué etapa del embudo se pierden más?”.
              </p>
            )}
            {mensajes.map(m => (
              <MensajeInsights key={m.id} mensaje={m} />
            ))}
            {isPending && <Escribiendo />}
            {isPending && lento && <Aviso variante="espera">Esto puede tardar hasta un minuto.</Aviso>}
            <div ref={final} />
          </div>

          <form onSubmit={alEnviar} className="flex items-end gap-2 border-t border-borde px-6 py-4">
            <label className="sr-only" htmlFor={`${idTitulo}-entrada`}>
              Tu pregunta
            </label>
            <textarea
              id={`${idTitulo}-entrada`}
              ref={entrada}
              rows={2}
              value={borrador}
              onChange={e => setBorrador(e.target.value)}
              onKeyDown={alTeclaEntrada}
              disabled={isPending}
              placeholder="Escribe tu pregunta"
              className="campo mt-0 max-h-40 resize-none"
            />
            <button type="submit" disabled={isPending || borrador.trim() === ""} className="btn btn-primario">
              Preguntar
            </button>
          </form>
        </>
      )}
    </aside>
  );
}

/** true cuando `activo` lleva más de `ESPERA_LARGA_MS` encendido. */
function useEsperaLarga(activo: boolean): boolean {
  const [lento, setLento] = useState(false);
  useEffect(() => {
    if (!activo) {
      setLento(false);
      return;
    }
    const temporizador = setTimeout(() => setLento(true), ESPERA_LARGA_MS);
    return () => clearTimeout(temporizador);
  }, [activo]);
  return lento;
}

function Escribiendo() {
  return (
    <div className="flex items-center gap-2 text-sm text-tinta-tenue" role="status">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 200, 400].map(retraso => (
          <span key={retraso} className="size-2 animate-pulso rounded-full bg-plano" style={{ animationDelay: `${retraso}ms` }} />
        ))}
      </span>
      Escribiendo…
    </div>
  );
}

function IconoChispa() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      <path d="M10 2l1.8 4.9L17 8.5l-5.2 1.6L10 15l-1.8-4.9L3 8.5l5.2-1.6L10 2zM15.5 13l.8 2 2 .7-2 .8-.8 2-.7-2-2-.8 2-.7.7-2z" />
    </svg>
  );
}
