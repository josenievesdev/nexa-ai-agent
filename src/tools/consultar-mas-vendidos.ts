import { sql } from "../database/db.js";

export type ConsultarMasVendidosArgs = {
  sucursal?: string | null;
  limite?: number | null;
};

export async function consultarMasVendidos(args: ConsultarMasVendidosArgs) {
  const sucursal = args.sucursal?.trim() || null;
  const limite = Math.max(
    1,
    Math.min(50, Math.floor(Number(args.limite ?? 10)))
  );

  if (sucursal) {
    return sql`
      select
        producto_id,
        sku,
        nombre_generico,
        concentracion,
        presentacion,
        sucursal,
        unidades_vendidas_30d,
        ventas_30d,
        numero_ventas_30d
      from vw_ventas_producto_30d
      where lower(sucursal) = lower(${sucursal})
      order by
        unidades_vendidas_30d desc,
        ventas_30d desc
      limit ${limite}
    `;
  }

  return sql`
    select
      producto_id,
      sku,
      nombre_generico,
      concentracion,
      presentacion,
      sucursal,
      unidades_vendidas_30d,
      ventas_30d,
      numero_ventas_30d
    from vw_ventas_producto_30d
    order by
      unidades_vendidas_30d desc,
      ventas_30d desc
    limit ${limite}
  `;
}
