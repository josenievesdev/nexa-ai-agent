import { sql } from "../database/db.js";

export type BuscarProductoArgs = {
  nombre?: string;
  sku?: string;
  codigo_barras?: string;
  presentacion?: string;
};

export async function buscarProducto(args: BuscarProductoArgs) {
  const nombre = typeof args.nombre === "string" ? args.nombre.trim() : "";
  const sku = typeof args.sku === "string" ? args.sku.trim() : "";
  const codigoBarras =
    typeof args.codigo_barras === "string"
      ? args.codigo_barras.trim()
      : "";
  const identificador = codigoBarras || sku || nombre;

  if (!identificador) {
    throw new Error(
      "Debe proporcionar el nombre, SKU o código de barras del producto."
    );
  }

  const presentacion =
    typeof args.presentacion === "string"
      ? args.presentacion.trim() || null
      : null;

  const productos = await sql`
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
      ${identificador},
      ${presentacion},
      8
    )
  `;

  /*
   * Cuando hay varias presentaciones, ministral-3:8b tiende a
   * detenerse y pedir aclaración en lugar de encadenar la
   * herramienta que realmente responde la pregunta.
   *
   * Las reglas del system prompt no bastan a esa escala, así que
   * el propio resultado lleva la instrucción del siguiente paso.
   * Con una sola coincidencia no se incluye, porque ahí buscar_producto
   * sí puede ser la respuesta final.
   */
  const siguientePaso =
    productos.length > 1
      ? "NO RESPONDAS TODAVIA. Se encontraron varias presentaciones. Si el usuario preguntó por stock, ubicación, lotes, vencimientos o ventas, ejecuta ahora esa herramienta una vez por cada producto_id de esta lista y agrupa los resultados por presentación. Está prohibido pedir aclaración: el usuario quiere el dato de todas las presentaciones."
      : null;

  return {
    coincidencias: productos.length,
    ...(siguientePaso ? { siguiente_paso: siguientePaso } : {}),
    productos: [...productos],
  };
}
