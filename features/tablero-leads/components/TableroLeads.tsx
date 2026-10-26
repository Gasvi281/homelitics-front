"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection,
  useDraggable, useDroppable, useSensor, useSensors,
  type Active, type Announcements, type CollisionDetection, type DragEndEvent,
  type DragStartEvent, type KeyboardCoordinateGetter, type Over,
} from "@dnd-kit/core";
import { HomeliticsError } from "@/lib/homelitics-navegador";
import { useHidratado } from "@/lib/hidratado";
import { ETIQUETA_ETAPA, puedeMover } from "@/lib/etapas";
import { useUmbral } from "@/lib/umbral-navegador";
import { useLeadsEnRiesgo } from "@/features/riesgo/hooks";
import type { LeadCard, Stage } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";
import { Cargando } from "@/components/Cargando";
import { ModalPerdido } from "@/components/ModalPerdido";
import { ETAPAS_ABIERTAS, esVistaCerrados, LIMITE_TABLERO, type FiltrosTablero } from "../claves";
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
 * "Perdido" (2.11 — HU-09 AC1) es otra zona de soltar, fija abajo a la
 * derecha y visible solo mientras se arrastra (acepta cualquier etapa
 * abierta; con teclado se llega con flecha abajo). Soltar ahí no llama al
 * API: abre ModalPerdido, y solo al confirmar el motivo corre el movimiento
 * optimista y la tarjeta sale del tablero.
 *
 * Con `?etapa=WON|LOST` (2.12 — HU-09 AC2) no hay tablero sino una lista de
 * solo lectura de los cerrados, sin arrastre.
 *
 * Leads en riesgo (2.15 — HU-10 AC3): las tarjetas que GET /leads/at-risk
 * devuelve con el umbral vigente salen con borde rojo y una etiqueta. La
 * consulta va aparte del tablero: si falla, el tablero sigue igual, sin
 * resaltar, y una línea lo dice. `umbral` es lo que leyó la página con
 * `leerUmbral()`; `useUmbral()` lo sigue si se cambia en otra parte.
 *
 * Con `?riesgo=1` (2.16 — HU-10 AC2) solo quedan las tarjetas en riesgo.
 * Es un filtro del front sobre la misma lista: mientras no se sepa cuáles
 * están en riesgo, o si esa consulta falló sin dato anterior, el tablero no
 * se muestra a medias, lo dice.
 *
 * Pendiente de 2.10: el menú "Mover a…" (táctil y alternativa sin arrastre).
 */
