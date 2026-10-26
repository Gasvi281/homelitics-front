import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { FormularioEntrar } from "@/components/FormularioEntrar";
import { Logo } from "@/components/Logo";
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
    <main className="flex min-h-screen flex-wrap">
      <section className="flex min-w-0 flex-[1_1_560px] flex-col gap-10 bg-tinta px-16 py-14 text-white">
        <Logo tamano="md" sobreOscuro />
        <h1 className="max-w-[16ch] font-display text-[64px] leading-none font-extrabold tracking-[-0.035em]">
          Tus clientes ya están escribiendo.
        </h1>
        <div aria-hidden="true" className="flex max-w-[460px] flex-col gap-2.5 text-base">
          <p className="self-start rounded-[18px] rounded-bl-md bg-tinta-hondo px-4 py-3">
            Hola, vi el apartamento de Laureles. ¿Sigue disponible?
          </p>
          <p className="self-end rounded-[18px] rounded-br-md bg-plano px-4 py-3">
            Sí. ¿Te queda bien el martes a las 10:00?
          </p>
          <p className="self-start rounded-[18px] rounded-bl-md bg-tinta-hondo px-4 py-3">Perfecto, allá nos vemos.</p>
        </div>
        <p className="mt-auto max-w-[46ch] text-base leading-relaxed text-sobre-tinta">
          El asistente atiende por Telegram y agenda las visitas. Aquí ves cada conversación, mueves el
          embudo y haces el seguimiento.
        </p>
      </section>

      <section className="flex min-w-0 flex-[1_1_480px] items-center justify-center px-16 py-14">
        <div className="flex w-full max-w-[400px] flex-col gap-5">
          <div>
            <h2 className="font-display text-4xl font-extrabold tracking-[-0.02em]">Entrar</h2>
            <p className="mt-1.5 text-base text-tinta-suave">
              Con el correo y la contraseña de tu cuenta de agente.
            </p>
          </div>

          {error === "sin-agencia" && (
            <Aviso variante="error">
              Tu cuenta no está habilitada para ninguna agencia. Pídele al administrador de tu
              agencia que te dé acceso.
            </Aviso>
          )}

          <FormularioEntrar siguiente={typeof siguiente === "string" ? siguiente : null} />

          <p className="text-sm leading-relaxed text-tinta-suave">
            Si no tienes acceso o olvidaste tu contraseña, pídelo al administrador de tu agencia.
          </p>
        </div>
      </section>
    </main>
  );
}
