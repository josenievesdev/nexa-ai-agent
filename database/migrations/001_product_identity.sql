-- SIBIA
-- Migration 001: identidad consistente de productos
-- Actualiza vistas y búsqueda sin eliminar datos de las tablas.


-- =========================================================
-- ELIMINAR SOLO OBJETOS DERIVADOS
-- =========================================================

drop view if exists vw_ventas_producto_30d;
drop view if exists vw_productos_stock_bajo;
drop view if exists vw_lotes_por_vencer;
drop view if exists vw_stock_producto_sucursal;
drop view if exists vw_inventario_detallado;

drop function if exists buscar_productos(text, text, integer);


-- =========================================================
-- VISTA: INVENTARIO DETALLADO
-- =========================================================

create view vw_inventario_detallado as
select
  p.id as producto_id,
  p.sku,
  p.codigo_barras,
  p.nombre_generico,
  p.nombre_comercial,
  p.concentracion,
  p.forma_farmaceutica,
  p.presentacion,

  s.id as sucursal_id,
  s.nombre as sucursal,

  b.id as bodega_id,
  b.nombre as bodega,

  u.id as ubicacion_id,
  u.codigo as codigo_ubicacion,
  u.pasillo,
  u.estante,
  u.nivel_estante,

  l.id as lote_id,
  l.numero_lote,
  l.fecha_vencimiento,

  (l.fecha_vencimiento - current_date) as dias_para_vencer,

  l.estado as estado_lote,

  i.cantidad_unidades,
  i.cantidad_reservada,

  greatest(
    i.cantidad_unidades - i.cantidad_reservada,
    0
  ) as cantidad_disponible

from inventario i

join lotes l
  on l.id = i.lote_id

join productos p
  on p.id = l.producto_id

join ubicaciones u
  on u.id = i.ubicacion_id

join bodegas b
  on b.id = u.bodega_id

join sucursales s
  on s.id = b.sucursal_id;


-- =========================================================
-- VISTA: STOCK POR PRODUCTO Y SUCURSAL
-- =========================================================

create view vw_stock_producto_sucursal as

with stock_valido as (

  select
    l.producto_id,
    s.id as sucursal_id,

    sum(i.cantidad_unidades) as stock_fisico,

    sum(i.cantidad_reservada) as stock_reservado,

    sum(
      greatest(
        i.cantidad_unidades - i.cantidad_reservada,
        0
      )
    ) as stock_disponible,

    count(distinct l.id) as lotes_activos,

    count(distinct u.id) as ubicaciones_con_stock

  from inventario i

  join lotes l
    on l.id = i.lote_id

  join ubicaciones u
    on u.id = i.ubicacion_id

  join bodegas b
    on b.id = u.bodega_id

  join sucursales s
    on s.id = b.sucursal_id

  where
    l.estado = 'activo'
    and l.fecha_vencimiento >= current_date
    and i.cantidad_unidades > 0

  group by
    l.producto_id,
    s.id
)

select
  p.id as producto_id,
  p.sku,
  p.codigo_barras,
  p.nombre_generico,
  p.nombre_comercial,
  p.concentracion,
  p.forma_farmaceutica,
  p.presentacion,

  s.id as sucursal_id,
  s.nombre as sucursal,

  coalesce(
    st.stock_fisico,
    0
  )::int as stock_fisico,

  coalesce(
    st.stock_reservado,
    0
  )::int as stock_reservado,

  coalesce(
    st.stock_disponible,
    0
  )::int as stock_disponible,

  coalesce(
    st.lotes_activos,
    0
  )::int as lotes_activos,

  coalesce(
    st.ubicaciones_con_stock,
    0
  )::int as ubicaciones_con_stock,

  pi.stock_minimo,
  pi.punto_reorden,
  pi.stock_maximo

from productos p

cross join sucursales s

left join stock_valido st
  on st.producto_id = p.id
  and st.sucursal_id = s.id

left join parametros_inventario pi
  on pi.producto_id = p.id
  and pi.sucursal_id = s.id

where
  p.activo
  and s.activo;


-- =========================================================
-- VISTA: LOTES PRÓXIMOS A VENCER
-- =========================================================

create view vw_lotes_por_vencer as
select
  producto_id,
  sku,
  codigo_barras,
  nombre_generico,
  nombre_comercial,
  concentracion,
  forma_farmaceutica,
  presentacion,

  sucursal,
  bodega,
  codigo_ubicacion,

  numero_lote,
  fecha_vencimiento,
  dias_para_vencer,

  cantidad_disponible

from vw_inventario_detallado

where
  estado_lote = 'activo'
  and fecha_vencimiento
    between current_date
    and current_date + 180
  and cantidad_disponible > 0;


