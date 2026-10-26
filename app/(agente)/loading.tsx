import { Cargando as Espera } from "@/components/Cargando";

/**
 * Espera mientras el layout de (agente) pregunta GET /me (HU-23, AC5). El
 * layout la usa también como `fallback` de su propio `Suspense`: un
 * `loading.tsx` no envuelve el layout de su mismo segmento.
 */
export default function Cargando() {
  return (
    <main className="px-9 py-8">
      <Espera mensaje="Despertando el servicio…" />
    </main>
  );
}
