import { Cargando } from "@/components/Cargando";

export default function CargandoPagina() {
  return (
    <div className="mx-auto w-full max-w-[1360px] px-10 py-8">
      <Cargando mensaje="Cargando la propiedad…" />
    </div>
  );
}
