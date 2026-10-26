"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import type { Agent } from "@/lib/schemas";

/**
 * Barra lateral de las pantallas del agente. Client Component solo por
 * `usePathname`, para marcar dónde está; los datos del agente llegan del
 * layout (GET /me) y el enlace al embudo solo se muestra al admin — el API
 * responde 403 igual a quien no lo es.
 *
 * El perfil de un lead cuenta como "Tablero": se llega a él desde ahí.
 */
export function NavAgente({ agente }: { agente: Agent | null }) {
  const ruta = usePathname();
  const esAdmin = agente?.role === "TEAM_ADMIN";
  const enlaces = [
    { href: "/tablero", texto: "Tablero de leads", activo: ruta.startsWith("/tablero") || ruta.startsWith("/leads") },
    ...(esAdmin ? [{ href: "/embudo", texto: "Embudo de conversión", activo: ruta.startsWith("/embudo") }] : []),
  ];

  return (
    // El fondo va en el envoltorio para que llegue hasta abajo aunque la
    // página sea larga; la navegación queda fija mientras se hace scroll.
    <div className="shrink-0 bg-tinta lg:w-62">
      <nav aria-label="Principal" className="flex flex-col gap-1.5 px-4 py-6 text-white lg:sticky lg:top-0 lg:h-screen">
        <Link href="/tablero" className="mb-6 rounded-lg px-2 focus-visible:outline-sol">
          <Logo tamano="sm" sobreOscuro />
        </Link>
        {enlaces.map(e => (
          <Link
            key={e.href}
            href={e.href}
            aria-current={e.activo ? "page" : undefined}
            className={`flex h-11.5 items-center rounded-full px-4 text-[15px] focus-visible:outline-sol ${
              e.activo ? "bg-white font-bold text-tinta" : "font-semibold text-sobre-tinta hover:bg-tinta-hondo hover:text-white"
            }`}
          >
            {e.texto}
          </Link>
        ))}

        {agente && (
          <div className="mt-auto rounded-[18px] bg-tinta-hondo p-3.5">
            <p className="text-[15px] font-bold">{agente.full_name ?? agente.email ?? "Agente"}</p>
            <p className="text-[13px] text-sobre-tinta">
              {agente.role === "TEAM_ADMIN" ? "Administrador del equipo" : "Agente"}
            </p>
          </div>
        )}
      </nav>
    </div>
  );
}
