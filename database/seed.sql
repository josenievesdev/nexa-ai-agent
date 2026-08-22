-- SIBIA - datos ficticios robustos para pruebas
select setseed(0.42);

truncate table venta_detalles,ventas,pedido_compra_detalles,pedidos_compra,movimientos_inventario,inventario,lotes,parametros_inventario,producto_proveedores,proveedores,producto_aliases,productos,laboratorios,categorias,ubicaciones,bodegas,sucursales,empresas restart identity cascade;

insert into empresas(nit,razon_social,nombre_comercial,ciudad_principal)
values ('901999888-1','Farmacia NovaSalud SAS','NovaSalud','Pereira');

insert into sucursales(empresa_id,codigo,nombre,ciudad,direccion,telefono)
select 1,* from (values
 ('CTR','Centro','Pereira','Cra. 7 #18-35','6060001001'),
 ('NTE','Norte','Pereira','Av. Circunvalar #12-80','6060001002'),
 ('SUR','Sur','Dosquebradas','Av. Simón Bolívar #34-18','6060001003')
) v(codigo,nombre,ciudad,direccion,telefono);

insert into bodegas(sucursal_id,codigo,nombre,tipo)
select id,codigo||'-BP','Bodega Principal','principal' from sucursales
union all
select id,codigo||'-DP','Área de Dispensación','dispensacion' from sucursales;

insert into ubicaciones(bodega_id,codigo,pasillo,estante,nivel_estante,zona)
select b.id,
       'P'||lpad(p::text,2,'0')||'-E'||lpad(e::text,2,'0')||'-N'||n,
       'P'||lpad(p::text,2,'0'),'E'||lpad(e::text,2,'0'),n,
       case when b.tipo='principal' then 'Almacenamiento' else 'Dispensación' end
from bodegas b
cross join lateral generate_series(1,case when b.tipo='principal' then 4 else 2 end) p
cross join lateral generate_series(1,case when b.tipo='principal' then 4 else 3 end) e
cross join generate_series(1,3) n;

insert into categorias(nombre,descripcion) values
('Analgésicos y antipiréticos','Dolor y fiebre'),('Antiinflamatorios','Inflamación y dolor'),('Alergias y respiratorio','Alergias y sistema respiratorio'),('Gastrointestinal','Sistema digestivo'),('Cardiovascular','Sistema cardiovascular'),('Metabólico','Metabolismo'),('Antimicrobianos','Medicamentos antimicrobianos'),('Dermatología','Uso dermatológico'),('Vitaminas y suplementos','Suplementación'),('Cuidado personal','Higiene y cuidado'),('Primeros auxilios','Atención básica'),('Dispositivos médicos','Dispositivos y medición');

insert into laboratorios(nombre,pais)
select x,'Colombia' from unnest(array['Andina Pharma','NovaMed Colombia','Genéricos del Café','Laboratorios Horizonte','SaludNova','BioAndes','FarmaCentral','Vitalis Andina','MedSur','ColPharm','FarmaVida','Laboratorio Prisma','BioSalud','NorteMed']) x;

insert into proveedores(nit,nombre,ciudad,telefono,email,dias_entrega_estimados)
select '900810'||lpad(g::text,3,'0')||'-'||(g%10),
       (array['Distribuciones Salud Centro','Droguería Mayorista Andina','Suministros Médicos del Eje','Comercializadora FarmaRed','Distribuciones NovaSalud','Abastecimientos Clínicos SAS','Red Farmacéutica Nacional','Suministros Vitales SAS','Mayorista BioAndes','Comercializadora Prisma','Distribuciones Salud y Vida','Central Médica Colombiana'])[g],
       (array['Pereira','Manizales','Armenia','Bogotá','Medellín','Cali','Bogotá','Pereira','Manizales','Armenia','Cali','Bogotá'])[g],
       '300555'||lpad(g::text,4,'0'),'contacto'||g||'@proveedor-prueba.local',1+(random()*6)::int
from generate_series(1,12) g;

