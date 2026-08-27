import { sql } from "../database/db.js";
import { identidadProducto, validarProductoId } from "./utilidades.js";

export type ConsultarStockArgs = {
  producto_id: number;
  sucursal?: string | null;
};

type FilaStock = {
  sucursal: string;
  stock_disponible: number;
  stock_fisico: number;
  stock_reservado: number;
  stock_minimo: number;
  punto_reorden: number;
  stock_maximo: number;
  lotes_activos: number;
  ubicaciones_con_stock: number;
};

/*
 * Antes cada fila entregaba seis cifras de stock al mismo nivel más
 * un sucursal_id interno. A "cuánto stock tengo" solo responde una
 * de esas cifras, y en 58 filas reales stock_fisico y
 * stock_disponible difieren: citar la equivocada da un número
 * verificable en la base que contesta otra pregunta.
 *
 * stock_disponible queda como campo principal y el resto baja a
 * detalle. sucursal_id desaparece: el modelo nunca debió verlo.
 *
 * El total por producto viene sumado desde SQL en lugar de dejarlo
 * a la aritmética del modelo.
 */
export async function consultarStock(args: ConsultarStockArgs) {
  const productoId = validarProductoId(args.producto_id);
  const sucursal = args.sucursal?.trim() || null;

  const filtroSucursal = sucursal
    ? sql`and lower(sucursal) = lower(${sucursal})`
    : sql``;

  const [producto, filas] = await Promise.all([
    identidadProducto(productoId),

    sql<FilaStock[]>`
      select
        sucursal,

        stock_disponible::int as stock_disponible,
        stock_fisico::int as stock_fisico,
        stock_reservado::int as stock_reservado,

        coalesce(stock_minimo, 0)::int as stock_minimo,
        coalesce(punto_reorden, 0)::int as punto_reorden,
        coalesce(stock_maximo, 0)::int as stock_maximo,

        lotes_activos::int as lotes_activos,
        ubicaciones_con_stock::int as ubicaciones_con_stock

      from vw_stock_producto_sucursal
      where
        producto_id = ${productoId}
        ${filtroSucursal}
      order by sucursal
    `,
  ]);

  const sucursales = filas.map((fila) => ({
    sucursal: fila.sucursal,
    stock_disponible: fila.stock_disponible,

    detalle: {
      fisico: fila.stock_fisico,
      reservado: fila.stock_reservado,
      minimo: fila.stock_minimo,
      punto_reorden: fila.punto_reorden,
      maximo: fila.stock_maximo,
      lotes_activos: fila.lotes_activos,
      ubicaciones_con_stock: fila.ubicaciones_con_stock,
    },
  }));

  const disponibleTotal = filas.reduce(
    (suma, fila) => suma + fila.stock_disponible,
    0
  );

  const reservadoTotal = filas.reduce(
    (suma, fila) => suma + fila.stock_reservado,
    0
  );

  return {
    producto,

    consulta: {
      sucursal: sucursal ?? "todas",
    },

    resumen: {
      sucursales: sucursales.length,
      stock_disponible_total: disponibleTotal,
      stock_reservado_total: reservadoTotal,

      /*
       * El dato que responde la pregunta es el disponible. Cuando
       * hay reservas, decirlo evita que el modelo presente el
       * físico como si estuviera libre.
       */
      hay_stock_reservado: reservadoTotal > 0,
    },

    sucursales,
  };
}
