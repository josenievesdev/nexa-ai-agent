import { sql } from "../database/db.js";

export type ListarStockBajoArgs = {
  sucursal?: string | null;
  limite?: number | null;
};

export async function listarStockBajo(args: ListarStockBajoArgs) {
  const sucursal = args.sucursal?.trim() || null;
  const limite = Math.max(
    1,
    Math.min(50, Math.floor(Number(args.limite ?? 15)))
  );

  if (sucursal) {
    return sql`
      select
        producto_id,
        sku,
        nombre_generico,
        nombre_comercial,
        concentracion,
        presentacion,
        sucursal,
        stock_disponible,
        stock_minimo,
        punto_reorden,
        stock_maximo
      from vw_productos_stock_bajo
      where lower(sucursal) = lower(${sucursal})
      order by
        stock_disponible asc,
        nombre_generico
      limit ${limite}
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
      sucursal,
      stock_disponible,
      stock_minimo,
      punto_reorden,
      stock_maximo
    from vw_productos_stock_bajo
    order by
      stock_disponible asc,
      sucursal,
      nombre_generico
    limit ${limite}
  `;
}