with datos(nombre_generico,nombre_comercial,concentracion,forma,presentacion,categoria,formula,precio) as (values
('Acetaminofén','DolorNova','500 mg','Tableta','Caja x 20 tabletas','Analgésicos y antipiréticos',false,7800),
('Acetaminofén','DolorNova Pediátrico','150 mg/5 mL','Jarabe','Frasco x 120 mL','Analgésicos y antipiréticos',false,12500),
('Ibuprofeno','IbuNova','400 mg','Tableta','Caja x 20 tabletas','Antiinflamatorios',false,9800),
('Ibuprofeno','IbuNova Niños','100 mg/5 mL','Suspensión','Frasco x 120 mL','Antiinflamatorios',false,14800),
('Naproxeno','NaproVida','250 mg','Tableta','Caja x 20 tabletas','Antiinflamatorios',false,11600),
('Diclofenaco','Diclomed Gel','1 %','Gel tópico','Tubo x 50 g','Antiinflamatorios',false,15900),
('Loratadina','AlerNova','10 mg','Tableta','Caja x 10 tabletas','Alergias y respiratorio',false,6900),
('Cetirizina','CetiVida','10 mg','Tableta','Caja x 10 tabletas','Alergias y respiratorio',false,7600),
('Omeprazol','GastroNova','20 mg','Cápsula','Caja x 14 cápsulas','Gastrointestinal',false,8900),
('Esomeprazol','EsoAndes','20 mg','Tableta','Caja x 14 tabletas','Gastrointestinal',true,16500),
('Hidróxido de aluminio + magnesio','GastroCalm','200 mg + 200 mg/5 mL','Suspensión','Frasco x 180 mL','Gastrointestinal',false,13800),
('Sales de rehidratación oral','HidraPlus',null,'Polvo oral','Sobre para 1 L','Gastrointestinal',false,3200),
('Losartán','CardioNova','50 mg','Tableta','Caja x 30 tabletas','Cardiovascular',true,17800),
('Amlodipino','Amlovida','5 mg','Tableta','Caja x 30 tabletas','Cardiovascular',true,14200),
('Enalapril','EnalAndes','20 mg','Tableta','Caja x 30 tabletas','Cardiovascular',true,13500),
('Atorvastatina','LipidNova','20 mg','Tableta','Caja x 30 tabletas','Cardiovascular',true,21900),
('Metformina','MetaVida','850 mg','Tableta','Caja x 30 tabletas','Metabólico',true,15900),
('Levotiroxina','TiroNova','50 mcg','Tableta','Caja x 50 tabletas','Metabólico',true,24800),
('Amoxicilina','AmoxiAndes','500 mg','Cápsula','Caja x 21 cápsulas','Antimicrobianos',true,18900),
('Azitromicina','AziNova','500 mg','Tableta','Caja x 3 tabletas','Antimicrobianos',true,22500),
('Cefalexina','CefaVida','500 mg','Cápsula','Caja x 20 cápsulas','Antimicrobianos',true,26800),
('Clotrimazol','ClotriDerm','1 %','Crema','Tubo x 40 g','Dermatología',false,13800),
('Miconazol','MicoDerm','2 %','Crema','Tubo x 40 g','Dermatología',false,14900),
('Hidrocortisona','DermaCalm','1 %','Crema','Tubo x 30 g','Dermatología',false,12800),
('Vitamina C','VitaC Plus','500 mg','Tableta','Frasco x 60 tabletas','Vitaminas y suplementos',false,19900),
('Vitamina D3','VitaD','1000 UI','Cápsula','Frasco x 60 cápsulas','Vitaminas y suplementos',false,27900),
('Complejo B','B Vital',null,'Tableta','Frasco x 30 tabletas','Vitaminas y suplementos',false,18500),
('Zinc','ZincPlus','25 mg','Tableta','Frasco x 30 tabletas','Vitaminas y suplementos',false,17400),
('Calcio + Vitamina D','CalcioVida','600 mg + 400 UI','Tableta','Frasco x 60 tabletas','Vitaminas y suplementos',false,31500),
('Suero fisiológico','SalinaCare','0.9 %','Solución','Frasco x 500 mL','Primeros auxilios',false,8500),
('Clorhexidina','ClorCare','2 %','Solución','Frasco x 120 mL','Primeros auxilios',false,11200),
('Agua oxigenada','OxiCare','3 %','Solución','Frasco x 120 mL','Primeros auxilios',false,5900),
('Alcohol antiséptico','AseptiCare','70 %','Solución','Frasco x 350 mL','Primeros auxilios',false,9800),
('Gasa estéril','GasaMed',null,'Gasa','Paquete x 10 unidades','Primeros auxilios',false,6500),
('Venda elástica','FlexiMed',null,'Venda','Unidad 10 cm x 5 m','Primeros auxilios',false,8900),
('Curitas adhesivas','CuraPlus',null,'Apósito','Caja x 20 unidades','Primeros auxilios',false,7800),
('Termómetro digital','TempCheck',null,'Dispositivo','Unidad','Dispositivos médicos',false,24900),
('Tensiómetro digital','PressCheck',null,'Dispositivo','Unidad','Dispositivos médicos',false,128000),
('Glucómetro','GlucoCheck',null,'Dispositivo','Kit','Dispositivos médicos',false,79900),
('Tiras para glucómetro','GlucoCheck Tiras',null,'Tira reactiva','Caja x 50 tiras','Dispositivos médicos',false,55900),
('Mascarilla quirúrgica','SafeMask',null,'Mascarilla','Caja x 50 unidades','Dispositivos médicos',false,24900),
('Guantes de nitrilo','NitraSafe',null,'Guante','Caja x 100 talla M','Dispositivos médicos',false,38900),
('Jeringa desechable','JeriMed','5 mL','Jeringa','Unidad','Dispositivos médicos',false,1200),
('Salbutamol','RespiraNova','100 mcg/dosis','Inhalador','Inhalador x 200 dosis','Alergias y respiratorio',true,28900),
('Fluticasona','NasoAndes','50 mcg/dosis','Spray nasal','Frasco x 120 dosis','Alergias y respiratorio',true,34900),
('Ambroxol','BroncoVida','15 mg/5 mL','Jarabe','Frasco x 120 mL','Alergias y respiratorio',false,14500),
('Dextrometorfano','TosiCalm','15 mg/5 mL','Jarabe','Frasco x 120 mL','Alergias y respiratorio',false,15900),
('Simeticona','GasiCalm','80 mg','Tableta masticable','Caja x 20 tabletas','Gastrointestinal',false,9400),
('Bisacodilo','TránsitoPlus','5 mg','Tableta','Caja x 20 tabletas','Gastrointestinal',false,8800),
('Loperamida','IntestiCalm','2 mg','Cápsula','Caja x 12 cápsulas','Gastrointestinal',false,9600),
('Aspirina','CardioAAS','100 mg','Tableta','Caja x 30 tabletas','Cardiovascular',true,11900),
('Hidroclorotiazida','HidroNova','25 mg','Tableta','Caja x 30 tabletas','Cardiovascular',true,10900),
('Glimepirida','GlimVida','2 mg','Tableta','Caja x 30 tabletas','Metabólico',true,17600),
('Ácido fólico','FoliVida','1 mg','Tableta','Caja x 30 tabletas','Vitaminas y suplementos',false,8900),
('Hierro','FerroPlus','300 mg','Tableta','Caja x 30 tabletas','Vitaminas y suplementos',false,16800),
('Magnesio','MagneVida','250 mg','Tableta','Frasco x 60 tabletas','Vitaminas y suplementos',false,26900),
('Protector solar','SolarCare FPS 50','FPS 50','Loción','Frasco x 120 mL','Cuidado personal',false,45900),
('Crema hidratante','DermaSoft',null,'Crema','Frasco x 250 mL','Cuidado personal',false,28900),
('Jabón antibacterial','AseptiSoap',null,'Jabón líquido','Frasco x 300 mL','Cuidado personal',false,14900),
('Champú anticaspa','CapilCare',null,'Champú','Frasco x 400 mL','Cuidado personal',false,25900),
('Enjuague bucal','OralFresh',null,'Solución oral','Frasco x 500 mL','Cuidado personal',false,19800),
('Crema dental','DentalCare',null,'Crema dental','Tubo x 90 g','Cuidado personal',false,12500),
('Toallas húmedas','SoftCare',null,'Toalla','Paquete x 80 unidades','Cuidado personal',false,15900),
('Pañales adulto','ConfortPlus',null,'Pañal','Paquete x 10 talla M','Cuidado personal',false,32900),
('Pañales bebé','BabySoft',null,'Pañal','Paquete x 30 talla M','Cuidado personal',false,41900),
('Repelente de insectos','RepelCare',null,'Spray','Frasco x 120 mL','Cuidado personal',false,18900),
('Óxido de zinc','ZincDerm','20 %','Crema','Tubo x 60 g','Dermatología',false,16900),
('Ketoconazol','KetoDerm','2 %','Champú','Frasco x 120 mL','Dermatología',false,24900),
('Mupirocina','MupiCare','2 %','Ungüento','Tubo x 15 g','Dermatología',true,28900),
('Nistatina','NistaDerm','100000 UI/g','Crema','Tubo x 30 g','Dermatología',true,21400),
('Montelukast','MontelNova','10 mg','Tableta','Caja x 30 tabletas','Alergias y respiratorio',true,35900),
('Fexofenadina','FexoVida','120 mg','Tableta','Caja x 10 tabletas','Alergias y respiratorio',false,22800),
('Desloratadina','DesloNova','5 mg','Tableta','Caja x 10 tabletas','Alergias y respiratorio',false,19800),
('Famotidina','FamoCare','20 mg','Tableta','Caja x 20 tabletas','Gastrointestinal',false,15900),
('Probióticos','FloraPlus','5 mil millones UFC','Cápsula','Caja x 20 cápsulas','Gastrointestinal',false,32900),
('Melatonina','SueñoVida','3 mg','Tableta','Frasco x 30 tabletas','Vitaminas y suplementos',false,26900),
('Omega 3','OmegaVida','1000 mg','Cápsula','Frasco x 60 cápsulas','Vitaminas y suplementos',false,38900),
('Multivitamínico','MultiVital',null,'Tableta','Frasco x 60 tabletas','Vitaminas y suplementos',false,34900),
('Prueba de embarazo','TestVida',null,'Prueba rápida','Unidad','Dispositivos médicos',false,12900),
('Nebulizador','RespiraCheck',null,'Dispositivo','Unidad','Dispositivos médicos',false,139000),
('Oxímetro de pulso','OxiCheck',null,'Dispositivo','Unidad','Dispositivos médicos',false,64900)
)
insert into productos(sku,codigo_barras,nombre_generico,nombre_comercial,concentracion,forma_farmaceutica,presentacion,categoria_id,laboratorio_id,requiere_formula,precio_venta)
select 'MED-'||lpad(row_number() over()::text,4,'0'),
       '7709000'||lpad(row_number() over()::text,6,'0'),
       d.nombre_generico,d.nombre_comercial,d.concentracion,d.forma,d.presentacion,
       c.id,1+((row_number() over()-1)%14),d.formula,d.precio
