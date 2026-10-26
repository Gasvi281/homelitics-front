"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Listing } from "@/lib/schemas";
import { useAgentes } from "@/features/agentes/hooks";
import { useCitasLead, useLead } from "@/features/tablero-leads/hooks";
import { PLANTILLAS, plantillaSugerida, type ClavePlantilla, type Plantilla } from "../plantillas";
import { VARIABLES, construirContexto, rellenar, type Faltante } from "../rellenar";
import {
  MAX_PLANTILLA, borrarPlantillaPropia, guardarPlantillaPropia, usePlantillasPropias,
} from "../almacen";
import { EnviarMensaje } from "./EnviarMensaje";

/**
 * "Responder con plantilla" en el panel de seguimiento (tarea 2.22 — HU-12
 * AC1). El agente elige una de las cuatro plantillas (la de la etapa del
 * lead va primero, marcada "Sugerida") y ve el mensaje ya rellenado en un
 * textarea que puede cambiar: ese cambio es solo de este mensaje y no toca
 * la plantilla.
 *
 * Aparte, puede guardar su propia versión de la plantilla (con variables,
 * nunca con datos del cliente) en este navegador: decisión (b), ver
 * `../almacen.ts`. "Volver a la original" la borra.
 *
 * Lee el lead, sus citas y los agentes del caché (la página siembra los dos
 * primeros): si el lead cambia de etapa, cambia la sugerida. El listing no
 * cambia en la pantalla y llega por props. Debajo del mensaje, "Copiar" y
 * "Ya lo envié" (2.23, `./EnviarMensaje.tsx`).
 */
export function ResponderConPlantilla({
  leadId, listing, ahora,
}: { leadId: string; listing: Listing; ahora: Date }) {
  const lead = useLead(leadId).data;
  const citas = useCitasLead(leadId).data ?? [];
  const agentes = useAgentes();
  const propias = usePlantillasPropias();

  // `null` = seguir a la sugerida, que puede cambiar con la etapa.
  const [elegida, setElegida] = useState<ClavePlantilla | null>(null);
  // Lo que el agente escribió en ESTE mensaje, para una plantilla. Cambiar de
  // plantilla o guardar una versión propia lo descarta.
  const [edicion, setEdicion] = useState<{ clave: ClavePlantilla; texto: string } | null>(null);
  const [editandoBase, setEditandoBase] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  if (!lead) return null;

  const sugerida = plantillaSugerida(lead.current_stage);
  const ordenadas: Plantilla[] = sugerida
    ? [sugerida, ...PLANTILLAS.filter(p => p.clave !== sugerida.clave)]
    : [...PLANTILLAS];
  const actual = ordenadas.find(p => p.clave === elegida) ?? ordenadas[0];
  const propia = propias[actual.clave];
  const base = propia ?? actual.texto;

  const agente = agentes.estado === "disponible" ? agentes.porId.get(lead.agent_id) ?? null : null;
  const rellenado = rellenar(base, construirContexto(lead, listing, citas, agente, ahora));
  const editado = edicion?.clave === actual.clave ? edicion.texto : null;
  const mensaje = editado ?? rellenado.texto;
  // Si el agente completó a mano un faltante, deja de avisarse.
  const faltantes = rellenado.faltantes.filter(f => mensaje.includes(marcador(f)));

  function elegir(clave: ClavePlantilla) {
    setElegida(clave);
    setEdicion(null);
    setEditandoBase(false);
  }

  return (
    <section aria-labelledby="titulo-plantilla" className="mt-6 border-t border-borde pt-4">
      <h3 id="titulo-plantilla" className="text-[15px] font-bold text-tinta">
        Responder con plantilla
      </h3>

      <label htmlFor="plantilla" className="mt-3 block text-xs font-bold text-tinta">
        Plantilla
      </label>
      <select
        id="plantilla"
        value={actual.clave}
        onChange={e => elegir(e.target.value as ClavePlantilla)}
        className="campo h-10 text-sm"
      >
        {ordenadas.map(p => (
          <option key={p.clave} value={p.clave}>
            {p.titulo}
            {p.clave === sugerida?.clave ? " · Sugerida" : ""}
            {propias[p.clave] ? " · tu versión" : ""}
          </option>
        ))}
      </select>
      {actual.clave === sugerida?.clave && (
        <p className="mt-1 text-xs text-tinta-tenue">
          <span className="insignia bg-plano text-white">Sugerida</span>{" "}
          para la etapa en la que está este lead.
        </p>
      )}

      {faltantes.length > 0 && <AvisoFaltantes faltantes={faltantes} />}

      <label htmlFor="mensaje-plantilla" className="mt-3 block text-xs font-bold text-tinta">
        Mensaje para el cliente
      </label>
      <textarea
        id="mensaje-plantilla"
        ref={textarea}
        value={mensaje}
        onChange={e => setEdicion({ clave: actual.clave, texto: e.target.value })}
        rows={7}
        className="mt-1 w-full rounded border border-borde-fuerte p-2 text-sm text-tinta"
      />
      <p className="text-xs text-tinta-tenue">
        Lo que cambies aquí es solo para este mensaje: la plantilla queda igual.
      </p>
      {editado !== null && (
        <button
          type="button"
          onClick={() => setEdicion(null)}
          className="mt-1 text-xs font-medium text-tinta underline"
        >
          Deshacer mis cambios a este mensaje
        </button>
      )}

      <EnviarMensaje
        leadId={leadId}
        mensaje={mensaje}
        canalLead={lead.source_channel}
        hayFaltantes={faltantes.length > 0}
        textarea={textarea}
      />

      {editandoBase ? (
        <EditorPlantilla
          key={actual.clave}
          clave={actual.clave}
          textoInicial={base}
          alTerminar={guardada => {
            setEditandoBase(false);
            // El mensaje sale de nuevo de la plantilla que el agente acaba de guardar.
            if (guardada) setEdicion(null);
          }}
        />
      ) : (
        <AccionesPlantilla
          tienePropia={propia !== undefined}
          alEditar={() => setEditandoBase(true)}
          alVolver={() => {
            const ok = borrarPlantillaPropia(actual.clave);
            if (ok) setEdicion(null);
            return ok;
          }}
        />
      )}
    </section>
  );
}

