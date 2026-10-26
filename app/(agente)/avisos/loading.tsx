import { Cargando } from "@/components/Cargando";

export default function CargandoPagina() {
  return (
    <div className="px-9 py-8">
      <Cargando mensaje="Cargando los avisos…" />
    </div>
  );
}
