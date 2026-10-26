"use client";

import { useActionState, useEffect } from "react";
import { entrar, type EstadoEntrar } from "@/app/entrar/acciones";

const ESTADO_INICIAL: EstadoEntrar = { error: null, correo: "" };

/**
 * Formulario de `/entrar` (HU-23, fase 3). El envío lo hace la Server Action
 * `entrar`; aquí solo se pinta el estado que devuelve.
 *
 * Al montar despierta el API (AC5): mientras el agente escribe, Render
 * arranca. No se espera la respuesta ni importa si falla.
 */
export function FormularioEntrar({ siguiente }: { siguiente: string | null }) {
  const [estado, accion, enviando] = useActionState(entrar, ESTADO_INICIAL);

  useEffect(() => {
    fetch("/api/publico/health").catch(() => {});
  }, []);

  return (
    <form action={accion} className="flex flex-col gap-5">
      {siguiente && <input type="hidden" name="siguiente" value={siguiente} />}

      <label className="etiqueta">
        Correo
        <input
          type="email"
          name="correo"
          autoComplete="username"
          required
          autoFocus
          defaultValue={estado.correo}
          disabled={enviando}
          className="campo h-13 rounded-[14px] px-4.5 text-base"
        />
      </label>

      <label className="etiqueta">
        Contraseña
        <input
          type="password"
          name="contrasena"
          autoComplete="current-password"
          required
          disabled={enviando}
          aria-invalid={estado.error ? true : undefined}
          className="campo h-13 rounded-[14px] px-4.5 text-base aria-invalid:border-alerta"
        />
      </label>

      {estado.error && (
        <p role="alert" className="text-sm font-semibold text-alerta-hondo">{estado.error}</p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="btn btn-lg btn-primario w-full"
      >
        {enviando ? "Entrando…" : "Entrar al panel"}
      </button>
    </form>
  );
}
