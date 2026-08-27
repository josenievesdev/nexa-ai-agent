Auditoría técnica · Agente empresarial

Auditoría SIBIA
Revisión del agente de farmacia sobre Ollama, tool calling y PostgreSQL. Todos los hallazgos se verificaron ejecutando el sistema contra la base de datos real y midiendo la telemetría del modelo; ninguno es teórico.

Modelo
ministral-3:8b
Hardware
RX 580 8GB · 32GB RAM
num_ctx
6144
Alcance
sin cambios de arquitectura
4
Crítico
8
Importante
4
Mejora opcional
15 de 35
productos que listar_stock_bajo muestra, sin declarar los 20 restantes
2 329 tok
costo fijo por llamada: 38% del contexto antes de cargar un solo dato
13–17 tok/s
velocidad de generación medida; el 85% del peor caso es escritura, no consulta
Veredicto
SIBIA está sólido en lo que se construyó a propósito y frágil en lo que quedó librado al criterio del modelo.

El tool calling, el recovery de llamadas textuales, el parametrizado de SQL y el manejo de truncamiento funcionan y resisten los casos adversos que probé. La seguridad del canal modelo → herramientas es correcta: allowlist por nombre, sin eval, argumentos siempre validados como objeto JSON y consultas parametrizadas por postgres.js. Las credenciales nunca entraron a git ni al zip.

Los cuatro hallazgos críticos comparten una misma raíz, y por eso los agrupo: la exactitud del dato depende de decisiones que hoy toma el modelo. El modelo elige cuántas filas pedir, si encadena la segunda herramienta y si lo que muestra es la lista completa. Cuando acierta, la respuesta es excelente. Cuando no, la respuesta sigue siendo confiada, bien redactada y verosímil — y ese es exactamente el modo de falla que una empresa no puede detectar.

Hallazgos críticos
Afectan la exactitud del dato entregado al usuario. Reproducibles.

C1
Crítico
listar_stock_bajo oculta 20 de 35 productos sin declararlo
La vista tiene 35 filas; la herramienta devuelve 15 por defecto y no informa el total ni que hay más. El modelo recibe una lista parcial sin ninguna señal de que lo sea, y la presenta como el inventario en riesgo de quiebre.

listar_stock_bajo {} → 15 filas, 4 539 bytes (~1 261 tokens)
select count(*) from vw_productos_stock_bajo → 35
sin campos total / hay_mas / siguiente_offset
consultar_mas_vendidos tiene el mismo defecto y es peor en proporción: devuelve 10 de 190 filas.

Impacto
Una decisión de compra se toma sobre el 43% de los faltantes reales, creyendo que es el 100%.
Solución
Aplicar el envelope resumen + paginacion que ya funciona en listar_lotes_por_vencer. Es un patrón probado, no un diseño nuevo.
Archivos
listar-stock-bajo.ts, consultar-mas-vendidos.ts, tools/index.ts
Riesgo
Bajo. Cambia la forma del resultado, no la consulta ni la base de datos.
C2
Crítico
El modelo controla limite y estrecha la evidencia por su cuenta
Le pregunté a SIBIA cuál es el producto con menos stock. El modelo decidió llamar la herramienta con limite: 1, recibió una sola fila y respondió con un ganador único. En la base hay nueve productos empatados en stock 0.

Pregunta: "¿Cuál es el producto con menos stock?"
[TOOL REQUEST] listar_stock_bajo { "limite": 1 }
Respuesta: "El producto con menos stock […] es NasoAndes"
Realidad: 9 productos con stock_disponible = 0 (MED-0004, 0012, 0021, 0033, 0054, 0055, 0058, 0067, 0076)
La respuesta no es una alucinación: cada dato citado es real. El error está en que el modelo redujo la evidencia antes de mirarla y después describió esa reducción como un hecho del negocio.

Impacto
Respuestas arbitrarias con forma de respuesta definitiva. Dos usuarios pueden recibir productos distintos para la misma pregunta.
Solución
Sacar limite del esquema expuesto al modelo, o imponerle un piso. El tamaño de página lo decide la herramienta; el modelo solo pide la página siguiente. Los empates deben venir explícitos en el resumen.
Archivos
tools/index.ts, listar-stock-bajo.ts
Riesgo
Bajo. Reduce la superficie de decisión del modelo, no la información disponible.
C3
Crítico
El encadenamiento de herramientas no es determinista
El caso 3 que el proyecto da por funcionando no funciona sin sucursal explícita. Con "¿Dónde está el ibuprofeno?" el modelo identificó el producto, recibió literalmente la instrucción de encadenar, la ignoró y contestó prometiendo un dato que nunca fue a buscar.

