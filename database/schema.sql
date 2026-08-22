-- SIBIA - esquema robusto de farmacia para PostgreSQL / Supabase

create extension if not exists pg_trgm;
create extension if not exists unaccent;

drop view if exists vw_ventas_producto_30d cascade;
drop view if exists vw_productos_stock_bajo cascade;
drop view if exists vw_lotes_por_vencer cascade;
drop view if exists vw_stock_producto_sucursal cascade;
drop view if exists vw_inventario_detallado cascade;
drop function if exists buscar_productos(text, text, integer) cascade;

drop table if exists venta_detalles cascade;
drop table if exists ventas cascade;
drop table if exists pedido_compra_detalles cascade;
drop table if exists pedidos_compra cascade;
drop table if exists movimientos_inventario cascade;
drop table if exists inventario cascade;
drop table if exists lotes cascade;
drop table if exists parametros_inventario cascade;
drop table if exists producto_proveedores cascade;
drop table if exists proveedores cascade;
drop table if exists producto_aliases cascade;
drop table if exists productos cascade;
drop table if exists laboratorios cascade;
drop table if exists categorias cascade;
drop table if exists ubicaciones cascade;
drop table if exists bodegas cascade;
drop table if exists sucursales cascade;
drop table if exists empresas cascade;

create table empresas (
  id bigint generated always as identity primary key,
  nit varchar(30) not null unique,
  razon_social varchar(150) not null,
  nombre_comercial varchar(120) not null,
  ciudad_principal varchar(80) not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table sucursales (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references empresas(id),
  codigo varchar(20) not null,
  nombre varchar(120) not null,
  ciudad varchar(80) not null,
  direccion varchar(180) not null,
  telefono varchar(30),
  activo boolean not null default true,
  unique (empresa_id, codigo)
);

create table bodegas (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references sucursales(id),
  codigo varchar(20) not null,
  nombre varchar(100) not null,
  tipo varchar(30) not null check (tipo in ('principal','dispensacion','cuarentena')),
  activo boolean not null default true,
  unique (sucursal_id, codigo)
);

create table ubicaciones (
  id bigint generated always as identity primary key,
  bodega_id bigint not null references bodegas(id),
  codigo varchar(40) not null,
  pasillo varchar(20) not null,
  estante varchar(20) not null,
  nivel_estante smallint not null check (nivel_estante between 1 and 10),
  zona varchar(40),
  activo boolean not null default true,
  unique (bodega_id, codigo)
);

create table categorias (
  id bigint generated always as identity primary key,
  nombre varchar(100) not null unique,
  descripcion text
);

create table laboratorios (
  id bigint generated always as identity primary key,
  nombre varchar(120) not null unique,
  pais varchar(80) not null default 'Colombia',
  activo boolean not null default true
);

create table productos (
  id bigint generated always as identity primary key,
  sku varchar(40) not null unique,
  codigo_barras varchar(40) unique,
  nombre_generico varchar(160) not null,
  nombre_comercial varchar(160),
  concentracion varchar(80),
  forma_farmaceutica varchar(80),
  presentacion varchar(120) not null,
  categoria_id bigint not null references categorias(id),
  laboratorio_id bigint references laboratorios(id),
  requiere_formula boolean not null default false,
  precio_venta numeric(12,2) not null check (precio_venta >= 0),
  activo boolean not null default true
);

create table producto_aliases (
  id bigint generated always as identity primary key,
  producto_id bigint not null references productos(id) on delete cascade,
  alias varchar(180) not null,
  unique (producto_id, alias)
);

create table proveedores (
  id bigint generated always as identity primary key,
  nit varchar(30) not null unique,
  nombre varchar(150) not null,
  ciudad varchar(80) not null,
  telefono varchar(30),
  email varchar(140),
  dias_entrega_estimados smallint not null default 3 check (dias_entrega_estimados >= 0),
  activo boolean not null default true
);

create table producto_proveedores (
  producto_id bigint not null references productos(id) on delete cascade,
  proveedor_id bigint not null references proveedores(id) on delete cascade,
  codigo_proveedor varchar(60),
  costo_referencia numeric(12,2) not null check (costo_referencia >= 0),
  proveedor_preferido boolean not null default false,
  primary key (producto_id, proveedor_id)
);

create table parametros_inventario (
  producto_id bigint not null references productos(id) on delete cascade,
  sucursal_id bigint not null references sucursales(id) on delete cascade,
  stock_minimo integer not null check (stock_minimo >= 0),
  punto_reorden integer not null check (punto_reorden >= 0),
  stock_maximo integer not null check (stock_maximo >= stock_minimo),
  primary key (producto_id, sucursal_id)
);

create table lotes (
  id bigint generated always as identity primary key,
  producto_id bigint not null references productos(id),
  proveedor_id bigint references proveedores(id),
  sucursal_id bigint not null references sucursales(id),
  numero_lote varchar(80) not null,
  fecha_recepcion date not null,
  fecha_vencimiento date not null,
  costo_unitario numeric(12,2) not null check (costo_unitario >= 0),
  estado varchar(30) not null default 'activo' check (estado in ('activo','cuarentena','agotado','vencido','devuelto')),
  unique (producto_id, numero_lote),
  check (fecha_vencimiento > fecha_recepcion)
);

create table inventario (
  id bigint generated always as identity primary key,
  lote_id bigint not null references lotes(id),
  ubicacion_id bigint not null references ubicaciones(id),
  cantidad_unidades integer not null default 0 check (cantidad_unidades >= 0),
  cantidad_reservada integer not null default 0 check (cantidad_reservada >= 0),
  actualizado_en timestamptz not null default now(),
  unique (lote_id, ubicacion_id),
  check (cantidad_reservada <= cantidad_unidades)
);

create table movimientos_inventario (
  id bigint generated always as identity primary key,
  lote_id bigint not null references lotes(id),
  ubicacion_origen_id bigint references ubicaciones(id),
  ubicacion_destino_id bigint references ubicaciones(id),
  tipo varchar(40) not null check (tipo in ('entrada_compra','salida_venta','traslado_salida','traslado_entrada','ajuste_positivo','ajuste_negativo','devolucion_cliente','devolucion_proveedor','baja_vencimiento')),
  cantidad_unidades integer not null check (cantidad_unidades > 0),
  referencia varchar(100),
  observacion text,
  ocurrido_en timestamptz not null default now()
);

create table pedidos_compra (
  id bigint generated always as identity primary key,
  proveedor_id bigint not null references proveedores(id),
  sucursal_id bigint not null references sucursales(id),
  numero_pedido varchar(50) not null unique,
  estado varchar(30) not null check (estado in ('borrador','enviado','parcial','recibido','cancelado')),
  fecha_pedido date not null,
  fecha_esperada date,
  total_estimado numeric(14,2) not null default 0,
  observacion text
);

create table pedido_compra_detalles (
  id bigint generated always as identity primary key,
  pedido_compra_id bigint not null references pedidos_compra(id) on delete cascade,
  producto_id bigint not null references productos(id),
  cantidad_solicitada integer not null check (cantidad_solicitada > 0),
  cantidad_recibida integer not null default 0 check (cantidad_recibida >= 0),
  costo_unitario_estimado numeric(12,2) not null check (costo_unitario_estimado >= 0),
  check (cantidad_recibida <= cantidad_solicitada)
);

create table ventas (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references sucursales(id),
  numero_venta varchar(60) not null unique,
  estado varchar(20) not null check (estado in ('completada','anulada')),
  canal varchar(20) not null check (canal in ('mostrador','domicilio','web')),
  total numeric(14,2) not null default 0,
  vendido_en timestamptz not null default now()
);

create table venta_detalles (
  id bigint generated always as identity primary key,
  venta_id bigint not null references ventas(id) on delete cascade,
  producto_id bigint not null references productos(id),
  lote_id bigint references lotes(id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  subtotal numeric(14,2) not null check (subtotal >= 0)
);

create index idx_productos_generico_trgm on productos using gin (lower(nombre_generico) gin_trgm_ops);
create index idx_productos_comercial_trgm on productos using gin (lower(coalesce(nombre_comercial,'')) gin_trgm_ops);
create index idx_aliases_trgm on producto_aliases using gin (lower(alias) gin_trgm_ops);
create index idx_lotes_producto on lotes(producto_id);
create index idx_lotes_vencimiento on lotes(fecha_vencimiento);
create index idx_lotes_producto_sucursal_estado_vencimiento
  on lotes(producto_id,sucursal_id,estado,fecha_vencimiento);
create index idx_parametros_sucursal_producto
  on parametros_inventario(sucursal_id,producto_id);
create index idx_inventario_lote on inventario(lote_id);
create index idx_inventario_ubicacion on inventario(ubicacion_id);
create index idx_movimientos_lote_fecha on movimientos_inventario(lote_id, ocurrido_en desc);
create index idx_ventas_sucursal_fecha on ventas(sucursal_id, vendido_en desc);
create index idx_venta_detalles_producto on venta_detalles(producto_id);
create index idx_pedidos_estado_fecha on pedidos_compra(estado, fecha_pedido desc);

create or replace view vw_inventario_detallado as
select
  p.id producto_id, p.sku, p.nombre_generico, p.nombre_comercial, p.concentracion,
  p.forma_farmaceutica, p.presentacion,
  s.id sucursal_id, s.nombre sucursal,
  b.id bodega_id, b.nombre bodega,
  u.id ubicacion_id, u.codigo codigo_ubicacion, u.pasillo, u.estante, u.nivel_estante,
  l.id lote_id, l.numero_lote, l.fecha_vencimiento,
  (l.fecha_vencimiento - current_date) dias_para_vencer,
  l.estado estado_lote,
  i.cantidad_unidades, i.cantidad_reservada,
  greatest(i.cantidad_unidades - i.cantidad_reservada,0) cantidad_disponible
from inventario i
join lotes l on l.id=i.lote_id
join productos p on p.id=l.producto_id
join ubicaciones u on u.id=i.ubicacion_id
join bodegas b on b.id=u.bodega_id
join sucursales s on s.id=b.sucursal_id;

create or replace view vw_stock_producto_sucursal as
with stock_valido as (
  select l.producto_id, s.id sucursal_id,
         sum(i.cantidad_unidades) stock_fisico,
         sum(i.cantidad_reservada) stock_reservado,
         sum(greatest(i.cantidad_unidades-i.cantidad_reservada,0)) stock_disponible,
         count(distinct l.id) lotes_activos,
         count(distinct u.id) ubicaciones_con_stock
  from inventario i
  join lotes l on l.id=i.lote_id
  join ubicaciones u on u.id=i.ubicacion_id
  join bodegas b on b.id=u.bodega_id
  join sucursales s on s.id=b.sucursal_id
  where l.estado='activo' and l.fecha_vencimiento>=current_date and i.cantidad_unidades>0
  group by l.producto_id,s.id
)
select p.id producto_id,p.sku,p.nombre_generico,p.nombre_comercial,p.concentracion,p.presentacion,
       s.id sucursal_id,s.nombre sucursal,
       coalesce(st.stock_fisico,0)::int stock_fisico,
       coalesce(st.stock_reservado,0)::int stock_reservado,
       coalesce(st.stock_disponible,0)::int stock_disponible,
       coalesce(st.lotes_activos,0)::int lotes_activos,
       coalesce(st.ubicaciones_con_stock,0)::int ubicaciones_con_stock,
       pi.stock_minimo,pi.punto_reorden,pi.stock_maximo
from productos p
cross join sucursales s
left join stock_valido st on st.producto_id=p.id and st.sucursal_id=s.id
left join parametros_inventario pi on pi.producto_id=p.id and pi.sucursal_id=s.id
where p.activo and s.activo;

create or replace view vw_lotes_por_vencer as
select producto_id,sku,nombre_generico,concentracion,presentacion,sucursal,bodega,codigo_ubicacion,
       numero_lote,fecha_vencimiento,dias_para_vencer,cantidad_disponible
from vw_inventario_detallado
where estado_lote='activo'
  and fecha_vencimiento between current_date and current_date+180
  and cantidad_disponible>0;

create or replace view vw_productos_stock_bajo as
select * from vw_stock_producto_sucursal
where stock_disponible <= coalesce(punto_reorden,0);

create or replace view vw_ventas_producto_30d as
select vd.producto_id,p.sku,p.nombre_generico,p.concentracion,p.presentacion,
       v.sucursal_id,s.nombre sucursal,
       sum(vd.cantidad)::int unidades_vendidas_30d,
       sum(vd.subtotal)::numeric(14,2) ventas_30d,
       count(distinct v.id)::int numero_ventas_30d
from venta_detalles vd
join ventas v on v.id=vd.venta_id
join productos p on p.id=vd.producto_id
join sucursales s on s.id=v.sucursal_id
where v.estado='completada' and v.vendido_en>=now()-interval '30 days'
group by vd.producto_id,p.sku,p.nombre_generico,p.concentracion,p.presentacion,v.sucursal_id,s.nombre;

create or replace function buscar_productos(p_texto text,p_presentacion text default null,p_limite integer default 10)
returns table(producto_id bigint,sku varchar,nombre_generico varchar,nombre_comercial varchar,concentracion varchar,forma_farmaceutica varchar,presentacion varchar,precio_venta numeric,relevancia numeric)
language sql stable as $$
with c as (
  select p.*,
    greatest(
      similarity(unaccent(lower(p.nombre_generico)),unaccent(lower(p_texto))),
      similarity(unaccent(lower(coalesce(p.nombre_comercial,''))),unaccent(lower(p_texto))),
      coalesce((select max(similarity(unaccent(lower(a.alias)),unaccent(lower(p_texto)))) from producto_aliases a where a.producto_id=p.id),0)
    ) sim,
    case
      when lower(p.sku)=lower(p_texto) then 100
      when lower(coalesce(p.codigo_barras,''))=lower(p_texto) then 100
      when unaccent(lower(p.nombre_generico))=unaccent(lower(p_texto)) then 95
      when unaccent(lower(coalesce(p.nombre_comercial,'')))=unaccent(lower(p_texto)) then 95
      when unaccent(lower(p.nombre_generico)) like '%'||unaccent(lower(p_texto))||'%' then 80
      when exists(select 1 from producto_aliases a where a.producto_id=p.id and unaccent(lower(a.alias)) like '%'||unaccent(lower(p_texto))||'%') then 78
      else 0 end direct
  from productos p where p.activo
)
select c.id,c.sku,c.nombre_generico,c.nombre_comercial,c.concentracion,c.forma_farmaceutica,c.presentacion,c.precio_venta,
       (greatest(c.direct,c.sim*70)+case when p_presentacion is not null and (unaccent(lower(coalesce(c.concentracion,''))) like '%'||unaccent(lower(p_presentacion))||'%' or unaccent(lower(c.presentacion)) like '%'||unaccent(lower(p_presentacion))||'%') then 15 else 0 end)::numeric(8,2)
from c
where c.direct>0 or c.sim>=0.20
order by 9 desc,c.nombre_generico
limit greatest(1,least(p_limite,50));
$$;
