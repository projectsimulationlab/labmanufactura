# Recorrido360 CIM — v10

Recorrido virtual de 13 vistas del Laboratorio de Manufactura Flexible — CIM, Universidad de Lima. Aplicación estática con **Marzipano local**; sin servicios externos ni compilación.

## Ejecutar en local

Abrir la carpeta en VS Code y ejecutar **Live Server**, o bien:

```powershell
python -m http.server 8000
```

Abrir `http://localhost:8000`. No utilizar `file://`: los mosaicos requieren servidor HTTP.

## Publicar en GitHub Pages

1. Copiar **el contenido** de este paquete a la raíz del repositorio (junto a `index.html`); no subir el archivo ZIP como contenido web.
2. Hacer `git add -A`, `git commit -m "Recorrido360 CIM v10"` y `git push`.
3. En el repositorio: **Settings → Pages → Deploy from a branch → rama publicada → /(root)**.
4. Abrir el enlace de Pages y recargar con `Ctrl + Shift + R` si se conserva la versión anterior en caché.

## Controles

- Arrastrar: observar · flechas o botones: cambiar vista · «Explorar»: galería.
- `H`: ocultar/mostrar interfaz · `F`: pantalla completa · `Esc`: cerrar panel.
- Los puntos interactivos conservan las coordenadas del proyecto original.

## Estructura

- `index.html`, `style.css`, `app.js`: interfaz y navegación.
- `data.js`: escenas, niveles y conexiones (mantener).
- `vendor/marzipano.js`: visor distribuido localmente (licencia en `MARZIPANO_LICENSE.txt`).
- `tiles/`, `thumbnails/`, `hero.jpg`, `logo-ulima.png`: imágenes del recorrido y de la interfaz.
- `.nojekyll`: publicación estática de GitHub Pages.

## Rendimiento y seguridad

Los mosaicos se descargan a demanda; no se descargan todas las fotografías al iniciar. El visor libera escenas distantes y presenta una pantalla breve hasta recibir un fotograma estable. Se conservaron los JPG originales. No hay rastreadores, llamadas externas, credenciales ni formularios. Una política CSP limita los recursos al mismo origen.

**GitHub Pages es público.** No guardar contraseñas ni archivos privados en el repositorio. La CSP incluida es una política mediante etiqueta meta; los encabezados HTTP adicionales dependen del alojamiento.

## Prueba recomendada

Verificar en un navegador con WebGL habilitado: portada → vistas 01, 02 y 03 → galería a vista 13 → retroceder, y repetir en vertical y horizontal en móvil. Si la carga de una escena falla, el visor conserva la anterior y permite reintentar.