from datos d join categorias c on c.nombre=d.categoria;

insert into producto_aliases(producto_id, alias)
select
    id,
    lower(unaccent(nombre_generico))
from productos
where lower(unaccent(nombre_generico)) <> lower(nombre_generico)
on conflict do nothing;


insert into producto_aliases(producto_id, alias)
select
    p.id,
    a.alias
from (
    values
        ('Acetaminofén', 'paracetamol'),
        ('Acetaminofén', 'acetaminofen'),
        ('Sales de rehidratación oral', 'suero oral'),
        ('Sales de rehidratación oral', 'sro'),
        ('Ácido fólico', 'folato'),
        ('Hidróxido de aluminio + magnesio', 'antiacido'),
        ('Suero fisiológico', 'solucion salina'),
        ('Alcohol antiséptico', 'alcohol 70'),
        ('Agua oxigenada', 'peroxido de hidrogeno'),
        ('Curitas adhesivas', 'banditas adhesivas'),
        ('Protector solar', 'bloqueador solar'),
        ('Oxímetro de pulso', 'oximetro')
) a(nombre, alias)
join productos p
    on p.nombre_generico = a.nombre
on conflict do nothing;

insert into producto_proveedores(producto_id,proveedor_id,codigo_proveedor,costo_referencia,proveedor_preferido)
select
    p.id,
    pr.id,
    'PV-'||p.id||'-'||pr.id,
    round((p.precio_venta*(0.48+((pr.rn::numeric % 5)/25)))::numeric,2),
    pr.rn=1
