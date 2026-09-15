import Link from "next/link";
import { api, HomeliticsError } from "@/lib/homelitics";
import { Aviso } from "@/components/Aviso";
import { ETIQUETA_ESTADO } from "@/components/TarjetaCita";
import { fechaHoraLarga } from "@/lib/format";
import type { Appointment, Stage } from "@/lib/schemas";

/**
 * Herramienta de desarrollo, no una de las cinco pantallas del sprint (ver
 * docs/SPRINT_LINEA2.md) — no tiene criterio de "done" propio. Existe para no
 * tener que armar URLs a mano ni pegarle al proxy con curl para encontrar
 * leads/citas reales antes de usar el front (ver README.md, "Probar contra
 * el API real"). Funciona igual con USE_MOCKS=true o false.
 */

const ETAPAS: Stage[] = [
  "INTERESTED", "VISIT_SCHEDULED", "VISITED", "NEGOTIATING", "WON", "LOST",
];

export default async function ExplorarPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;

  let yo, leads;
  try {
    [yo, leads] = await Promise.all([api.yo(), api.leads({ stage, limit: 15 })]);
  } catch (e) {
    return (
      <Contenedor>
        <Aviso variante="error">{mensajeError(e)}</Aviso>
      </Contenedor>
    );
  }

  const [citasPorLead, listingPorLead] = await Promise.all([
    Promise.all(leads.map((lead) => api.citasDelLead(lead.id).catch(() => [] as Appointment[]))),
    Promise.all(leads.map((lead) => api.listing(lead.listing_id).catch(() => null))),
  ]);

  return (
    <Contenedor>
      <h1 className="text-lg font-semibold text-neutral-900">Explorador de datos (solo dev)</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Conectado como <strong>{yo.full_name ?? yo.id}</strong> ({yo.role}), agencia{" "}
        <code className="text-xs">{yo.agency_id}</code>.
      </p>
      <p className="mt-1 text-sm text-neutral-500">
        Un lead <strong>tuyo</strong> nace con la cita en `CONFIRMED` al agendar (bloqueo 5,
        docs/SPRINT_LINEA2.md); uno de <strong>otro agente</strong> de la agencia debería nacer
        `PENDING_CONFIRMATION`.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <FiltroEtapa actual={stage} label="Todas" />
        {ETAPAS.map((e) => (
          <FiltroEtapa key={e} actual={stage} valor={e} label={e} />
        ))}
      </div>

      {leads.length === 0 && (
        <div className="mt-6">
          <Aviso>No hay leads de la agencia con ese filtro.</Aviso>
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {leads.map((lead, i) => {
          const listing = listingPorLead[i];
          const citas = citasPorLead[i];
          const esTuyo = lead.agent_id === yo.id;
          return (
            <li key={lead.id} className="rounded-lg border border-neutral-200 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium">
                  {lead.current_stage}
                </span>
                <span
                  title={lead.agent_id}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    esTuyo
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {esTuyo ? "tu lead" : "de otro agente"}
                </span>
                <code className="text-xs text-neutral-400">{lead.id}</code>
              </div>

              <p className="mt-2 text-neutral-600">
                {listing
                  ? `${listing.address ?? "sin dirección"} · ${listing.city ?? "?"}`
                  : "no se pudo leer la propiedad de este lead"}
              </p>

              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <Link className="underline" href={`/propiedades/${lead.listing_id}/agendar?leadId=${lead.id}`}>
                  2.1 elegir horario →
                </Link>
                <Link className="underline" href={`/leads/${lead.id}`}>
                  2.4 historial →
                </Link>
              </div>

              {citas.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5 border-t border-neutral-100 pt-3 text-xs">
                  {citas.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-neutral-500">{fechaHoraLarga(c.scheduled_at)}</span>
                      <span className="text-neutral-400">{ETIQUETA_ESTADO[c.status]}</span>
                      <Link className="underline" href={`/citas/${c.id}`}>2.3 mover/cancelar →</Link>
                      <Link className="underline" href={`/citas/${c.id}/encuesta`}>2.5 encuesta →</Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Contenedor>
  );
}

function FiltroEtapa({ actual, valor, label }: { actual?: string; valor?: string; label: string }) {
  const activo = actual === valor;
  return (
    <Link
      href={valor ? `/dev/explorar?stage=${valor}` : "/dev/explorar"}
      className={`rounded-full border px-3 py-1 ${
        activo ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-600"
      }`}
    >
      {label}
    </Link>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>;
}

function mensajeError(e: unknown): string {
  if (e instanceof HomeliticsError) {
    if (e.kind === "red") {
      return "No pudimos conectarnos con el servicio. Puede estar despertando (tarda hasta un minuto); recarga en unos segundos.";
    }
    return e.detail;
  }
  return "Algo salió mal. Intenta de nuevo.";
}
