"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection,
  useDraggable, useDroppable, useSensor, useSensors,
  type Active, type Announcements, type CollisionDetection, type DragEndEvent,
  type DragStartEvent, type KeyboardCoordinateGetter, type Over,
} from "@dnd-kit/core";
import { HomeliticsError } from "@/lib/homelitics-navegador";
import { ETIQUETA_ETAPA, puedeMover } from "@/lib/etapas";
import type { LeadCard, Stage } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";
import { ETAPAS_ABIERTAS, LIMITE_TABLERO, type FiltrosTablero } from "../claves";
import {
  mensajeErrorMover, useLeadsMoviendose, useLeadsTablero, useMoverLead, type MoverLead,
} from "../hooks";
import { TarjetaLead } from "./TarjetaLead";

/**
 * Tablero de leads (2.8 — HU-06 AC1) con cambio de etapa por arrastre
 * (2.10 — HU-06 AC2). Los filtros llegan como prop desde la página, no de
 * `useSearchParams`: así la key es exactamente la que precargó el servidor.
 *
 * Arrastre con @dnd-kit/core: puntero con 8 px de distancia de activación
 * (un clic sigue abriendo el lead) y teclado (espacio toma y suelta, las
 * flechas saltan de columna, Enter sigue abriendo el lead). Mientras se
 * arrastra solo quedan activas las columnas que `puedeMover()` permite; soltar
 * en cualquier otra parte no llama al API. "Ganado" es una zona de soltar, no
 * una columna, y pide confirmación porque es terminal.
 *
 * Pendiente de 2.10: el menú "Mover a…" (táctil y alternativa sin arrastre).
 * "Perdido" es 2.11.
 */