export function TableroLeads({ filtros, umbral }: { filtros: FiltrosTablero; umbral: number }) {
  const { data: leads, error, isPending, isFetching } = useLeadsTablero(filtros);
  const [horas] = useUmbral(umbral);
  const riesgo = useLeadsEnRiesgo(horas, { enabled: !esVistaCerrados(filtros) });
  const enRiesgo = new Set(riesgo.data?.map(l => l.id));
  // "Actualizando…" solo después de hidratar: si el dato precargado ya pasó
  // su `staleTime` cuando el navegador hidrata (compilación lenta, pestaña
  // oculta), useQuery relee al montar e `isFetching` es true en el primer
  // render del cliente pero false en el servidor — y React tumba la
  // hidratación por ese <span> de más. Lo mismo con la consulta de riesgo.
  const actualizando = useHidratado() && (isFetching || riesgo.isFetching);
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
  const [porPerder, setPorPerder] = useState<LeadCard | null>(null);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      // Sin Enter para tomar: Enter en la tarjeta (un enlace) abre el lead.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
      coordinateGetter: saltarDeColumna,
    }),
  );

  if (isPending) return <Cargando mensaje="Cargando el tablero…" />;
  if (error && !leads) return <Aviso variante="error">{mensajeError(error)}</Aviso>;
  if (!leads) return null;

  if (esVistaCerrados(filtros)) {
    return (
      <ListaCerrados
        etapa={filtros.etapa!}
        leads={leads}
        actualizando={actualizando}
        error={error ? mensajeError(error) : null}
      />
    );
  }

  const soloRiesgo = filtros.riesgo === "1";
  if (soloRiesgo && !riesgo.data) {
    return riesgo.error ? (
      <Aviso variante="error">
        No pudimos revisar qué leads llevan más de {horas} h sin respuesta. Quita el filtro de riesgo para ver el tablero.
      </Aviso>
    ) : (
      <Cargando compacto mensaje={`Buscando los leads sin respuesta hace más de ${horas} h…`} />
    );
  }

  const columnas = filtros.etapa ? [filtros.etapa] : ETAPAS_ABIERTAS;
  const visibles = soloRiesgo ? leads.filter(l => enRiesgo.has(l.id)) : leads;
  const porEtapa = agrupar(visibles);
  const visiblesEnRiesgo = leads.filter(l => enRiesgo.has(l.id)).length;

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
    // Los dos terminales piden confirmación; ninguno toca la red todavía.
    if (hacia === "WON") setPorConfirmar(lead);
    else if (hacia === "LOST") setPorPerder(lead);
    else mover({ lead, hacia });
  }

  return (
    <div>
      <div className="mb-3 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-tinta-suave">
        <span className="font-bold text-tinta">
          {leads.length === 1 ? "1 lead abierto" : `${leads.length} leads abiertos`}
        </span>
        {(visiblesEnRiesgo > 0 || soloRiesgo) && (
          <span className="insignia bg-alerta-claro text-alerta-hondo">
            {visiblesEnRiesgo === 1 ? "1 sin respuesta" : `${visiblesEnRiesgo} sin respuesta`} hace más de {horas} h
          </span>
        )}
        <span>Arrastra una tarjeta para cambiarla de etapa.</span>
        {actualizando && <span>Actualizando…</span>}
        {error && <span className="font-semibold text-alerta-hondo">{mensajeError(error)}</span>}
        {riesgo.error && (
          <span>
            {riesgo.data
              ? "No pudimos actualizar los leads sin respuesta; el resaltado puede estar desactualizado."
              : `No pudimos revisar qué leads llevan más de ${horas} h sin respuesta; el tablero se muestra sin ese resaltado.`}
          </span>
        )}
      </div>

      {visibles.length > 0 && <RepartoEtapas columnas={columnas} porEtapa={porEtapa} total={visibles.length} />}

      {leads.length === LIMITE_TABLERO && (
        <p className="mb-3 text-sm text-tinta-tenue">
          Se muestran los primeros {LIMITE_TABLERO} leads. Usa los filtros para ver el resto.
        </p>
      )}

      {aviso && (
        <div role="alert" className="mb-4">
          <Aviso variante="error">
            <p>{aviso.mensaje}</p>
            <div className="mt-3 flex gap-2">
              {aviso.reintentar && (
                <button
                  type="button"
                  onClick={() => mover(aviso.reintentar!)}
                  className="btn btn-sm btn-peligro-lleno"
                >
                  Reintentar
                </button>
              )}
              <button
                type="button"
                onClick={() => setAviso(null)}
                className="btn btn-sm btn-peligro"
              >
                Cerrar aviso
              </button>
            </div>
          </Aviso>
        </div>
      )}

      {visibles.length === 0 ? (
        <Aviso>
          {soloRiesgo
            ? `Ningún lead lleva más de ${horas} h sin respuesta con estos filtros.`
            : "No hay leads abiertos con estos filtros."}
        </Aviso>
      ) : (
        <DndContext
          // Id fijo: el que genera @dnd-kit sale de un contador global que
          // no coincide entre servidor y navegador (aria-describedby distinto
          // al hidratar).
          id="tablero-leads"
          sensors={sensores}
          collisionDetection={deteccion}
          accessibility={{ announcements: ANUNCIOS, screenReaderInstructions: INSTRUCCIONES }}
          onDragStart={alEmpezar}
          onDragEnd={alSoltar}
          onDragCancel={() => setActivo(null)}
        >
          <div className="-mx-2 overflow-x-auto px-2 pb-2">
            <div className="flex gap-4">
              {columnas.map(etapa => (
                <Columna
                  key={etapa}
                  etapa={etapa}
                  leads={porEtapa.get(etapa) ?? []}
                  activo={activo}
                  moviendose={moviendose}
                  enRiesgo={enRiesgo}
                  umbral={horas}
                />
              ))}
              <ZonaGanado activo={activo} />
            </div>
          </div>
          <ZonaPerdido activo={activo} />
          <DragOverlay>
            {activo && (
              <div className="rotate-1 cursor-grabbing rounded-2xl shadow-[0_16px_40px_rgba(19,48,58,0.25)]">
                <TarjetaLead lead={activo} enRiesgo={enRiesgo.has(activo.id)} umbral={horas} />
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

      {porPerder && (
        <ModalPerdido
          cliente={porPerder.client_name}
          alCancelar={() => setPorPerder(null)}
          alConfirmar={({ lost_reason, note }) => {
            mover({ lead: porPerder, hacia: "LOST", lost_reason, note });
            setPorPerder(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Vista de cerrados (2.12 — HU-09 AC2): los leads de `?etapa=WON|LOST`, pedidos
 * sin `active`, en lista y de solo lectura. Cada tarjeta abre el lead, donde
 * el historial muestra el motivo de pérdida.
 */
function ListaCerrados({
  etapa, leads, actualizando, error,
}: {
  etapa: Stage;
  leads: LeadCard[];
  actualizando: boolean;
  error: string | null;
}) {
  const nombre = etapa === "LOST" ? "perdido" : "ganado";
  return (
    <div>
      <div className="mb-3 flex min-h-5 flex-wrap items-center gap-x-4 text-sm text-tinta-suave">
        <span className="font-bold text-tinta">
          {leads.length === 1 ? `1 lead ${nombre}` : `${leads.length} leads ${nombre}s`}
        </span>
        {actualizando && <span>Actualizando…</span>}
        {error && <span className="font-semibold text-alerta-hondo">{error}</span>}
      </div>
      {leads.length === LIMITE_TABLERO && (
        <p className="mb-3 text-sm text-tinta-tenue">
          Se muestran los primeros {LIMITE_TABLERO} leads. Usa los filtros para ver el resto.
        </p>
      )}
      {leads.length === 0 ? (
        <Aviso>No hay leads {nombre}s con estos filtros.</Aviso>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {leads.map(lead => (
            <li key={lead.id}>
              <TarjetaLead lead={lead} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tonos de azul del embudo, del primer paso al más avanzado. */
const TONO_ETAPA: Partial<Record<Stage, string>> = {
  INTERESTED: "#9fb7f2",
  VISIT_SCHEDULED: "#5f80e0",
  VISITED: "#2448c9",
  NEGOTIATING: "#13307e",
};

/**
 * Barra que reparte los leads visibles entre las columnas: de un vistazo se
 * ve dónde se acumulan. Es un resumen de lo que ya está en pantalla, no un
 * dato nuevo; por eso basta con su texto alternativo.
 */
function RepartoEtapas({
  columnas, porEtapa, total,
}: {
  columnas: readonly Stage[];
  porEtapa: Map<Stage, LeadCard[]>;
  total: number;
}) {
  const partes = columnas
    .map(etapa => ({ etapa, n: porEtapa.get(etapa)?.length ?? 0 }))
    .filter(p => p.n > 0);
  const resumen = partes.map(p => `${p.n} en ${ETIQUETA_ETAPA[p.etapa]}`).join(", ");
  return (
    <div role="img" aria-label={`Reparto de los ${total} leads: ${resumen}`} className="mb-5 flex h-3 gap-1">
      {partes.map(p => (
        <span
          key={p.etapa}
          title={`${ETIQUETA_ETAPA[p.etapa]}: ${p.n}`}
          className="h-3 first:rounded-l-full last:rounded-r-full"
          style={{ flexGrow: p.n, backgroundColor: TONO_ETAPA[p.etapa] ?? "#2448c9" }}
        />
      ))}
    </div>
  );
}

/** Mientras se arrastra: ¿esta etapa acepta la tarjeta? `null` si no hay arrastre. */
function acepta(activo: LeadCard | null, etapa: Stage): boolean | null {
  return activo ? puedeMover(activo.current_stage, etapa) : null;
}

/** Mientras se arrastra, las columnas válidas se marcan en azul y las demás se apagan. */
function estiloDestino(valida: boolean | null, encima: boolean): string {
  if (valida === null) return "bg-hoja";
  if (!valida) return "bg-hoja opacity-40";
  return encima ? "bg-plano-claro ring-2 ring-plano" : "bg-plano-tenue ring-2 ring-plano-borde";
}

function Columna({
  etapa, leads, activo, moviendose, enRiesgo, umbral,
}: {
  etapa: Stage;
  leads: LeadCard[];
  activo: LeadCard | null;
  moviendose: Set<string>;
  enRiesgo: Set<string>;
  umbral: number;
}) {
  const valida = acepta(activo, etapa);
  const { setNodeRef, isOver } = useDroppable({ id: etapa, disabled: valida === false });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`columna-${etapa}`}
      className={`w-72 shrink-0 rounded-[22px] p-3.5 transition-[opacity,box-shadow] xl:w-auto xl:min-w-0 xl:flex-1 ${estiloDestino(valida, isOver)}`}
    >
      <h2 id={`columna-${etapa}`} className="mx-1.5 mt-0.5 mb-1 flex items-baseline justify-between">
        <span className="font-display text-[19px] font-bold">{ETIQUETA_ETAPA[etapa]}</span>
        <span className="font-display text-[26px] font-extrabold">{leads.length}</span>
      </h2>
      {leads.length === 0 ? (
        <p className="mt-3 rounded-2xl border-[1.5px] border-dashed border-borde-fuerte px-3 py-4 text-center text-sm text-tinta-tenue">
          Sin leads en esta etapa
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {leads.map(lead => (
            <li key={lead.id}>
              <TarjetaArrastrable
                lead={lead}
                pendiente={moviendose.has(lead.id)}
                enRiesgo={enRiesgo.has(lead.id)}
                umbral={umbral}
              />
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
function TarjetaArrastrable({
  lead, pendiente, enRiesgo, umbral,
}: {
  lead: LeadCard;
  pendiente: boolean;
  enRiesgo: boolean;
  umbral: number;
}) {
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
        enRiesgo={enRiesgo}
        umbral={umbral}
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
      className={`flex w-44 shrink-0 flex-col rounded-[22px] border-2 border-dashed p-3.5 transition-[opacity,box-shadow] ${
        valida && isOver ? "border-montana bg-montana-claro" : valida ? "border-montana bg-[#eef7f1]" : valida === false ? "border-borde-fuerte opacity-40" : "border-borde-fuerte"
      }`}
    >
      <h2 id="zona-ganado" className="font-display text-[19px] font-bold text-montana-hondo">
        {ETIQUETA_ETAPA.WON}
      </h2>
      <p className="mt-2 text-sm leading-snug text-tinta-suave">
        Suelta aquí un lead en negociación para cerrarlo como ganado.
      </p>
    </section>
  );
}

/**
 * Zona de soltar de LOST. `fixed` para que se vea aunque las columnas tengan
 * scroll horizontal. Siempre montada (así @dnd-kit la mide al empezar el
 * arrastre, como a las columnas) pero `invisible` y fuera del árbol de
 * accesibilidad mientras no se arrastra; `visibility` no cambia su rectángulo.
 */
function ZonaPerdido({ activo }: { activo: LeadCard | null }) {
  const valida = acepta(activo, "LOST");
  const { setNodeRef, isOver } = useDroppable({ id: "LOST", disabled: valida === false });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby="zona-perdido"
      aria-hidden={activo ? undefined : true}
      className={`fixed right-6 bottom-6 z-20 w-60 rounded-[22px] border-2 border-dashed border-alerta-borde p-4 shadow-[0_16px_40px_rgba(19,48,58,0.25)] transition-[opacity,box-shadow] ${
        activo ? "visible" : "invisible"
      } ${valida && isOver ? "bg-alerta-claro ring-2 ring-alerta" : valida ? "bg-white ring-2 ring-alerta-borde" : "bg-hoja opacity-60"}`}
    >
      <h2 id="zona-perdido" className="font-display text-[19px] font-bold text-alerta-hondo">
        {ETIQUETA_ETAPA.LOST}
      </h2>
      <p className="mt-1 text-sm leading-snug text-tinta-suave">
        Suelta aquí para cerrarlo como perdido. Te pedimos el motivo antes de guardarlo.
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
      className="dialogo"
    >
      <h2 id="confirmar-ganado" className="font-display text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
        ¿Marcar este lead como ganado?
      </h2>
      <p className="mt-3 text-base leading-relaxed text-tinta-suave">
        {lead.client_name ?? "El cliente sin nombre registrado"}
        {lead.listing_address ? ` (${lead.listing_address})` : ""} pasa a Ganado y sale del
        tablero activo. Es definitivo: después no se puede mover a otra etapa, y se cancelan
        sus visitas abiertas.
      </p>
      <div className="mt-7 flex justify-end gap-2.5">
        <button type="button" autoFocus onClick={alCancelar} className="btn btn-secundario">
          Volver
        </button>
        <button type="button" onClick={alConfirmar} className="btn btn-exito">
          Marcar como ganado
        </button>
      </div>
    </dialog>
  );
}

/* ---------- arrastre: detección, teclado y anuncios ---------- */

/**
 * El puntero manda; con teclado no hay puntero y se usa el rectángulo de la
 * tarjeta. La zona Perdido flota encima de las columnas: si el puntero está
 * sobre ella, gana ella aunque debajo haya una columna. Con teclado no se le
 * da prioridad, porque la tarjeta puede rozarla de paso al saltar de columna;
 * ahí se llega con flecha abajo, que la deja centrada encima.
 */
const deteccion: CollisionDetection = args => {
  const bajoPuntero = pointerWithin(args);
  if (bajoPuntero.length === 0) return rectIntersection(args);
  const perdido = bajoPuntero.find(c => c.id === "LOST");
  return perdido ? [perdido] : bajoPuntero;
};

/**
 * Con teclado, cada flecha lateral lleva la tarjeta al centro de la siguiente
 * columna válida en esa dirección (las demás ni cuentan), en vez de avanzar
 * de a 25 px como hace @dnd-kit por defecto. La validez sale de
 * `puedeMover()` y no del `disabled` de cada columna: ese llega un render
 * después de tomar la tarjeta, y una flecha rápida lo alcanzaría a ganar.
 *
 * La zona Perdido no entra en ese recorrido lateral (es fija y su posición
 * no sigue el orden de las columnas): flecha abajo la deja centrada encima,
 * y desde ahí una flecha lateral la sube de vuelta a una columna.
 */
const saltarDeColumna: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const abajo = event.code === "ArrowDown";
  const sentido = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (sentido === 0 && !abajo) return undefined;
  event.preventDefault();

  const lead = context.active ? leadDe(context.active) : null;
  const tarjeta = context.collisionRect;
  if (!lead || !tarjeta) return currentCoordinates;
  const zona = context.droppableRects.get("LOST");

  if (abajo) {
    if (!zona || !puedeMover(lead.current_stage, "LOST")) return currentCoordinates;
    return {
      x: currentCoordinates.x + zona.left + (zona.width - tarjeta.width) / 2 - tarjeta.left,
      y: currentCoordinates.y + zona.top + (zona.height - tarjeta.height) / 2 - tarjeta.top,
    };
  }

  const centro = tarjeta.left + tarjeta.width / 2;
  const siguiente = context.droppableContainers
    .getEnabled()
    .filter(c => c.id !== "LOST" && puedeMover(lead.current_stage, c.id as Stage))
    .map(c => context.droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .filter(r => sentido * (r.left + r.width / 2 - centro) > 1)
    .sort((a, b) => sentido * (a.left - b.left))[0];
  if (!siguiente) return currentCoordinates;

  // Si viene de la zona Perdido, la sube a la parte de arriba de la columna.
  const enZona = zona && tarjeta.top + tarjeta.height / 2 >= zona.top && tarjeta.left + tarjeta.width / 2 >= zona.left;
  return {
    x: currentCoordinates.x + siguiente.left + (siguiente.width - tarjeta.width) / 2 - tarjeta.left,
    y: enZona ? currentCoordinates.y + siguiente.top + 16 - tarjeta.top : currentCoordinates.y,
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
    "Para cambiar de etapa, presiona espacio para tomar la tarjeta, usa las flechas izquierda y derecha para llevarla a otra columna, o la flecha abajo para llevarla a Perdido, y espacio para soltarla. Escape cancela. Enter abre el lead.",
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
      : over?.id === "LOST"
        ? `Soltaste a ${nombreDe(active)} en Perdido. Elige el motivo para cerrarlo; si cancelas, se queda donde estaba.`
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