-- =========================================================
-- VISTA: PRODUCTOS CON STOCK BAJO
-- =========================================================

create view vw_productos_stock_bajo as
select
  producto_id,
  sku,
  codigo_barras,
  nombre_generico,
  nombre_comercial,
  concentracion,
  forma_farmaceutica,
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
  stock_disponible <= coalesce(punto_reorden, 0);


-- =========================================================
-- VISTA: VENTAS POR PRODUCTO EN LOS ÚLTIMOS 30 DÍAS
-- =========================================================

create view vw_ventas_producto_30d as
select
  vd.producto_id,

  p.sku,
  p.codigo_barras,
  p.nombre_generico,
  p.nombre_comercial,
  p.concentracion,
  p.forma_farmaceutica,
  p.presentacion,

  v.sucursal_id,
  s.nombre as sucursal,

  sum(vd.cantidad)::int as unidades_vendidas_30d,

  sum(vd.subtotal)::numeric(14,2) as ventas_30d,

  count(distinct v.id)::int as numero_ventas_30d

from venta_detalles vd

join ventas v
  on v.id = vd.venta_id

join productos p
  on p.id = vd.producto_id

join sucursales s
  on s.id = v.sucursal_id

where
  v.estado = 'completada'
  and v.vendido_en >= now() - interval '30 days'

group by
  vd.producto_id,
  p.sku,
  p.codigo_barras,
  p.nombre_generico,
  p.nombre_comercial,
  p.concentracion,
  p.forma_farmaceutica,
  p.presentacion,
  v.sucursal_id,
  s.nombre;


-- =========================================================
-- FUNCIÓN: BÚSQUEDA FLEXIBLE DE PRODUCTOS
-- =========================================================

create function buscar_productos(
  p_texto text,
  p_presentacion text default null,
  p_limite integer default 10
)

returns table (
  producto_id bigint,
  sku varchar,
  codigo_barras varchar,
  nombre_generico varchar,
  nombre_comercial varchar,
  concentracion varchar,
  forma_farmaceutica varchar,
  presentacion varchar,
  precio_venta numeric,
  relevancia numeric
)

language sql
stable

as $$

with candidatos as (

  select
    p.*,

    greatest(

      similarity(
        unaccent(lower(p.nombre_generico)),
        unaccent(lower(p_texto))
      ),

      similarity(
        unaccent(lower(coalesce(p.nombre_comercial, ''))),
        unaccent(lower(p_texto))
      ),

      coalesce(
        (
          select max(
            similarity(
              unaccent(lower(a.alias)),
              unaccent(lower(p_texto))
            )
          )
          from producto_aliases a
          where a.producto_id = p.id
        ),
        0
      )

    ) as similitud,

    case

      when lower(p.sku) = lower(p_texto)
        then 100

      when lower(
        coalesce(p.codigo_barras, '')
      ) = lower(p_texto)
        then 100

      when unaccent(
        lower(p.nombre_generico)
      ) = unaccent(
        lower(p_texto)
      )
        then 95

      when unaccent(
        lower(coalesce(p.nombre_comercial, ''))
      ) = unaccent(
        lower(p_texto)
      )
        then 95

      when unaccent(
        lower(p.nombre_generico)
      ) like
        '%' ||
        unaccent(lower(p_texto)) ||
        '%'
        then 80

      when exists (
        select 1
        from producto_aliases a
        where
          a.producto_id = p.id
          and unaccent(
            lower(a.alias)
          ) like
            '%' ||
            unaccent(lower(p_texto)) ||
            '%'
      )
        then 78

      else 0

    end as coincidencia_directa

  from productos p

  where p.activo
)

select
  c.id,
  c.sku,
  c.codigo_barras,
  c.nombre_generico,
  c.nombre_comercial,
  c.concentracion,
  c.forma_farmaceutica,
  c.presentacion,
  c.precio_venta,

  (
    greatest(
      c.coincidencia_directa,
      c.similitud * 70
    )

    +

    case

      when
        p_presentacion is not null
        and (
          unaccent(
            lower(
              coalesce(c.concentracion, '')
            )
          ) like
            '%' ||
            unaccent(lower(p_presentacion)) ||
            '%'

          or

          unaccent(
            lower(c.presentacion)
          ) like
            '%' ||
            unaccent(lower(p_presentacion)) ||
            '%'
        )

      then 15

      else 0

    end

  )::numeric(8,2) as relevancia

from candidatos c

where
  c.coincidencia_directa > 0
  or c.similitud >= 0.20

order by
  relevancia desc,
  c.nombre_generico

limit greatest(
  1,
  least(p_limite, 50)
);

$$;