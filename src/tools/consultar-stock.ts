import { sql } from "../database/db.js";

export type ConsultarStockArgs = {
  producto_id: number;
  sucursal?: string | null;
};

export async function consultarStock(args: ConsultarStockArgs) {
  const productoId = Number(args.producto_id);

  if (!Number.isInteger(productoId) || productoId <= 0) {
    throw new Error("producto_id debe ser un entero positivo.");
  }

  const sucursal = args.sucursal?.trim() || null;

  if (sucursal) {
    return sql`
      select
        producto_id,
        sku,
        nombre_generico,
        nombre_comercial,
        concentracion,
        presentacion,
        sucursal_id,
        sucursal,
        stock_fisico,
        stock_reservado,
        stock_disponible,
        lotes_activos,
        ubicaciones_con_stock,
        stock_minimo,
        punto_reorden,
        stock_maximo
      from vw_stock_producto_sucursal
      where
        producto_id = ${productoId}
        and lower(sucursal) = lower(${sucursal})
      order by sucursal
    `;
  }

  return sql`
    select
      producto_id,
      sku,
      nombre_generico,
      nombre_comercial,
      concentracion,
      presentacion,
      sucursal_id,
      sucursal,
      stock_fisico,
      stock_reservado,
      stock_disponible,
      lotes_activos,
      ubicaciones_con_stock,
      stock_minimo,
      punto_reorden,
      stock_maximo
    from vw_stock_producto_sucursal
    where producto_id = ${productoId}
    order by sucursal
  `;
}
