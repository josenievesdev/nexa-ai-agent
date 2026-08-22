import { sql } from "../database/db.js";

export type ConsultarUbicacionArgs = {
  producto_id: number;
  sucursal?: string | null;
};

export async function consultarUbicacion(args: ConsultarUbicacionArgs) {
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
        sucursal,
        bodega,
        codigo_ubicacion,
        pasillo,
        estante,
        nivel_estante,
        numero_lote,
        fecha_vencimiento,
        dias_para_vencer,
        cantidad_disponible
      from vw_inventario_detallado
      where
        producto_id = ${productoId}
        and lower(sucursal) = lower(${sucursal})
        and estado_lote = 'activo'
        and fecha_vencimiento >= current_date
        and cantidad_disponible > 0
      order by
        sucursal,
        fecha_vencimiento asc,
        cantidad_disponible desc
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
      bodega,
      codigo_ubicacion,
      pasillo,
      estante,
      nivel_estante,
      numero_lote,
      fecha_vencimiento,
      dias_para_vencer,
      cantidad_disponible
    from vw_inventario_detallado
    where
      producto_id = ${productoId}
      and estado_lote = 'activo'
      and fecha_vencimiento >= current_date
      and cantidad_disponible > 0
    order by
      sucursal,
      fecha_vencimiento asc,
      cantidad_disponible desc
  `;
}
