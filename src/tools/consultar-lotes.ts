import { sql } from "../database/db.js";

export type ConsultarLotesArgs = {
  producto_id: number;
  sucursal?: string | null;
  dias?: number | null;
};

export async function consultarLotes(args: ConsultarLotesArgs) {
  const productoId = Number(args.producto_id);

  if (!Number.isInteger(productoId) || productoId <= 0) {
    throw new Error("producto_id debe ser un entero positivo.");
  }

  const sucursal = args.sucursal?.trim() || null;
  const dias =
    args.dias == null
      ? null
      : Math.max(0, Math.min(3650, Math.floor(Number(args.dias))));

  if (sucursal && dias !== null) {
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
        estado_lote,
        cantidad_disponible
      from vw_inventario_detallado
      where
        producto_id = ${productoId}
        and lower(sucursal) = lower(${sucursal})
        and dias_para_vencer between 0 and ${dias}
      order by dias_para_vencer asc
    `;
  }

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
        estado_lote,
        cantidad_disponible
      from vw_inventario_detallado
      where
        producto_id = ${productoId}
        and lower(sucursal) = lower(${sucursal})
      order by dias_para_vencer asc
    `;
  }

  if (dias !== null) {
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
        estado_lote,
        cantidad_disponible
      from vw_inventario_detallado
      where
        producto_id = ${productoId}
        and dias_para_vencer between 0 and ${dias}
      order by dias_para_vencer asc
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
      estado_lote,
      cantidad_disponible
    from vw_inventario_detallado
    where producto_id = ${productoId}
    order by dias_para_vencer asc
  `;
}
