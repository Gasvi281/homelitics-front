import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { FormularioEntrar } from "@/components/FormularioEntrar";
import { rutaSegura } from "@/lib/redireccion";

/**
 * Login del agente (HU-23, fase 3, AC1).
 *
 * Sin "Crear cuenta" ni "Olvidé mi contraseña": las cuentas las crea un
 * servicio del administrador (PLAN.md, contexto). Con sesión, el middleware
 * no deja llegar aquí: manda a `siguiente` o al tablero.
 *
 * `?error=sin-agencia` lo pone el layout de (agente) cuando GET /me responde
 * 403 (AC4, fase 4).
 *
 * Con `USE_MOCKS=true` no hay a quién autenticar: va directo a `siguiente`
 * o al tablero con el agente del mock (fase 7).
 */
export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string | string[]; error?: string | string[] }>;
}) {
  const { siguiente, error } = await searchParams;
  if (process.env.USE_MOCKS === "true") {
    redirect(rutaSegura(typeof siguiente === "string" ? siguiente : null));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <p className="text-center text-sm font-semibold text-neutral-900">Homelitics</p>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-neutral-900">Entrar al panel de agentes</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Usa el correo y la contraseña de tu cuenta de agente.
          </p>

          {error === "sin-agencia" && (
            <div className="mt-4">
              <Aviso variante="error">
                Tu cuenta no está habilitada para ninguna agencia. Pídele al administrador de tu
                agencia que te dé acceso.
              </Aviso>
            </div>
          )}

          <div className="mt-6">
            <FormularioEntrar siguiente={typeof siguiente === "string" ? siguiente : null} />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-neutral-500">
          Si no tienes acceso o olvidaste tu contraseña, pídelo al administrador de tu agencia.
        </p>
      </div>
    </main>
  );
}
