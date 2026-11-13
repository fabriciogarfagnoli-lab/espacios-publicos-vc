# Espacios Públicos · Villa Constitución

Plataforma web con mapa interactivo (plano municipal georreferenciado + vista satelital) y fichas de estado de las plazas y espacios públicos: semáforo por espacio, estado por rubro (juegos, mobiliario, iluminación, veredas, estación saludable, equipamiento deportivo), recomendaciones con avance, bitácora de trabajos con fotos, matriz general y exportación a CSV.

- **Sitio:** HTML + JavaScript, sin compilación. Se publica en **Vercel**.
- **Datos, fotos y usuarios:** **Supabase** (plan gratuito).
- **Mapa:** Leaflet. Bases *Plano*, *Satélite* (Esri World Imagery) y *Calles* (OpenStreetMap), con el plano municipal vectorial encima.

Sin configurar Supabase, el sitio abre igual en **modo demostración** (solo lectura).

---

## Puesta en marcha (unos 20 minutos)

### 1. Crear la base de datos en Supabase
1. Entrá a <https://supabase.com>, creá una cuenta y un **New project**. Región: *South America (São Paulo)*. Guardá la contraseña.
2. En el proyecto abrí **SQL Editor → New query**, pegá el contenido de `01_esquema.sql` y apretá **Run**.
3. Hacé lo mismo con `02_datos_iniciales.sql`, que carga los 71 espacios.
4. **Ingreso con PIN (sin usuarios):** ejecutá `03_pin.sql` en el SQL Editor y después fijá el PIN del equipo con
   `select public.cambiar_pin('TU_PIN');` (se guarda solo el hash). Para cambiarlo, volvé a ejecutar esa línea. En la web, **Ingresar** pide *tu nombre* (queda como autor de cada registro) y el PIN.
   Opcional, editores por email (ingreso por link):
   ```sql
   insert into public.editores (email, nombre) values
     ('tu.email@gmail.com', 'Fabricio'),
     ('companero@ejemplo.com', 'Nombre');
   ```
   Cualquiera puede **ver** la plataforma; solo quien tenga el PIN puede **editar**.
5. Andá a **Project Settings → API** y copiá la **Project URL** y la clave **anon public**.

### 2. Configurar el sitio
Abrí `config.js` y completá:
```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```
La clave *anon* es pública por diseño. La seguridad la dan las reglas del archivo SQL: solo los emails habilitados pueden escribir.

### 3. Publicar en Vercel
1. Creá un repositorio en GitHub (por ejemplo `espacios-publicos-vc`) y subí **todo el contenido de esta carpeta**. Con *Add file → Upload files* alcanza.
2. En <https://vercel.com> entrá con tu cuenta de GitHub: **Add New → Project → Import** del repositorio.
3. En *Framework Preset* elegí **Other**, dejá el resto por defecto y apretá **Deploy**.
4. Te queda un link tipo `https://espacios-publicos-vc.vercel.app`.

### 4. Habilitar el ingreso por email
En Supabase: **Authentication → URL Configuration**:
- **Site URL:** el link de Vercel.
- **Redirect URLs:** el mismo link, más `http://localhost:3000` si vas a probar localmente.

Para editar, cada persona toca **Ingresar**, pone su email y entra con el link que le llega (no hay contraseña).

---

## Uso
- **Ubicar espacios:** con una sesión de editor, tocá **📍 Ubicar pines**, elegí un espacio en la lista y hacé clic en el mapa. También podés arrastrar los pines.
- **Registrar trabajos:** en la ficha, **+ Registrar actualización** permite cargar el tipo (trabajo, relevamiento, reclamo u observación), la fecha, el rubro, una descripción y fotos. Además podés cambiar el estado del rubro y marcar una recomendación como cumplida.
- **Editar ficha:** estado por rubro, notas, recomendaciones y link a la carpeta de Drive.
- **Matriz:** tabla de todos los espacios por rubro, ordenable, con **Descargar CSV**.
- **Satélite:** el selector arriba a la derecha cambia la base. La casilla *Plano municipal* muestra u oculta el plano superpuesto.

## Cálculo del semáforo
Cada rubro relevado suma un puntaje:
- Bueno: 100
- Regular: 55
- Malo: 15
- "No tiene" en un rubro esencial (juegos, mobiliario, iluminación, veredas): 25

Los rubros sin dato no cuentan. "No tiene" en estación saludable o equipamiento deportivo no penaliza. El estado general es el promedio:
- **≥ 75:** verde
- **45 a 74:** amarillo
- **< 45:** rojo
- **Sin rubros relevados:** gris

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html`, `app.js`, `styles.css` | La aplicación |
| `config.js` | Datos de conexión a Supabase |
| `plano.json` | Plano municipal vectorial (lat/long WGS84) |
| `espacios.json` | Copia de los datos iniciales, usada en modo demostración |
| `*.sql` | Esquema, reglas de seguridad y datos iniciales |
| `leaflet.js`, `leaflet.css` | Librería de mapas, incluida localmente |

## Fuentes y créditos
- **Plano base:** *Plano completo de la ciudad*, Secretaría de Ordenamiento Territorial, Municipalidad de Villa Constitución (jul. 2025). Convertido desde DWG en POSGAR 2007 faja 5 (EPSG:22185) a WGS84. La trama de calles se reconstruyó a partir de los rótulos del plano.
- **Relevamiento:** *Informe técnico de las plazas de los barrios populares* (ago. 2026).
- **Imágenes satelitales:** © Esri, Maxar, Earthstar Geographics. **Calles:** © colaboradores de OpenStreetMap.