from productos p
cross join lateral (
    select
        proveedores.id,
        row_number() over (
            order by md5(proveedores.id::text||'-'||p.id::text)
        ) rn
    from proveedores
    order by md5(proveedores.id::text||'-'||p.id::text)
    limit (2+(p.id % 3)::int)
) pr;

insert into parametros_inventario(producto_id,sucursal_id,stock_minimo,punto_reorden,stock_maximo)
select
    p.id,
    s.id,
    x.stock_minimo,
    x.stock_minimo + 5 + ((p.id*3+s.id*5) % 16)::int,
    x.stock_minimo + 70 + ((p.id*11+s.id*17) % 111)::int
from productos p
cross join sucursales s
cross join lateral (
    select 8 + ((p.id*7+s.id*3) % 23)::int as stock_minimo
) x;

insert into lotes(producto_id,proveedor_id,sucursal_id,numero_lote,fecha_recepcion,fecha_vencimiento,costo_unitario,estado)
select p.id,
       coalesce((select proveedor_id from producto_proveedores pp where pp.producto_id=p.id and pp.proveedor_preferido limit 1),1),
       s.id,
       'LT-'||p.sku||'-'||s.codigo||'-'||g,
       current_date-(30+(random()*210)::int),
       current_date+(-20+(random()*620)::int),
       round((p.precio_venta*(0.50+random()*0.15))::numeric,2),
       'activo'
