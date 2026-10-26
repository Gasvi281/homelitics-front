/**
 * Estado de carga para los `loading.tsx` y las vistas que esperan al API.
 * El API duerme sin tráfico y la primera petición del día puede tardar
 * hasta un minuto: lo decimos siempre, para que nadie crea que se colgó.
 */
export function Cargando({ mensaje, compacto = false }: { mensaje: string; compacto?: boolean }) {
  return (
    <div
      role="status"
      className={`flex items-center gap-4 rounded-2xl bg-sol-claro text-sol-texto ${compacto ? "px-4 py-3" : "px-6 py-5"}`}
    >
      <span className="flex shrink-0 gap-1 animate-pulso" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-current" />
        <span className="h-2 w-2 rounded-full bg-current" />
        <span className="h-2 w-2 rounded-full bg-current" />
      </span>
      <span className="text-[15px] leading-relaxed">
        <strong className="font-bold">{mensaje}</strong>{" "}
        La primera consulta del día puede tardar hasta un minuto: el servicio se duerme sin uso.
      </span>
    </div>
  );
}
