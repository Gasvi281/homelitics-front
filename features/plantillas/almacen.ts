"use client";

/**
 * Tarea 2.22 — HU-12 AC1, decisión (b). Las versiones propias de las
 * plantillas que guarda el agente, **solo en este navegador**.
 *
 * Provisional: su lugar es `agency_settings.bot.templates` (migración 012,
 * bloqueo 8). Este es el único archivo que toca `localStorage` para
 * plantillas; cuando exista el endpoint se reemplaza por uno que lea y
 * escriba con `GET /agency/settings` y `PUT /agency/settings/bot`, y las
 * pantallas no cambian.
 *
 * Se guarda solo el texto con variables (`{client_name}`, …), nunca un
 * mensaje ya rellenado: quien llama pasa el texto de la plantilla, no el de
 * la vista previa. Todo acceso a `localStorage` va en try/catch (modo
 * privado, cuota llena, almacenamiento bloqueado): si falla, la lectura
 * devuelve "sin propias" y la escritura devuelve `false`.
 */
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { PLANTILLAS, type ClavePlantilla } from "./plantillas";

const LLAVE = "homelitics:plantillas:v1";

/** Tope por plantilla: un mensaje de chat, no un documento. */
export const MAX_PLANTILLA = 2000;

export type PlantillasPropias = Partial<Record<ClavePlantilla, string>>;

const CLAVES = PLANTILLAS.map(p => p.clave);

/** Lo que haya en `localStorage` es de este navegador, no del API: se valida igual. */
const GuardadoSchema = z.record(z.string(), z.unknown());

const VACIO: PlantillasPropias = {};

const oyentes = new Set<() => void>();

/** Se recalcula solo cuando cambia el texto crudo: `useSyncExternalStore` pide la misma referencia. */
let cache: { crudo: string | null; propias: PlantillasPropias } = { crudo: null, propias: VACIO };

function leerCrudo(): string | null {
  try {
    return window.localStorage.getItem(LLAVE);
  } catch {
    return null;
  }
}

function interpretar(crudo: string | null): PlantillasPropias {
  if (!crudo) return VACIO;
  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return VACIO;
  }
  const r = GuardadoSchema.safeParse(datos);
  if (!r.success) return VACIO;
  // Solo claves conocidas y textos válidos; lo demás se ignora, no rompe.
  const propias: PlantillasPropias = {};
  for (const clave of CLAVES) {
    const texto = r.data[clave];
    if (typeof texto === "string" && texto.trim() && texto.length <= MAX_PLANTILLA) propias[clave] = texto;
  }
  return propias;
}

function leer(): PlantillasPropias {
  const crudo = leerCrudo();
  if (crudo !== cache.crudo) cache = { crudo, propias: interpretar(crudo) };
  return cache.propias;
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  // Otra pestaña que guarda también actualiza esta.
  const alCambiarOtraPestana = (e: StorageEvent) => {
    if (e.key === null || e.key === LLAVE) oyente();
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}

function escribir(propias: PlantillasPropias): boolean {
  try {
    if (Object.keys(propias).length === 0) window.localStorage.removeItem(LLAVE);
    else window.localStorage.setItem(LLAVE, JSON.stringify(propias));
  } catch {
    return false;
  }
  for (const o of oyentes) o();
  return true;
}

/**
 * Las plantillas propias del agente en este navegador. En el servidor y al
 * hidratar no hay `localStorage`: arranca sin propias y se corrige al montar.
 */
export function usePlantillasPropias(): PlantillasPropias {
  return useSyncExternalStore(suscribir, leer, () => VACIO);
}

/**
 * Guarda `texto` (con variables) como la versión propia de `clave`.
 * `false` si el texto está vacío o es muy largo, o si el navegador no dejó
 * escribir; quien llama muestra el aviso.
 */
export function guardarPlantillaPropia(clave: ClavePlantilla, texto: string): boolean {
  if (!texto.trim() || texto.length > MAX_PLANTILLA) return false;
  return escribir({ ...leer(), [clave]: texto });
}

/** Vuelve a la plantilla base de `clave`. `false` si el navegador no dejó escribir. */
export function borrarPlantillaPropia(clave: ClavePlantilla): boolean {
  const resto = { ...leer() };
  delete resto[clave];
  return escribir(resto);
}
