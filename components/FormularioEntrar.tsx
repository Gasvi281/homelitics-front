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
    <form action={accion} className="space-y-4">
      {siguiente && <input type="hidden" name="siguiente" value={siguiente} />}

      <label className="block text-sm font-medium text-neutral-700">
        Correo
        <input
          type="email"
          name="correo"
          autoComplete="username"
          required
          autoFocus
          defaultValue={estado.correo}
          disabled={enviando}
          className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm text-neutral-900 disabled:opacity-60"
        />
      </label>

      <label className="block text-sm font-medium text-neutral-700">
        Contraseña
        <input
          type="password"
          name="contrasena"
          autoComplete="current-password"
          required
          disabled={enviando}
          className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm text-neutral-900 disabled:opacity-60"
        />
      </label>

      {estado.error && (
        <p role="alert" className="text-sm text-red-700">{estado.error}</p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {enviando ? "Entrando…" : "Entrar al panel"}
      </button>
    </form>
  );
}
