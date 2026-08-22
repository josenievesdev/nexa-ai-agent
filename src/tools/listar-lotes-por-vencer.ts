import { sql } from "../database/db.js";

export type ListarLotesPorVencerArgs = {
  dias?: number | null;
  sucursal?: string | null;
  limite?: number | null;
};

export async function listarLotesPorVencer(args: ListarLotesPorVencerArgs) {
  const dias = Math.max(
    0,
    Math.min(180, Math.floor(Number(args.dias ?? 30)))
  );

  const limite = Math.max(
    1,
    Math.min(50, Math.floor(Number(args.limite ?? 20)))
  );

  const sucursal = args.sucursal?.trim() || null;

  if (sucursal) {
    return sql`
      select
        producto_id,
        sku,
        nombre_generico,
        concentracion,
        presentacion,
        sucursal,
        bodega,
        codigo_ubicacion,
        numero_lote,
        fecha_vencimiento,
        dias_para_vencer,
        cantidad_disponible
      from vw_lotes_por_vencer
      where
        dias_para_vencer <= ${dias}
        and lower(sucursal) = lower(${sucursal})
      order by
        dias_para_vencer asc,
        nombre_generico
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
      bodega,
      codigo_ubicacion,
      numero_lote,
      fecha_vencimiento,
      dias_para_vencer,
      cantidad_disponible
    from vw_lotes_por_vencer
    where dias_para_vencer <= ${dias}
    order by
      dias_para_vencer asc,
      sucursal,
      nombre_generico
    limit ${limite}
  `;
}