function marcador(f: Faltante): string {
  return `[falta: ${f.etiqueta}]`;
}

function AvisoFaltantes({ faltantes }: { faltantes: Faltante[] }) {
  return (
    <div role="status" className="mt-3 rounded-2xl bg-sol-claro p-3 text-sm text-sol-texto">
      <p className="font-medium">Faltan datos en este mensaje:</p>
      <ul className="mt-1 list-disc pl-5">
        {faltantes.map(f => (
          <li key={f.variable}>{f.etiqueta}</li>
        ))}
      </ul>
      <p className="mt-1 text-xs">
        Quedaron marcados como <span className="font-mono">[falta: …]</span>. Escríbelos a mano o quítalos
        antes de mandar el mensaje.
      </p>
    </div>
  );
}

function AccionesPlantilla({
  tienePropia, alEditar, alVolver,
}: { tienePropia: boolean; alEditar: () => void; alVolver: () => boolean }) {
  const [error, setError] = useState<string | null>(null);
  const boton =
    "inline-flex h-8 items-center rounded-full border-[1.5px] border-borde-fuerte bg-white px-3 text-xs font-semibold text-tinta hover:border-tinta disabled:opacity-40";

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={alEditar} className={boton}>
          {tienePropia ? "Cambiar mi plantilla" : "Editar la plantilla"}
        </button>
        {tienePropia && (
          <button
            type="button"
            onClick={() =>
              setError(alVolver() ? null : "Este navegador no dejó borrar tu versión. Intenta de nuevo.")
            }
            className={boton}
          >
            Volver a la original
          </button>
        )}
      </div>
      {tienePropia && (
        <p className="mt-1 text-xs text-tinta-tenue">Estás usando tu versión, guardada solo en este navegador.</p>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-alerta-hondo">{error}</p>}
    </div>
  );
}

/**
 * Edita el texto de la plantilla, con variables, no el mensaje rellenado:
 * así lo que se guarda nunca lleva datos del cliente.
 */
function EditorPlantilla({
  clave, textoInicial, alTerminar,
}: { clave: ClavePlantilla; textoInicial: string; alTerminar: (guardada: boolean) => void }) {
  const [texto, setTexto] = useState(textoInicial);
  const [error, setError] = useState<string | null>(null);
  const id = `plantilla-propia-${clave}`;

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return setError("La plantilla no puede quedar vacía.");
    if (!guardarPlantillaPropia(clave, texto)) {
      return setError("Este navegador no dejó guardar la plantilla (puede estar en modo privado). Tu mensaje sigue igual.");
    }
    alTerminar(true);
  }

  return (
    <form onSubmit={guardar} className="mt-3 rounded-2xl border border-borde p-3.5" noValidate>
      <label htmlFor={id} className="block text-xs font-bold text-tinta">
        Tu plantilla
      </label>
      <textarea
        id={id}
        value={texto}
        onChange={e => {
          setTexto(e.target.value);
          setError(null);
        }}
        maxLength={MAX_PLANTILLA}
        rows={7}
        className="mt-1 w-full rounded border border-borde-fuerte p-2 font-mono text-xs text-tinta"
      />
      <p className="text-xs text-tinta-tenue">
        Usa las variables entre llaves; se llenan con los datos de cada lead:
      </p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {Object.entries(VARIABLES).map(([variable, etiqueta]) => (
          <li key={variable} title={etiqueta} className="rounded-full bg-hoja px-2.5 py-0.5 font-mono text-xs text-tinta">
            {`{${variable}}`}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-tinta-tenue">
        Se guarda solo en este navegador: en otro equipo, o si borras los datos del navegador, verás la
        original.
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-alerta-hondo">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="submit"
          className="btn btn-sm bg-tinta text-white hover:bg-tinta-hondo"
        >
          Guardar como mi plantilla
        </button>
        <button
          type="button"
          onClick={() => alTerminar(false)}
          className="btn btn-sm btn-suave"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
