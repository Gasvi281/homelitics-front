import type { ReactNode } from "react";

/**
 * Banner de estado (info o error) para las pantallas de cliente. Compartido
 * porque "sin resultados", "no encontrado" y "error de red" se repiten en
 * casi todas las pantallas del sprint (ver docs/API_CONTRACT.md, sección de
 * errores que cambian la UI).
 */
export function Aviso({
  variante = "info",
  children,
}: {
  variante?: "info" | "error";
  children: ReactNode;
}) {
  const estilos =
    variante === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-neutral-200 bg-neutral-50 text-neutral-600";
  return <div className={`rounded-lg border p-6 text-center text-sm ${estilos}`}>{children}</div>;
}
