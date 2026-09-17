# SENDA · Leadership Program

Presentación web del Leadership Program de [SENDA](https://senda.site). Es HTML, CSS y JavaScript estáticos: no hay compilación ni dependencias que instalar.

## Verla en local

**Opción rápida:** haz doble clic en `index.html`. Se abre en el navegador y funciona tal cual.

**Con servidor local** (necesario para probar la incrustación en iframe): en PowerShell, desde la carpeta del proyecto, ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File _herramientas\serve.ps1
```

Después abre <http://localhost:8767/>. La prueba del iframe está en <http://localhost:8767/_herramientas/iframe-test.html>.

## Navegación

| Acción | Escritorio | Móvil / tablet vertical |
|---|---|---|
| Avanzar / retroceder | → ← · espacio · AvPág RePág · rueda · clic en los bordes · deslizar en pantallas táctiles | Desplazamiento vertical |
| Primera / última | Inicio · Fin | — |
| Ir a una fase | Clic en la línea de fases (diap. 10) o en la barra de fases | Toque en la fase |
| Pantalla completa | Botón ⛶ o tecla F | Botón ⛶ |
| Enlace directo | `index.html#/12` | `index.html#/12` (salta a esa sección) |

## Dos modos, un mismo documento

- **Escenario (≥ 768 px y formato apaisado):** diapositivas 16:9 que se ajustan al contenedor, con transiciones y animaciones. Todas las medidas van en `cqw` (1 % del ancho del marco), así que la composición es idéntica en una ventana, a pantalla completa o dentro de un iframe.
- **Documento (móvil, tablet vertical o sin JavaScript):** las diapositivas se apilan y **se reorganizan** en vertical (no se encogen). Aparecen con animación al entrar en pantalla.

Con `prefers-reduced-motion` activado se desactivan las animaciones y las transiciones pasan a ser cortes.

## Estructura

```
index.html          20 diapositivas (HTML semántico, textos accesibles)
css/fonts.css       Poppins autoalojada
css/deck.css        estilos: base móvil + bloque de escenario 16:9
js/deck.js          motor de la presentación
js/vendor/gsap.min.js   GSAP 3.13 (animación), copia local
fonts/              Poppins woff2 (latin + latin-ext)
img/                imágenes WebP (inventario y prompts en el documento interno IMAGENES.md, fuera del repositorio)
```

**¿Por qué GSAP y no Reveal.js?** Reveal.js escala un lienzo fijo, lo que en móvil encoge el texto hasta hacerlo ilegible. El brief pide que en móvil las diapositivas se reorganicen. GSAP solo se encarga de la animación (máscaras, dibujado de trazos, contadores y la secuencia cinética), y el motor propio ocupa unos 34 KB sin minificar.

## Editar contenido

- **Textos:** directamente en `index.html`. Cada diapositiva es un `<section class="slide" data-slide>`.
- **Imágenes:** sustituye el archivo en `img/` manteniendo el nombre (detalles en el documento interno `IMAGENES.md`).
- **Posición en escritorio:** cada elemento `.abs` lleva variables inline (`--x`, `--y`, `--r`, `--b`, `--w`, `--h`) en porcentaje del ancho del marco.
- **Animaciones:** atributos `data-anim` (`title`, `lines`, `up`, `fade`, `stagger`, `img`, `block`, `draw`, `rule`), con `data-at` para el retardo en segundos y `data-depth` para el parallax.
- **Recursos editoriales** de las diapositivas de texto, que se activan con clases:
  - `.rule` (con `data-anim="rule"`): filete bajo el título que se traza al entrar;
  - `.prose--drop`: letra capital rosa en el primer párrafo;
  - `.prose--cols`: texto a dos columnas con filete (solo en escritorio);
  - `.prose__kicker`: frase de cierre destacada;
  - `.media--framed`: marco rosa desplazado tras el bloque negro.
- **Titulares de capítulo:** el tamaño lo calcula el JS (`fitGiants`), de modo que cada línea ocupa justo el ancho útil y nunca se corta una letra, cambie el texto o el tamaño de la ventana.

## Incrustar en una web (iframe)

```html
<div class="senda-deck" style="position:relative;width:100%;aspect-ratio:16/9">
  <iframe id="senda-deck" src="https://USUARIO.github.io/senda-leadership-program/"
          title="Leadership Program de SENDA" allow="fullscreen" allowfullscreen loading="lazy"
          style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
</div>
<style>
  @media (max-width:767px), (max-aspect-ratio:6/5){
    .senda-deck{ aspect-ratio:auto !important; }
    .senda-deck iframe{ position:static !important; height:100vh; }
  }
</style>
<script>
  // En móvil la presentación envía su altura y el iframe se ajusta: sin doble scroll.
  addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'senda-deck:height' || !e.data.height) return;
    var f = document.getElementById('senda-deck');
    if (getComputedStyle(f).position === 'static') f.style.height = e.data.height + 'px';
  });
</script>
```

- **Escritorio:** el iframe mantiene 16:9 y la presentación se adapta a él. La rueda del ratón solo cambia de diapositiva cuando el iframe tiene el foco, así que no secuestra el scroll de la página.
- **Móvil:** el iframe toma la altura total del contenido y la página se desplaza con normalidad.