from productos p
cross join sucursales s
cross join generate_series(1,2) g
where
    random()>0.04
    or (s.codigo='CTR' and p.nombre_generico='Ibuprofeno' and p.concentracion='400 mg')
    or (s.codigo='CTR' and p.nombre_generico='Loratadina' and p.concentracion='10 mg')
    or (s.codigo='CTR' and p.nombre_generico='Omeprazol' and p.concentracion='20 mg')
    or (s.codigo='SUR' and p.nombre_generico='Vitamina C' and p.concentracion='500 mg');

update lotes set estado='vencido' where fecha_vencimiento<current_date;
update lotes set estado='cuarentena' where estado='activo' and random()<0.03;

insert into inventario(lote_id,ubicacion_id,cantidad_unidades,cantidad_reservada)
select
    l.id,
    u.id,
    x.cantidad,
    case
        when x.cantidad>10 and (l.id % 7)=0 then least(5,x.cantidad)
        else 0
    end
from lotes l
cross join lateral (
    select u.id
    from ubicaciones u
    join bodegas b on b.id=u.bodega_id
    where b.sucursal_id=l.sucursal_id and b.tipo='principal'
    order by md5(u.id::text||'-'||l.id::text)
    limit 1
) u
cross join lateral (
    select ((l.id*37) % 121)::int as cantidad
) x;

-- ============================================================
-- ESCENARIOS CONTROLADOS PARA PRUEBAS DE IA
-- ============================================================

-- 1. Ibuprofeno 400 mg:
-- Centro, 84 unidades, Bodega Principal, ubicación P01-E03-N2.

update inventario i
set cantidad_unidades=0, cantidad_reservada=0
from lotes l
where
    i.lote_id=l.id
    and l.producto_id=(
        select id from productos
        where nombre_generico='Ibuprofeno' and concentracion='400 mg'
        limit 1
    )
    and l.sucursal_id=(
        select id from sucursales where codigo='CTR' limit 1
    );

update lotes
set estado='activo', fecha_vencimiento=current_date+180
where id=(
    select min(l.id)
    from lotes l
    join productos p on p.id=l.producto_id
    join sucursales s on s.id=l.sucursal_id
    where
        p.nombre_generico='Ibuprofeno'
        and p.concentracion='400 mg'
        and s.codigo='CTR'
);

