import { sql } from "../database/db.js";

export type BuscarProductoArgs = {
  nombre: string;
  presentacion?: string | null;
};

export async function buscarProducto(args: BuscarProductoArgs) {
  const nombre = args.nombre?.trim();

  if (!nombre) {
    throw new Error("El nombre del producto es obligatorio.");
  }

  const presentacion = args.presentacion?.trim() || null;

  return sql`
    select
      producto_id,
      sku,
      nombre_generico,
      nombre_comercial,
      concentracion,
      forma_farmaceutica,
      presentacion,
      precio_venta,
      relevancia
    from buscar_productos(
      ${nombre},
      ${presentacion},
      8
    )
  `;
}
