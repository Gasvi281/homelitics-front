/**
 * Espera mientras el layout de (agente) pregunta GET /me (HU-23, AC5). El
 * layout la usa también como `fallback` de su propio `Suspense`: un
 * `loading.tsx` no envuelve el layout de su mismo segmento.
 */
export default function Cargando() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="rounded-lg border border-neutral-200 p-8 text-center text-sm text-neutral-500">
        <p>Despertando el servicio…</p>
        <p className="mt-1 text-xs text-neutral-400">
          Puede tardar hasta un minuto la primera vez.
        </p>
      </div>
    </main>
  );
}