Pregunta: "¿Dónde está el ibuprofeno?"
[TOOL REQUEST] buscar_producto → coincidencias: 2
siguiente_paso entregado: "NO RESPONDAS TODAVIA […] ejecuta ahora esa herramienta"
[TOOL REQUEST] consultar_ubicacion → nunca ocurrió
Respuesta: "Permanece atento para que te informe las ubicaciones exactas"
Con "ibuprofeno de 400 mg en Centro" el mismo flujo sí encadena. El steering por prompt y por payload de herramienta mueve la probabilidad, pero no la fija: en la sesión anterior tres redacciones distintas de reglas fallaron antes de encontrar una que funcionara, y esa tampoco generaliza.

Impacto
El agente promete información y cierra el turno sin entregarla. Con exactitud como prioridad 1, un paso obligatorio no puede depender de la disposición del modelo.
Solución
Validación de cierre de turno dentro del bucle actual: si la consulta pedía ubicación, stock o lotes y ninguna herramienta de esa familia se ejecutó, no aceptar la respuesta final y reinyectar una corrección, con un solo reintento. Es un guard en el loop existente, no una arquitectura nueva.
Archivos
ai/ollama.ts
Riesgo
Medio. Puede añadir una iteración y por tanto latencia. Requiere que la detección de intención sea conservadora para no forzar herramientas de más.
C4
Crítico
La llamada a Ollama no tiene timeout
El fetch a /api/chat no usa AbortController ni señal de cancelación. Si Ollama deja de responder, SIBIA espera para siempre. No es hipotético: durante las pruebas Ollama devolvió {"model":"","done":false} bajo presión de VRAM, y ese mismo estado podría no haber devuelto nada.

Impacto
Bloqueo indefinido del agente. En un despliegue real, una petición colgada retiene la conexión a PostgreSQL y no hay forma limpia de recuperarla.
Solución
AbortController con timeout configurable por entorno, propagado como error normal para que la lógica de reintento existente lo maneje.
Archivos
ai/ollama.ts
Riesgo
Muy bajo. Debe ser generoso: la generación legítima más lenta medida fue de 74 segundos.
Hallazgos importantes
Degradan estabilidad, consistencia o confianza sin romper el sistema hoy.

I1
Importante
Fechas entregadas como ISO con zona horaria
consultar_ubicacion y consultar_lotes devuelven "2027-02-17T00:00:00.000Z". El modelo debe reformatear eso a una fecha legible, y un vencimiento es justamente el dato donde un corrimiento de un día importa. listar_lotes_por_vencer ya usa to_char; las demás no.

Solución
to_char(fecha, 'YYYY-MM-DD') en todas las herramientas con fechas.
Riesgo
Muy bajo. Además ahorra tokens.
I2
Importante
consultar_stock entrega seis cifras de stock a la vez
Cada fila incluye stock_fisico, stock_reservado, stock_disponible, stock_minimo, punto_reorden y stock_maximo, más un sucursal_id interno que el modelo no debería ver. A la pregunta "cuánto stock tengo" solo una de esas cifras responde.

select count(*) from vw_stock_producto_sucursal where stock_reservado > 0 → 58 filas
en esas filas stock_fisico ≠ stock_disponible
En 58 filas reales el físico y el disponible difieren. Si el modelo cita el número equivocado, la cifra es real y verificable en la base — pero responde otra pregunta.

Solución
Promover stock_disponible como campo principal y agrupar el resto bajo detalle. Eliminar sucursal_id.
Riesgo
Bajo.
I3
Importante
La identidad del producto se repite en cada fila
consultar_ubicacion para un producto devuelve cuatro filas y repite sku, nombre_generico, nombre_comercial, concentracion y presentacion en las cuatro: 1 661 bytes (~461 tokens) donde bastarían la mitad. Lo mismo en stock y lotes.