update inventario
set
    cantidad_unidades=84,
    cantidad_reservada=0,
    ubicacion_id=(
        select u.id
        from ubicaciones u
        join bodegas b on b.id=u.bodega_id
        join sucursales s on s.id=b.sucursal_id
        where
            s.codigo='CTR'
            and b.tipo='principal'
            and u.codigo='P01-E03-N2'
        limit 1
    ),
    actualizado_en=now()
where lote_id=(
    select min(l.id)
    from lotes l
    join productos p on p.id=l.producto_id
    join sucursales s on s.id=l.sucursal_id
    where
        p.nombre_generico='Ibuprofeno'
        and p.concentracion='400 mg'
        and s.codigo='CTR'
);


-- 2. Loratadina 10 mg:
-- Centro con 4 unidades; stock mínimo 12 y punto de reorden 25.

update inventario i
set cantidad_unidades=0, cantidad_reservada=0
from lotes l
where
    i.lote_id=l.id
    and l.producto_id=(
        select id from productos
        where nombre_generico='Loratadina' and concentracion='10 mg'
        limit 1
    )
    and l.sucursal_id=(
        select id from sucursales where codigo='CTR' limit 1
    );

update lotes
set estado='activo', fecha_vencimiento=current_date+240
where id=(
    select min(l.id)
    from lotes l
    join productos p on p.id=l.producto_id
    join sucursales s on s.id=l.sucursal_id
    where
        p.nombre_generico='Loratadina'
        and p.concentracion='10 mg'
        and s.codigo='CTR'
);

update inventario
set cantidad_unidades=4, cantidad_reservada=0, actualizado_en=now()
where lote_id=(
    select min(l.id)
    from lotes l
    join productos p on p.id=l.producto_id
    join sucursales s on s.id=l.sucursal_id
    where
        p.nombre_generico='Loratadina'
        and p.concentracion='10 mg'
        and s.codigo='CTR'
);

update parametros_inventario
set stock_minimo=12, punto_reorden=25, stock_maximo=90
where
    producto_id=(
        select id from productos
        where nombre_generico='Loratadina' and concentracion='10 mg'
        limit 1
    )
    and sucursal_id=(
        select id from sucursales where codigo='CTR' limit 1
    );


-- 3. Omeprazol 20 mg:
-- Centro con un lote activo que vence exactamente en 18 días.

update lotes
set fecha_vencimiento=current_date+18, estado='activo'
where id=(
    select min(l.id)
    from lotes l
    join productos p on p.id=l.producto_id
    join sucursales s on s.id=l.sucursal_id
    where
        p.nombre_generico='Omeprazol'
        and p.concentracion='20 mg'
        and s.codigo='CTR'
);

update inventario
set
    cantidad_unidades=greatest(cantidad_unidades,18),
    cantidad_reservada=0,
    actualizado_en=now()
where lote_id=(
    select min(l.id)
    from lotes l
    join productos p on p.id=l.producto_id
    join sucursales s on s.id=l.sucursal_id
    where
        p.nombre_generico='Omeprazol'
        and p.concentracion='20 mg'
        and s.codigo='CTR'
);


-- 4. Vitamina C 500 mg:
-- Sin stock vendible en la sucursal Sur.

update inventario i
set cantidad_unidades=0, cantidad_reservada=0, actualizado_en=now()
from lotes l
where
    i.lote_id=l.id
    and l.producto_id=(
        select id from productos
        where nombre_generico='Vitamina C' and concentracion='500 mg'
        limit 1
    )
    and l.sucursal_id=(
        select id from sucursales where codigo='SUR' limit 1
    );


