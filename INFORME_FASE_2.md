# GAP · Fase 2: revisión de producto y preparación para usuarios

Rama `fase-2-lanzamiento` (commit local, **sin push ni despliegue**). No se tocó el modelo de datos ni las migraciones de Supabase, y no se aplicó ninguna.

## Qué ha cambiado
**Mi hueco (pantalla principal, ahora la de inicio)**
- Minutos inmediatos: número grande editable, −/+ de 5 en 5 y atajos 10–90. Recuerda el último valor.
- `planGap` (nuevo, `src/lib/matching.ts`): hasta 3 combinaciones: «Cerrar tareas» (mochila exacta: más tareas completadas y, a igualdad, más minutos; el sobrante ≥10 min se usa para avanzar una larga), «Un solo foco» y «Repartir».
- Cada tarea muestra «Completar» (sólido) o «Avanzar» (contorno), los minutos que se recomienda dedicar y el motivo en una frase. Barra del hueco con tramos sólidos (completar) y rayados (avanzar).
- «Empezar N min» inicia la sesión con un clic, con temporizador y el tiempo recomendado como objetivo.
- «Otras tareas que también encajan» y «No encajan ahora» (con la razón y cómo arreglarlo).

**Sesiones**: minimizar (barra «Sesión en curso» siempre accesible), Esc, «He terminado la tarea», reintento si falla el guardado, no se guardan sesiones sin tiempo ni avance.

**Tareas**: editar título/tipo/estimación, quitar hitos, «Marcar como hecha», confirmación al cambiar de modo de progreso si baja el porcentaje, chips de estimación, estados vacíos y mensajes en español.

**Diseño**: fondo `#101210`, superficies `#1B1E1A`, lima `#B6F36B`; Figtree autoalojada (sin peticiones externas); navegación inferior para móvil; sin gradientes ni aspecto de plantilla.

## Errores encontrados y corregidos
1. Si fallaba el guardado (almacenamiento lleno) **no se mostraba ningún error**: la recarga lo borraba.
2. Una rápida sin estimación nunca se recomendaba y no decía por qué. Ahora se exige al crearla y las antiguas explican cómo arreglarlo.
3. Se guardaban sesiones de ~0 min («1 sesiones» en estadísticas).
4. **Al marcar un hito el detalle de la tarea se cerraba solo** (la tarjeta cambia de sección y se remonta).
5. Regla CSS global `font: inherit` anulaba toda la tipografía de Tailwind (botones y número del hueco salían a 16 px); y el foco deformaba los botones redondeados.
6. `friendlyError` no reconocía `DOMException` (almacenamiento lleno) fuera de `Error`; lo detectó un test.
7. Zonas táctiles de 24–36 px (ahora ≥44 px), plural «1 sesiones», `<header>` duplicado en el diálogo (axe).
8. Sesión activa guardada con datos dañados o de una tarea borrada: ahora se valida o ignora.
9. Supabase: al quitar un hito el borrado no llegaba a la base de datos (añadido; ver pendientes).

## Verificación
- 72 tests (32 anteriores + 40 nuevos): planes, edición, hitos, sesiones, errores. Un test antiguo cambió a propósito (una rápida ya no se crea sin estimación).
- `tsc`, build de producción y linter: sin errores (1 aviso falso positivo en `useGap.ts`).
- 29 comprobaciones de flujo en navegador (crear, editar, hitos, hueco, sesión, pausa, minimizar, recarga, estadísticas, almacenamiento lleno).
- Responsive a 360, 390, 768 y 1280 px: sin desbordes ni zonas táctiles pequeñas; **0 violaciones de axe-core** (WCAG 2.1 AA, incluye contraste).

## Pendiente
- Supabase **no probado** contra un proyecto real (ni el borrado de hitos añadido). No hay proyecto ni migraciones aplicadas.
- Las pruebas de navegador viven fuera del repo (no hay Playwright en CI).
- No probado en dispositivos reales (iOS Safari/Android); solo Chromium emulado.
- Sin avisos al cumplir el objetivo de tiempo, sin exportar datos, sin renombrar ni reordenar hitos, sin historial de sesiones por tarea.
- Sin canal de feedback ni analítica para recoger lo que digan los usuarios.
- El repositorio es público.

## ¿Listo para Vercel?
**Sí para una prueba con usuarios en modo local**: no necesita variables de entorno y el build es limpio. **No** para cuentas/sincronización hasta crear Supabase, aplicar 0001→0002 y probarlo.

## Limitaciones del modo local
- Los datos viven solo en ese navegador y dispositivo: no se sincronizan y se pierden al borrar datos del sitio.
- Sin copia de seguridad ni exportación.
- En navegación privada o con el almacenamiento lleno no se puede guardar (se avisa claramente).
- Dos pestañas abiertas no se refrescan entre sí; si editas la misma tarea en ambas, gana la última en guardar.
- Un usuario con varios dispositivos verá listas distintas en cada uno.