Solución
Envelope { producto: {…}, ubicaciones: [...] }: la identidad una vez, las filas solo con lo que varía.
Riesgo
Bajo, pero toca tres herramientas a la vez.
I4
Importante
El historial se recorta por cantidad de mensajes, no por tokens
MAX_HISTORY_MESSAGES = 12 cuenta mensajes sin mirar su tamaño. El caso 5 generó una sola respuesta de 972 tokens: doce respuestas así son ~11 000 tokens contra un num_ctx de 6 144. Ollama recortaría en silencio y el agente perdería contexto sin enterarse.

Solución
Presupuesto por caracteres además del conteo, recortando siempre desde un mensaje de usuario.
Riesgo
Bajo.
I5
Importante
Sin protección contra herramientas repetidas entre iteraciones
La deduplicación actúa dentro de un mismo mensaje del modelo, no entre iteraciones. Si el modelo repite la misma llamada turno tras turno, se ejecutan ocho iteraciones completas — con su consulta a PostgreSQL y su llamada al modelo cada una — antes de fallar por límite.

Solución
Caché por nombre + argumentos dentro del turno: reusar el resultado en vez de repetir la consulta.
Riesgo
Bajo.
I6
Importante
El reintento por truncamiento repite la misma petición
Ante done_reason: "length" se reenvía una petición idéntica. En la corrida donde ocurrió, el modelo generó exactamente 789 tokens las dos veces y falló igual: el reintento solo duplicó la espera antes del error.

Solución
No reintentar el truncamiento tal cual: reintentar con una instrucción de brevedad, o fallar de inmediato con un mensaje accionable.
Riesgo
Bajo. Mejora la latencia del peor caso.
I7
Importante
La telemetría no permite separar carga, prompt y generación
logOllamaResponse registra total_duration pero omite load_duration, prompt_eval_duration y eval_duration. Ollama los devuelve en cada respuesta. Sin ellos, "una consulta tarda 5 s y otra 70 s" parece un misterio; con ellos es aritmética.

Solución
Añadir los tres campos al log y derivar tokens/s.
Riesgo
Ninguno. Es la mejora con mejor relación esfuerzo/valor de toda la lista.
I8
Importante
consultar_lotes y consultar_ubicacion no tienen tope de filas
Hoy el máximo real es de 6 lotes por producto, así que no duele. Pero el diseño no acota nada: un producto con muchos lotes activos devolvería un resultado sin límite hacia un contexto de 6 144 tokens.

Solución
Límite con total declarado, coherente con el resto de las herramientas.
Riesgo
Bajo.
Rendimiento
Medido, no estimado. La conclusión contradice la intuición habitual.

Velocidades del modelo en esta máquina: ~82 tokens/s para evaluar el prompt y ~13–17 tokens/s para generar. Con esos dos números, cada tiempo de la corrida final se explica sin residuo:

Caso	Prompt	Generado	Tiempo	Causa dominante
Código de barras	2 133	74	7,9 s	normal
Stock de ibuprofeno	2 621	129	15,8 s	dos iteraciones
Ubicación 400 mg	2 905	233	25,4 s	dos iteraciones
Lotes por vencer	3 279	972	75,8 s	generación
Busca MED-0081	1 988	19	59,5 s	carga del modelo
La misma consulta MED-0081 tardó 6,7 s en una corrida con el modelo ya cargado y 59,5 s en frío.

Modelo, arquitectura o datos enviados
Modelo. Generar a 13–17 tok/s. Los 972 tokens del caso 5 son ~65 s irreducibles mientras el modelo escriba esa cantidad. No se arregla con código.
Arquitectura. El arranque en frío de 53–69 s, el reintento inútil de I6 y las iteraciones extra que provoca C3. Todo esto sí se arregla con código o configuración.
Datos enviados. 2 329 tokens fijos por llamada — SYSTEM_PROMPT ~1 040 con 33 reglas, más ~1 289 de definiciones de herramientas — y los campos redundantes de I2 e I3. Consumen el 38% del contexto, pero a 82 tok/s pesan poco en el reloj.
La palanca no es lo que entra, es lo que sale. Reducir el JSON de las herramientas fue lo correcto para no truncar, pero ya no es donde está el tiempo. El caso 5 tardó 75 segundos porque el modelo escribió una tabla markdown de 972 tokens reproduciendo datos que la herramienta ya le había dado formateados.

Si la herramienta entregara el bloque listo para citar y el prompt pidiera no reproducir la tabla, ese mismo caso caería a unos 15–20 segundos. Es una mejora de 3 a 4 veces sin cambiar modelo ni hardware, y sin perder un solo dato.