-- 3000 movimientos históricos.
insert into movimientos_inventario(
    lote_id,
    ubicacion_origen_id,
    ubicacion_destino_id,
    tipo,
    cantidad_unidades,
    referencia,
    observacion,
    ocurrido_en
)
select
    i.lote_id,
    case
        when tm.tipo in ('salida_venta','ajuste_negativo') then i.ubicacion_id
    end,
    case
        when tm.tipo in ('entrada_compra','ajuste_positivo','devolucion_cliente') then i.ubicacion_id
    end,
    tm.tipo,
    1+((g*7)%12)::int,
    'MOV-'||lpad(g::text,6,'0'),
    'Movimiento histórico generado para pruebas',
    now()-(((g*13)%120)::text||' days')::interval
from generate_series(1,3000) g
cross join lateral (
    select inv.*
    from inventario inv
    order by md5(inv.id::text||'-'||g::text)
    limit 1
) i
cross join lateral (
    select (
        array[
            'entrada_compra',
            'salida_venta',
            'ajuste_positivo',
            'ajuste_negativo',
            'devolucion_cliente'
        ]
    )[1+((g*11)%5)::int] as tipo
) tm;

-- 650 ventas de los últimos 90 días.
insert into ventas(sucursal_id,numero_venta,estado,canal,total,vendido_en)
select 1+(random()*2)::int,'VTA-'||lpad(g::text,6,'0'),case when random()<0.04 then 'anulada' else 'completada' end,
       (array['mostrador','mostrador','mostrador','domicilio','web'])[1+(random()*4)::int],0,now()-(random()*interval '90 days')
from generate_series(1,650) g;

insert into venta_detalles(venta_id,producto_id,lote_id,cantidad,precio_unitario,subtotal)
select
    v.id,
    p.id,
    null,
    q.cantidad,
    p.precio_venta,
    q.cantidad*p.precio_venta
from ventas v
cross join lateral generate_series(
    1,
    1+(v.id%4)::int
) linea(numero)
cross join lateral (
    select prod.*
    from productos prod
    order by md5(prod.id::text||'-'||v.id::text||'-'||linea.numero::text)
    limit 1
) p
cross join lateral (
    select 1+((v.id+linea.numero)%3)::int as cantidad
) q;

update ventas v set total=x.total from (select venta_id,sum(subtotal) total from venta_detalles group by venta_id) x where x.venta_id=v.id;

-- 35 órdenes de compra.
insert into pedidos_compra(proveedor_id,sucursal_id,numero_pedido,estado,fecha_pedido,fecha_esperada,total_estimado,observacion)
select 1+(random()*11)::int,1+(random()*2)::int,'OC-'||lpad(g::text,5,'0'),
       (array['enviado','enviado','parcial','recibido','recibido'])[1+(random()*4)::int],
       current_date-(random()*75)::int,current_date+(-10+(random()*25)::int),0,'Pedido generado para pruebas'
from generate_series(1,35) g;

insert into pedido_compra_detalles(
    pedido_compra_id,
    producto_id,
    cantidad_solicitada,
    cantidad_recibida,
    costo_unitario_estimado
)
select
    o.id,
    p.id,
    q.cantidad,
    case
        when o.estado='recibido' then q.cantidad
        when o.estado='parcial' then greatest(1,(q.cantidad*0.55)::int)
        else 0
    end,
    round((p.precio_venta*(0.48+(((o.id+linea.numero)%7)::numeric/35)))::numeric,2)
from pedidos_compra o
cross join lateral generate_series(
    1,
    3+(o.id%6)::int
) linea(numero)
cross join lateral (
    select prod.*
    from productos prod
    order by md5(prod.id::text||'-'||o.id::text||'-'||linea.numero::text)
    limit 1
) p
cross join lateral (
    select 10+((o.id*11+linea.numero*13)%71)::int as cantidad
) q;

update pedidos_compra o set total_estimado=x.total from (select pedido_compra_id,sum(cantidad_solicitada*costo_unitario_estimado) total from pedido_compra_detalles group by pedido_compra_id) x where x.pedido_compra_id=o.id;

select
 (select count(*) from productos) productos,
 (select count(*) from lotes) lotes,
 (select count(*) from inventario) registros_inventario,
 (select count(*) from movimientos_inventario) movimientos,
 (select count(*) from ventas) ventas,
 (select count(*) from venta_detalles) detalle_ventas,
 (select count(*) from pedidos_compra) pedidos;