export function TableroLeads({ filtros }: { filtros: FiltrosTablero }) {
  const { data: leads, error, isPending, isFetching } = useLeadsTablero(filtros);
  const moviendose = useLeadsMoviendose();
  const [aviso, setAviso] = useState<{ mensaje: string; reintentar?: MoverLead } | null>(null);
  const moverLead = useMoverLead({
    alFallar: (e, vars) =>
      setAviso({
        mensaje: mensajeErrorMover(e),
        reintentar: e instanceof HomeliticsError && e.kind === "red" ? vars : undefined,
      }),
  });
  const [activo, setActivo] = useState<LeadCard | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<LeadCard | null>(null);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      // Sin Enter para tomar: Enter en la tarjeta (un enlace) abre el lead.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
      coordinateGetter: saltarDeColumna,
    }),
  );

  if (isPending) {
    return (
      <Aviso>
        <p>Cargando el tablero…</p>
        <p className="mt-1 text-xs text-neutral-400">
          Puede tardar hasta un minuto la primera vez: el servicio se duerme sin uso.
        </p>
      </Aviso>
    );
  }
  if (error && !leads) return <Aviso variante="error">{mensajeError(error)}</Aviso>;
  if (!leads) return null;

  const columnas = filtros.etapa ? [filtros.etapa] : ETAPAS_ABIERTAS;
  const porEtapa = agrupar(leads);

  function mover(vars: MoverLead) {
    setAviso(null);
    moverLead.mutate(vars);
  }

  // El aviso anterior no se cierra aquí: el tablero se correría hacia arriba
  // en pleno arrastre. Lo cierra `mover()`.
  function alEmpezar({ active }: DragStartEvent) {
    setActivo(leadDe(active));
  }

  function alSoltar({ active, over }: DragEndEvent) {
    setActivo(null);
    const lead = leadDe(active);
    const hacia = over?.id as Stage | undefined;
    // Una columna deshabilitada nunca llega como `over`; esto es por si acaso.
    if (!lead || !hacia || !puedeMover(lead.current_stage, hacia)) return;
    if (hacia === "WON") setPorConfirmar(lead);
    else mover({ lead, hacia });
  }

  return (
    <div>
      <div className="mb-2 flex min-h-5 flex-wrap items-center gap-x-4 text-xs text-neutral-500">
        <span>{leads.length === 1 ? "1 lead abierto" : `${leads.length} leads abiertos`}</span>
        {isFetching && <span>Actualizando…</span>}
        {error && <span className="text-red-700">{mensajeError(error)}</span>}
      </div>

      {leads.length === LIMITE_TABLERO && (
        <p className="mb-3 text-xs text-neutral-500">
          Se muestran los primeros {LIMITE_TABLERO} leads. Usa los filtros para ver el resto.
        </p>
      )}

      {aviso && (
        <div role="alert" className="mb-4">
          <Aviso variante="error">
            <p>{aviso.mensaje}</p>
            <div className="mt-3 flex justify-center gap-2">
              {aviso.reintentar && (
                <button
                  type="button"
                  onClick={() => mover(aviso.reintentar!)}
                  className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
                >
                  Reintentar
                </button>
              )}
              <button
                type="button"
                onClick={() => setAviso(null)}
                className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Cerrar aviso
              </button>
            </div>
          </Aviso>
        </div>
      )}

      {leads.length === 0 ? (
        <Aviso>No hay leads abiertos con estos filtros.</Aviso>
      ) : (
        <DndContext
          sensors={sensores}
          collisionDetection={deteccion}
          accessibility={{ announcements: ANUNCIOS, screenReaderInstructions: INSTRUCCIONES }}
          onDragStart={alEmpezar}
          onDragEnd={alSoltar}
          onDragCancel={() => setActivo(null)}
        >
          <div className="-mx-4 overflow-x-auto px-4 pb-2">
            <div className="flex gap-4">
              {columnas.map(etapa => (
                <Columna
                  key={etapa}
                  etapa={etapa}
                  leads={porEtapa.get(etapa) ?? []}
                  activo={activo}
                  moviendose={moviendose}
                />
              ))}
              <ZonaGanado activo={activo} />
            </div>
          </div>
          <DragOverlay>
            {activo && (
              <div className="rotate-1 cursor-grabbing rounded-lg shadow-lg">
                <TarjetaLead lead={activo} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {porConfirmar && (
        <ConfirmarGanado
          lead={porConfirmar}
          alCancelar={() => setPorConfirmar(null)}
          alConfirmar={() => {
            mover({ lead: porConfirmar, hacia: "WON" });
            setPorConfirmar(null);
          }}
        />
      )}
    </div>
  );
}

/** Mientras se arrastra: ¿esta etapa acepta la tarjeta? `null` si no hay arrastre. */
function acepta(activo: LeadCard | null, etapa: Stage): boolean | null {
  return activo ? puedeMover(activo.current_stage, etapa) : null;
}

function estiloDestino(valida: boolean | null, encima: boolean): string {
  if (valida === null) return "bg-neutral-50";
  if (!valida) return "bg-neutral-50 opacity-40";
  return encima ? "bg-emerald-100 ring-2 ring-emerald-600" : "bg-emerald-50 ring-2 ring-emerald-300";
}

function Columna({
  etapa, leads, activo, moviendose,
}: {
  etapa: Stage;
  leads: LeadCard[];
  activo: LeadCard | null;
  moviendose: Set<string>;
}) {
  const valida = acepta(activo, etapa);
  const { setNodeRef, isOver } = useDroppable({ id: etapa, disabled: valida === false });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`columna-${etapa}`}
      className={`w-72 shrink-0 rounded-lg p-3 transition-[opacity,box-shadow] lg:w-auto lg:min-w-0 lg:flex-1 ${estiloDestino(valida, isOver)}`}
    >
      <h2 id={`columna-${etapa}`} className="flex items-baseline justify-between text-sm font-semibold text-neutral-900">
        {ETIQUETA_ETAPA[etapa]}
        <span className="text-xs font-normal text-neutral-500">{leads.length}</span>
      </h2>
      {leads.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-400">Sin leads en esta etapa</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {leads.map(lead => (
            <li key={lead.id}>
              <TarjetaArrastrable lead={lead} pendiente={moviendose.has(lead.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Los listeners van en un envoltorio y no en el enlace: así el enlace
 * conserva su rol (no se vuelve `role="button"`) y los eventos le llegan
 * igual por burbujeo. Una tarjeta con un movimiento en vuelo no se arrastra.
 */
function TarjetaArrastrable({ lead, pendiente }: { lead: LeadCard; pendiente: boolean }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
    disabled: pendiente,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={pendiente ? "cursor-progress" : isDragging ? "opacity-40" : "cursor-grab"}
    >
      <TarjetaLead
        lead={lead}
        pendiente={pendiente}
        descripcion={pendiente ? undefined : attributes["aria-describedby"]}
      />
    </div>
  );
}

function ZonaGanado({ activo }: { activo: LeadCard | null }) {
  const valida = acepta(activo, "WON");
  const { setNodeRef, isOver } = useDroppable({ id: "WON", disabled: valida === false });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby="zona-ganado"
      className={`flex w-44 shrink-0 flex-col rounded-lg border-2 border-dashed border-neutral-300 p-3 transition-[opacity,box-shadow] ${estiloDestino(valida, isOver)}`}
    >
      <h2 id="zona-ganado" className="text-sm font-semibold text-neutral-900">
        {ETIQUETA_ETAPA.WON}
      </h2>
      <p className="mt-3 text-xs text-neutral-500">
        Suelta aquí un lead en negociación para cerrarlo como ganado.
      </p>
    </section>
  );
}

/**
 * Confirmación antes de WON: es terminal y cancela las visitas abiertas del
 * lead (docs/API_CONTRACT.md, POST /leads/{id}/transitions). `<dialog>`
 * modal nativo: atrapa el foco y cierra con Escape sin código extra. El foco
 * arranca en "Cancelar", la opción que no rompe nada.
 */
function ConfirmarGanado({
  lead, alConfirmar, alCancelar,
}: {
  lead: LeadCard;
  alConfirmar: () => void;
  alCancelar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialogo = ref.current;
    dialogo?.showModal();
    return () => dialogo?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirmar-ganado"
      onCancel={e => {
        e.preventDefault();
        alCancelar();
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg bg-white p-6 shadow-xl backdrop:bg-black/40"
    >
      <h2 id="confirmar-ganado" className="text-base font-semibold text-neutral-900">
        ¿Marcar este lead como ganado?
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        {lead.client_name ?? "El cliente sin nombre registrado"}
        {lead.listing_address ? ` (${lead.listing_address})` : ""} pasa a Ganado y sale del
        tablero activo. Es definitivo: después no se puede mover a otra etapa, y se cancelan
        sus visitas abiertas.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          onClick={alCancelar}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={alConfirmar}
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Marcar como ganado
        </button>
      </div>
    </dialog>
  );
}

/* ---------- arrastre: detección, teclado y anuncios ---------- */

/** El puntero manda; con teclado no hay puntero y se usa el rectángulo de la tarjeta. */
const deteccion: CollisionDetection = args => {
  const bajoPuntero = pointerWithin(args);
  return bajoPuntero.length > 0 ? bajoPuntero : rectIntersection(args);
};

/**
 * Con teclado, cada flecha lateral lleva la tarjeta al centro de la siguiente
 * columna válida en esa dirección (las demás ni cuentan), en vez de avanzar
 * de a 25 px como hace @dnd-kit por defecto. La validez sale de
 * `puedeMover()` y no del `disabled` de cada columna: ese llega un render
 * después de tomar la tarjeta, y una flecha rápida lo alcanzaría a ganar.
 */
const saltarDeColumna: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const sentido = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (sentido === 0) return undefined;
  event.preventDefault();

  const lead = context.active ? leadDe(context.active) : null;
  const tarjeta = context.collisionRect;
  if (!lead || !tarjeta) return currentCoordinates;
  const centro = tarjeta.left + tarjeta.width / 2;

  const siguiente = context.droppableContainers
    .getEnabled()
    .filter(c => puedeMover(lead.current_stage, c.id as Stage))
    .map(c => context.droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .filter(r => sentido * (r.left + r.width / 2 - centro) > 1)
    .sort((a, b) => sentido * (a.left - b.left))[0];
  if (!siguiente) return currentCoordinates;

  return {
    x: currentCoordinates.x + siguiente.left + (siguiente.width - tarjeta.width) / 2 - tarjeta.left,
    y: currentCoordinates.y,
  };
};

function leadDe(a: Active): LeadCard | null {
  return (a.data.current?.lead as LeadCard | undefined) ?? null;
}

function nombreDe(a: Active): string {
  return leadDe(a)?.client_name ?? "el lead sin nombre registrado";
}

function destinoDe(over: Over | null): string | null {
  return over ? ETIQUETA_ETAPA[over.id as Stage] : null;
}

const INSTRUCCIONES = {
  draggable:
    "Para cambiar de etapa, presiona espacio para tomar la tarjeta, usa las flechas izquierda y derecha para llevarla a otra columna y espacio para soltarla. Escape cancela. Enter abre el lead.",
};

const ANUNCIOS: Announcements = {
  onDragStart: ({ active }) => {
    const lead = leadDe(active);
    return `Tomaste a ${nombreDe(active)}, en ${lead ? ETIQUETA_ETAPA[lead.current_stage] : "su etapa"}.`;
  },
  onDragOver: ({ active, over }) =>
    destinoDe(over)
      ? `${nombreDe(active)} está sobre ${destinoDe(over)}.`
      : `${nombreDe(active)} no está sobre una columna a la que pueda pasar.`,
  onDragEnd: ({ active, over }) =>
    over?.id === "WON"
      ? `Soltaste a ${nombreDe(active)} en Ganado. Confirma para cerrarlo.`
      : destinoDe(over)
        ? `Moviste a ${nombreDe(active)} a ${destinoDe(over)}.`
        : `Soltaste a ${nombreDe(active)} fuera de una columna válida; no se movió.`,
  onDragCancel: ({ active }) => `Cancelaste. ${nombreDe(active)} se queda donde estaba.`,
};

/** Conserva el orden del API (`updated_at` descendente) dentro de cada columna. */
function agrupar(leads: LeadCard[]): Map<Stage, LeadCard[]> {
  const mapa = new Map<Stage, LeadCard[]>();
  for (const l of leads) {
    (mapa.get(l.current_stage) ?? mapa.set(l.current_stage, []).get(l.current_stage)!).push(l);
  }
  return mapa;
}

function mensajeError(e: unknown): string {
  if (!(e instanceof HomeliticsError)) return "No se pudo cargar el tablero. Intenta de nuevo.";
  switch (e.kind) {
    case "red":
      return "No pudimos conectarnos con el servicio. Puede estar despertando (tarda hasta un minuto); recarga en unos segundos.";
    case "invalido":
      return `Revisa los filtros: ${e.detail}`;
    default:
      return e.detail;
  }
}