El arranque en frío se ataca aparte, con OLLAMA_KEEP_ALIVE o una precarga al iniciar. Es configuración de Ollama, no un problema de SIBIA.

Contaminación de contexto
Dónde puede el modelo inventar sin que nada lo detenga.

El historial persistido elimina los mensajes de herramienta y los mensajes intermedios del asistente. Es la decisión correcta para el tamaño del contexto, pero tiene una consecuencia: en el turno siguiente, la única evidencia que queda es la prosa que el propio modelo escribió. No hay separación entre "esto vino de PostgreSQL" y "esto lo redacté yo".

Si el usuario pregunta "¿y en Norte?", el modelo tiene delante sus propios números anteriores y ninguna marca de que necesiten reconsultarse. Las reglas del prompt lo prohíben, pero C3 demuestra que las reglas no son garantía de comportamiento. El riesgo es bajo hoy porque las respuestas rara vez citan identificadores internos; conviene vigilarlo antes de agregar herramientas de escritura.

Un segundo punto: la respuesta del caso 5 afirmó "2 lotes vencen en 2 días" cuando el dato entregado decía uno. Los datos citados en la tabla eran todos correctos; el error apareció en una frase derivada, calculada por el modelo. Toda cifra que el modelo deduce en vez de copiar es superficie de error, y la defensa es que la herramienta entregue también los agregados ya calculados — que es justo lo que hace el bloque resumen.

Lo que está bien
Conviene no tocarlo.

Seguridad El canal modelo → herramientas es correcto: allowlist por nombre contra toolDefinitions, sin eval, argumentos aceptados solo como objeto JSON válido, y todo el SQL parametrizado por postgres.js. Probé nombres inexistentes, identificadores pegados y argumentos como arreglo: todos rechazados.
Credenciales .env está en .gitignore, nunca fue commiteado y no viaja en nexa.zip.
Recovery La recuperación de tool calls textuales resiste prefijos inventados, texto alrededor, llaves dentro de cadenas y objetos anidados, sin ampliar la superficie de ejecución.
Truncamiento Ninguna respuesta incompleta llega al usuario ni al historial. La detección por done_reason y la propagación del error del cuerpo funcionan.
Separación Las herramientas no conocen al modelo y el modelo no construye SQL. La frontera está bien puesta y ninguno de los arreglos propuestos la cruza.
Plan de remediación
Ordenado por exactitud primero, después estabilidad, seguridad, rendimiento y experiencia. Cada paso es independiente: se puede parar en cualquier punto.

01
Telemetría completa — I7. Habilita medir todo lo demás y no cambia comportamiento.

ai/ollama.ts · riesgo nulo

02
Timeout en la llamada a Ollama — C4. Aislado, sin efectos sobre el resto.

ai/ollama.ts · riesgo muy bajo

03
Envelope con totales en las listas y control de limite — C1 y C2 juntos, porque comparten el mismo cambio de contrato.

listar-stock-bajo.ts · consultar-mas-vendidos.ts · tools/index.ts · riesgo bajo

04
Fechas YYYY-MM-DD y limpieza de campos — I1, I2, I3, I8. Bajan tokens y superficie de error a la vez.

consultar-stock.ts · consultar-ubicacion.ts · consultar-lotes.ts · riesgo bajo

05
Guards del bucle — I4, I5, I6. Presupuesto de historial por tokens, caché de herramientas por turno, reintento de truncamiento corregido.

ai/ollama.ts · riesgo bajo

06
Validación de cierre de turno — C3. El de mayor impacto en exactitud y el único con riesgo medio: conviene hacerlo con los pasos anteriores ya estables.

ai/ollama.ts · riesgo medio

07
Reducir lo que el modelo escribe — la mejora de 3–4× en latencia. Bloque citable desde la herramienta más una regla de no reproducir tablas.

listar-lotes-por-vencer.ts · ai/ollama.ts · riesgo bajo

08
Opcionales — consolidar las 33 reglas del prompt a ~15, unificar el contrato de las herramientas, resolver producto_id como entero en vez de cadena, y configurar OLLAMA_KEEP_ALIVE contra el arranque en frío.

varios · riesgo bajo

Auditoría ejecutada sobre la rama main contra la base de datos real. Los cinco casos obligatorios y los dos ejemplos adicionales se corrieron end-to-end con ministral-3:8b. No se aplicó ningún cambio: este informe es el diagnóstico previo.