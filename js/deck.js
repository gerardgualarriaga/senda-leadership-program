/* ============================================================================
   SENDA · Leadership Program · motor de la presentación
   Sin dependencias salvo GSAP (js/vendor/gsap.min.js). Si GSAP no carga, la
   presentación funciona igual, sin animaciones.

   Índice
     1. Estado y utilidades
     2. Preparación del DOM (títulos por palabras, letras, navegación de fases)
     3. Animaciones de entrada (genéricas y escenas)
     4. Modo escenario: navegación, transiciones, interfaz
     5. Modo documento (móvil): revelado al hacer scroll, altura para iframe
     6. Interacciones comunes: pilares, fases, pantalla completa
     7. Arranque y cambio de modo
   ============================================================================ */
(function () {
  'use strict';

  /* ── 1 · Estado y utilidades ─────────────────────────────────────────── */
  var root = document.documentElement;
  var STAGE_QUERY = '(min-width: 768px) and (min-aspect-ratio: 6/5)';
  var mqStage = window.matchMedia(STAGE_QUERY);
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var gsap = window.gsap;

  var frame = document.getElementById('frame');
  var slides = [].slice.call(document.querySelectorAll('[data-slide]'));
  var N = slides.length;
  var curtain = frame.querySelector('.curtain');

  var ui = {
    progress: document.getElementById('progress'),
    now: document.getElementById('count-now'),
    total: document.getElementById('count-total'),
    prev: document.getElementById('prev'),
    next: document.getElementById('next'),
    fs: document.getElementById('fullscreen'),
    live: document.getElementById('live')
  };

  var THEME_BG = { dark: '#0B0B0C', light: '#FFFAFA', pink: '#E95A7C' };

  var state = {
    mode: null,            // 'stage' | 'flow'
    current: -1,
    busy: false,
    queued: null,
    visited: {},
    timelines: {},         // timeline de entrada por diapositiva
    loops: {},             // animaciones continuas por diapositiva
    observers: []
  };

  var inIframe = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  // Incrustada: el CSS evita alturas en vh, que crecerían con el iframe al ajustarse
  if (inIframe) document.documentElement.classList.add('is-embedded');

  function reduced() { return mqReduce.matches || !gsap; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function clamp(i) { return Math.max(0, Math.min(N - 1, i)); }
  function themeOf(slide) {
    return slide.classList.contains('slide--pink') ? 'pink' :
           slide.classList.contains('slide--light') ? 'light' : 'dark';
  }
  /* Unidad de desplazamiento: 1 % del marco en escenario, 6 px en documento */
  function unit() { return state.mode === 'stage' ? frame.clientWidth / 100 : 6; }
  function $all(sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); }


  /* ── 2 · Preparación del DOM ─────────────────────────────────────────── */

  /* Parte un elemento en palabras conservando negritas, cursivas y saltos:
     cada palabra queda en <span class="w"><span>…</span></span>. */
  function tokenize(el) {
    var tokens = [], word = null;
    (function walk(node, chain) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          c.nodeValue.split(/(\s+)/).forEach(function (bit) {
            if (!bit) return;
            if (/^\s+$/.test(bit)) { word = null; tokens.push({ type: 'space', text: bit, chain: chain }); }
            else {
              if (!word) { word = { type: 'word', parts: [] }; tokens.push(word); }
              word.parts.push({ text: bit, chain: chain });
            }
          });
        } else if (c.nodeType === 1) {
          if (c.tagName === 'BR') { word = null; tokens.push({ type: 'br' }); }
          else walk(c, chain.concat(c));
        }
      }
    })(el, []);
    return tokens;
  }
  function wrapInChain(text, chain) {
    var node = document.createTextNode(text);
    for (var i = chain.length - 1; i >= 0; i--) {
      var shell = chain[i].cloneNode(false);
      shell.appendChild(node);
      node = shell;
    }
    return node;
  }
  function splitWords(el) {
    if (el.__split) return;
    var frag = document.createDocumentFragment();
    tokenize(el).forEach(function (t) {
      if (t.type === 'br') { frag.appendChild(document.createElement('br')); return; }
      if (t.type === 'space') { frag.appendChild(wrapInChain(t.text, t.chain)); return; }
      var mask = document.createElement('span');
      var inner = document.createElement('span');
      mask.className = 'w';
      t.parts.forEach(function (p) { inner.appendChild(wrapInChain(p.text, p.chain)); });
      mask.appendChild(inner);
      frag.appendChild(mask);
    });
    el.textContent = '';
    el.appendChild(frag);
    el.__split = true;
  }
  function splitChars(el) {
    if (el.__chars) return;
    var text = el.textContent;
    el.textContent = '';
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement('span');
      s.className = 'ch';
      s.textContent = text[i];
      el.appendChild(s);
    }
    el.__chars = true;
  }

  function prepareDom() {
    /* Títulos: el texto completo queda en aria-label; las piezas, ocultas */
    $all('[data-anim="title"], [data-anim="lines"]').forEach(function (el) {
      if (!el.hasAttribute('aria-label') && el.getAttribute('aria-hidden') !== 'true') {
        el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
      }
      var target = el.querySelector('.neg') || el;
      splitWords(target);
      $all('.w', target).forEach(function (w) { w.setAttribute('aria-hidden', 'true'); });
    });
    $all('.k-letters, .k-drop').forEach(splitChars);

    /* Navegación entre fases en cada diapositiva de fase */
    var phaseStart = 10; // índice (base 0) de la diapositiva 11
    $all('.phase-nav').forEach(function (nav) {
      var slideIndex = slides.indexOf(nav.closest('[data-slide]'));
      var html = '<button type="button" class="phase-nav__back" data-goto="10">Fases</button>';
      for (var p = 1; p <= 5; p++) {
        var idx = phaseStart + p;
        var current = (idx - 1) === slideIndex;
        html += '<button type="button" data-goto="' + idx + '"' + (current ? ' aria-current="step"' : '') +
                ' aria-label="Fase ' + p + '">' + p + '</button>';
      }
      nav.innerHTML = html;
    });

    ui.total.textContent = pad(N);
    if (!document.fullscreenEnabled) root.classList.add('no-fullscreen');
  }


  /* ── 3 · Animaciones de entrada ──────────────────────────────────────── */

  /* Agrupa elementos por línea visual (misma altura en pantalla) */
  function lineIndexes(els) {
    var tops = [];
    return els.map(function (w) {
      var top = Math.round(w.getBoundingClientRect().top);
      for (var i = 0; i < tops.length; i++) if (Math.abs(tops[i] - top) < 6) return i;
      tops.push(top);
      return tops.length - 1;
    });
  }

  function staggerChildren(el) {
    var kids = [].slice.call(el.children);
    /* Una lista dentro de un bloque de texto entra elemento a elemento */
    var out = [];
    kids.forEach(function (k) {
      if (k.matches('ul, ol') && !el.matches('.goals, .team')) out = out.concat([].slice.call(k.children));
      else out.push(k);
    });
    return out;
  }

  function drawables(svg) {
    return $all('[pathLength]', svg).filter(function (p) { return !p.classList.contains('dash'); });
  }

  function addGeneric(tl, el, at) {
    var u = unit();
    var kind = el.getAttribute('data-anim');
    var t = el.hasAttribute('data-at') ? parseFloat(el.getAttribute('data-at')) : at;

    switch (kind) {
      case 'title':
      case 'lines': {
        var words = $all('.w > span', el);
        var lines = lineIndexes($all('.w', el));
        var step = kind === 'lines' ? 0.09 : 0.07;
        words.forEach(function (w, i) {
          tl.fromTo(w, { yPercent: 112, opacity: 0 },
            { yPercent: 0, opacity: 1, duration: kind === 'lines' ? 0.9 : 0.8, ease: 'power4.out' }, t + lines[i] * step);
        });
        return t + 0.18;
      }
      case 'up':
        tl.fromTo(el, { y: 2.2 * u, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, t);
        return t + 0.12;
      case 'fade':
        tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power1.out' }, t);
        return t;
      case 'stagger': {
        var kids = staggerChildren(el);
        tl.fromTo(kids, { y: 1.6 * u, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out', stagger: 0.07 }, t);
        /* Iconos dentro: se trazan */
        $all('.ico', el).forEach(function (svg, i) {
          var paths = drawables(svg);
          if (paths.length) {
            tl.fromTo(paths, { strokeDasharray: 1, strokeDashoffset: 1 },
              { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: 0.05 }, t + 0.15 + i * 0.12);
          }
          var fills = $all('.fill', svg);
          if (fills.length) {
            tl.fromTo(fills, { scale: 0, transformOrigin: '50% 50%' },
              { scale: 1, duration: 0.5, ease: 'back.out(2)', stagger: 0.03 }, t + 0.6 + i * 0.12);
          }
        });
        return t + 0.1 + Math.min(kids.length, 6) * 0.05;
      }
      case 'img':
        tl.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)', y: 2.5 * u, scale: 1.06 },
          { clipPath: 'inset(0% 0% 0% 0%)', y: 0, scale: 1, duration: 1.3, ease: 'expo.out' }, t);
        return t + 0.1;
      case 'block': {
        var fromRight = el.getAttribute('data-from') === 'right';
        tl.fromTo(el, { scaleX: 0, transformOrigin: fromRight ? '100% 50%' : '0% 50%' },
          { scaleX: 1, duration: 0.95, ease: 'expo.out' }, t);
        return t + 0.12;
      }
      case 'rule': {
        /* Filete bajo el título: se traza de izquierda a derecha y el tramo
           rosa lo sigue con un poco de retardo. */
        tl.fromTo(el, { scaleX: 0, transformOrigin: '0% 50%' },
          { scaleX: 1, duration: 1.1, ease: 'expo.out' }, t);
        var tip = el.querySelector('.rule__tip');
        if (tip) {
          tl.fromTo(tip, { scaleX: 0, transformOrigin: '0% 50%' },
            { scaleX: 1, duration: 0.9, ease: 'expo.out' }, t + 0.22);
        }
        return t + 0.1;
      }
      case 'draw': {
        var paths2 = $all('[pathLength]', el);
        tl.fromTo(paths2, { strokeDasharray: 1, strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' }, t);
        return t + 0.45;
      }
    }
    return t;
  }

  var scenes = {
    chapter: function (tl, slide) {
      var u = unit();
      $all('.giant__line', slide).forEach(function (line, i) {
        var dir = parseFloat(line.getAttribute('data-dir')) || 1;
        tl.fromTo(line, { x: dir * 55 * u, opacity: 0 },
          { x: 0, opacity: 1, duration: 1.35, ease: 'expo.out' }, 0.05 + i * 0.08);
      });
    },

    kinetic: function (tl, slide) {
      var u = unit();
      tl.fromTo($all('.k-learning .ch', slide), { x: -2.5 * u, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.022 }, 0);
      var hundred = slide.querySelector('.k-100');
      tl.fromTo(hundred, { scale: 0.55, opacity: 0, transformOrigin: '20% 80%' },
        { scale: 1, opacity: 1, duration: 1.2, ease: 'expo.out' }, 0.15);
      countUp(tl, slide.querySelector('.k-100 .k-count'), 0.15, 1.5);
      tl.fromTo(slide.querySelector('.k-experiencial'), { letterSpacing: '.7em', opacity: 0 },
        { letterSpacing: '.12em', opacity: 1, duration: 1.3, ease: 'expo.out' }, 0.6);
      tl.fromTo($all('.k-tailor .ch', slide), { yPercent: -120, opacity: 0, rotation: -6 },
        { yPercent: 0, opacity: 1, rotation: 0, duration: 0.9, ease: 'expo.out', stagger: 0.035 }, 0.95);
      var stitch = slide.querySelector('.k-stitch');
      tl.fromTo(stitch, { clipPath: 'inset(0% 100% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'power2.inOut' }, 1.45);
      tl.fromTo($all('.k-diseno .ch', slide), { opacity: 0, y: 0.8 * u },
        { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.03 }, 1.65);
    },

    phases: function (tl, slide) {
      var u = unit();
      var line = slide.querySelector('.timeline__line path');
      if (line && state.mode === 'stage') {
        tl.fromTo(line, { strokeDasharray: 1, strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut' }, 0.35);
      }
      $all('.phase', slide).forEach(function (ph, i) {
        var at = 0.35 + i * 0.36;
        tl.fromTo(ph.querySelector('.phase__node'), { scale: 0 },
          { scale: 1, duration: 0.6, ease: 'back.out(2.2)' }, at);
        tl.fromTo([ph.querySelector('.phase__num'), ph.querySelector('.phase__name')], { y: 1.4 * u, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.06 }, at + 0.05);
      });
    },

    numeral: function (tl, slide) {
      var text = slide.querySelector('.numeral text');
      if (!text) return;
      tl.fromTo(text, { strokeDasharray: 1600, strokeDashoffset: 1600, fillOpacity: 0 },
        { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut' }, 0.15);
      tl.to(text, { fillOpacity: 1, duration: 0.7, ease: 'power1.out' }, 1.2);
    },

    manifest: function (tl, slide) {
      var u = unit();
      tl.fromTo(slide.querySelector('.manifest__num'), { opacity: 0, y: 2 * u },
        { opacity: 1, y: 0, duration: 1, ease: 'expo.out' }, 0.2);
      countUp(tl, slide.querySelector('.manifest .k-count'), 0.2, 1.4);
      tl.fromTo($all('.manifest__words li', slide), { opacity: 0, x: 3 * u },
        { opacity: 1, x: 0, duration: 0.8, ease: 'expo.out', stagger: 0.14 }, 0.75);
    }
  };

  function countUp(tl, el, at, dur) {
    if (!el) return;
    var to = parseInt(el.getAttribute('data-to'), 10) || 0;
    var obj = { v: 0 };
    tl.fromTo(obj, { v: 0 }, {
      v: to, duration: dur, ease: 'power2.out',
      onUpdate: function () { el.textContent = Math.round(obj.v); }
    }, at);
  }

  /* Construye (o reutiliza) la línea de tiempo de entrada de una diapositiva */
  function buildEnter(slide) {
    var tl = gsap.timeline({ paused: true });
    var at = 0.05;
    $all('[data-anim]', slide).forEach(function (el) {
      if (el.closest('[aria-hidden="true"]') && !el.matches('[data-anim]')) return;
      at = addGeneric(tl, el, at);
    });
    var scene = slide.getAttribute('data-scene');
    if (scene && scenes[scene]) scenes[scene](tl, slide);
    return tl;
  }

  function playEnter(slide) {
    var i = slides.indexOf(slide);
    if (reduced()) return;
    if (state.timelines[i]) state.timelines[i].kill();
    var tl = buildEnter(slide);
    state.timelines[i] = tl;
    /* En visitas repetidas, la misma entrada pero ágil */
    tl.timeScale(state.visited[i] ? 2.4 : 1).play(0);
    state.visited[i] = true;
    startLoops(slide);
  }

  /* Animaciones continuas mientras la diapositiva está a la vista */
  function startLoops(slide) {
    var i = slides.indexOf(slide);
    stopLoops(slide);
    if (reduced()) return;
    var loops = [];
    $all('.gear--a', slide).forEach(function (g) { loops.push(gsap.to(g, { rotation: 360, duration: 16, ease: 'none', repeat: -1 })); });
    $all('.gear--b', slide).forEach(function (g) { loops.push(gsap.to(g, { rotation: -360, duration: 11, ease: 'none', repeat: -1 })); });
    $all('.ring', slide).forEach(function (g) { loops.push(gsap.to(g, { rotation: 360, duration: 40, ease: 'none', repeat: -1, transformOrigin: '50% 50%' })); });
    $all('.rays', slide).forEach(function (g) { loops.push(gsap.to(g, { opacity: 0.35, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1 })); });
    $all('.eye-pupil', slide).forEach(function (g) { loops.push(gsap.to(g, { x: 2.5, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1 })); });
    $all('.ico--target .arrow', slide).forEach(function (g) {
      loops.push(gsap.to(g, { x: 1.6, y: -1.6, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    });
    $all('.figure--cover', slide).forEach(function (g) {
      loops.push(gsap.to(g, { scale: 1.05, duration: 22, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '60% 40%' }));
    });
    if (slide.getAttribute('data-scene') === 'chapter' && state.mode === 'stage') {
      var u = unit();
      $all('.giant__line', slide).forEach(function (line) {
        var dir = parseFloat(line.getAttribute('data-dir')) || 1;
        loops.push(gsap.to(line, { xPercent: dir * 0.7, duration: 9, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.4 }));
      });
    }
    state.loops[i] = loops;
  }
  function stopLoops(slide) {
    var i = slides.indexOf(slide);
    (state.loops[i] || []).forEach(function (t) { t.kill(); });
    state.loops[i] = [];
  }


  /* ── 4 · Modo escenario ─────────────────────────────────────────────── */

  function updateHud(i) {
    ui.now.textContent = pad(i + 1);
    ui.progress.style.transform = 'scaleX(' + ((i + 1) / N) + ')';
    ui.prev.disabled = i === 0;
    ui.next.disabled = i === N - 1;
    var slide = slides[i];
    var theme = themeOf(slide);
    root.setAttribute('data-theme', theme);
    document.body.style.setProperty('--stage-bg', THEME_BG[theme]);
    ui.live.textContent = 'Diapositiva ' + (i + 1) + ' de ' + N + ': ' + (slide.getAttribute('aria-label') || '');
  }

  function setHash(i) {
    var h = '#/' + (i + 1);
    if (location.hash !== h) {
      try { history.replaceState(null, '', h); } catch (e) { location.hash = h; }
    }
  }

  function indexFromHash() {
    var m = /^#\/(\d+)/.exec(location.hash);
    return m ? clamp(parseInt(m[1], 10) - 1) : 0;
  }

  function goTo(i, opts) {
    opts = opts || {};
    i = clamp(i);
    if (state.mode !== 'stage') { scrollToSlide(i); return; }
    if (i === state.current && !opts.force) return;
    if (state.busy) { state.queued = i; return; }

    var prev = state.current >= 0 ? slides[state.current] : null;
    var next = slides[i];
    var dir = i > state.current ? 1 : -1;
    state.current = i;

    updateHud(i);
    setHash(i);
    slides.forEach(function (s) {
      var on = s === next;
      s.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (on) s.removeAttribute('inert'); else s.setAttribute('inert', '');
    });

    if (reduced()) {
      if (prev) prev.classList.remove('is-active');
      next.classList.add('is-active');
      return;
    }

    state.busy = true;
    var chapter = next.getAttribute('data-scene') === 'chapter' || (prev && prev.getAttribute('data-scene') === 'chapter');
    var tl = gsap.timeline({
      onComplete: function () {
        state.busy = false;
        if (state.queued !== null) { var q = state.queued; state.queued = null; goTo(q); }
      }
    });

    var reveal = function () {
      if (prev) {
        prev.classList.remove('is-active', 'is-leaving');
        gsap.set(prev, { clearProps: 'opacity,visibility' });
        stopLoops(prev);
      }
      next.classList.add('is-active');
      gsap.set(next, { opacity: 1 });
      playEnter(next);
    };

    if (!prev) {
      reveal();
    } else if (chapter) {
      var color = THEME_BG[themeOf(next)] === THEME_BG.pink ? THEME_BG.pink : THEME_BG[themeOf(next)];
      gsap.set(curtain, { backgroundColor: color, scaleY: 0, transformOrigin: dir > 0 ? '50% 100%' : '50% 0%' });
      tl.to(curtain, { scaleY: 1, duration: 0.55, ease: 'expo.inOut' });
      tl.add(reveal);
      tl.set(curtain, { transformOrigin: dir > 0 ? '50% 0%' : '50% 100%' });
      tl.to(curtain, { scaleY: 0, duration: 0.65, ease: 'expo.inOut' });
    } else {
      prev.classList.add('is-leaving');
      tl.to(prev, { opacity: 0, duration: 0.38, ease: 'power2.in' });
      tl.add(reveal);
    }
    /* Fuera del bloqueo antes de que acabe la entrada: permite avanzar rápido */
    tl.add(function () {}, '+=0.15');
  }

  function next() { goTo(state.current + 1); }
  function prev() { goTo(state.current - 1); }

  function isInteractive(el) {
    return !!(el && el.closest && el.closest('a, button, input, textarea, select, [role="button"], .pillar__panel'));
  }

  var stageHandlers = {
    keydown: function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key;
      var onControl = isInteractive(e.target);
      if ((k === ' ' || k === 'Enter') && onControl) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].indexOf(k) > -1) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].indexOf(k) > -1) { e.preventDefault(); prev(); }
      else if (k === 'Home') { e.preventDefault(); goTo(0); }
      else if (k === 'End') { e.preventDefault(); goTo(N - 1); }
      else if (k === 'f' || k === 'F') { toggleFullscreen(); }
    },
    wheelAcc: 0,
    wheelLast: 0,
    wheel: function (e) {
      /* Dentro de un iframe no se secuestra el scroll de la página hasta que
         la presentación tiene el foco (tras un clic o una tecla). */
      if (inIframe && !document.hasFocus()) return;
      e.preventDefault();
      var now = Date.now();
      if (now - stageHandlers.wheelLast > 250) stageHandlers.wheelAcc = 0;
      stageHandlers.wheelLast = now;
      stageHandlers.wheelAcc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (stageHandlers.locked) return;
      if (Math.abs(stageHandlers.wheelAcc) > 50) {
        if (stageHandlers.wheelAcc > 0) next(); else prev();
        stageHandlers.wheelAcc = 0;
        stageHandlers.locked = true;
        setTimeout(function () { stageHandlers.locked = false; }, 850);
      }
    },
    touchStart: null,
    touchstart: function (e) {
      var t = e.changedTouches[0];
      stageHandlers.touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    },
    touchend: function (e) {
      var s = stageHandlers.touchStart;
      if (!s) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 50 || Date.now() - s.time > 800) return;
      if (Math.abs(dx) > Math.abs(dy)) { if (dx < 0) next(); else prev(); }
      else { if (dy < 0) next(); else prev(); }
    },
    zone: function (e) {
      if (isInteractive(e.target)) { frame.classList.remove('zone-prev', 'zone-next'); return 0; }
      var r = frame.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width;
      var z = x < 0.12 ? -1 : x > 0.88 ? 1 : 0;
      frame.classList.toggle('zone-prev', z === -1 && state.current > 0);
      frame.classList.toggle('zone-next', z === 1 && state.current < N - 1);
      return z;
    },
    click: function (e) {
      var z = stageHandlers.zone(e);
      if (z === -1) prev(); else if (z === 1) next();
    },
    pointermove: function (e) {
      stageHandlers.zone(e);
      wakeUp();
      parallax(e);
    }
  };

  /* Parallax suave con el puntero en los elementos con data-depth */
  var par = { tx: 0, ty: 0, x: 0, y: 0, raf: null, els: [] };
  function parallax(e) {
    if (reduced() || state.mode !== 'stage') return;
    var r = frame.getBoundingClientRect();
    par.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    par.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!par.raf) par.raf = requestAnimationFrame(parallaxFrame);
  }
  function parallaxFrame() {
    par.raf = null;
    par.x += (par.tx - par.x) * 0.08;
    par.y += (par.ty - par.y) * 0.08;
    var u = unit();
    var slide = slides[state.current];
    if (slide) {
      $all('[data-depth]', slide).forEach(function (el) {
        var d = parseFloat(el.getAttribute('data-depth')) || 0;
        el.style.translate = (par.x * d * -1.1 * u).toFixed(2) + 'px ' + (par.y * d * -0.7 * u).toFixed(2) + 'px';
      });
    }
    if (Math.abs(par.tx - par.x) > 0.002 || Math.abs(par.ty - par.y) > 0.002) par.raf = requestAnimationFrame(parallaxFrame);
  }

  /* Oculta puntero e interfaz tras unos segundos sin mover el ratón */
  var idleTimer = null;
  function wakeUp() {
    root.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (state.mode === 'stage' && !document.querySelector('.hud__bar:hover')) root.classList.add('is-idle');
    }, 2600);
  }

  /* Titulares de capítulo: cada línea se ajusta al ancho útil del marco.
     Se mide el ancho real de la línea y se reescala la tipografía, así que
     nunca se corta una letra por mucho que cambie el texto o el tamaño. */
  function fitGiants() {
    $all('.slide--chapter .giant').forEach(function (giant) {
      var target = giant.getBoundingClientRect().width;
      if (!target) return;
      $all('.giant__line', giant).forEach(function (line) {
        line.style.fontSize = '';
        var base = parseFloat(getComputedStyle(line).fontSize);
        var w = line.scrollWidth;
        if (!w || !base) return;
        line.style.fontSize = (base * (target / w)).toFixed(2) + 'px';
      });
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitGiants);

  function enterStage() {
    state.mode = 'stage';
    root.classList.add('is-stage');
    root.classList.remove('is-flow');
    slides.forEach(function (s) { s.classList.remove('is-active', 'is-leaving'); });
    document.addEventListener('keydown', stageHandlers.keydown);
    window.addEventListener('wheel', stageHandlers.wheel, { passive: false });
    frame.addEventListener('touchstart', stageHandlers.touchstart, { passive: true });
    frame.addEventListener('touchend', stageHandlers.touchend, { passive: true });
    frame.addEventListener('click', stageHandlers.click);
    document.addEventListener('pointermove', stageHandlers.pointermove, { passive: true });
    state.current = -1;
    fitGiants();
    goTo(indexFromHash(), { force: true });
    wakeUp();
    postHeight();
  }
  function leaveStage() {
    document.removeEventListener('keydown', stageHandlers.keydown);
    window.removeEventListener('wheel', stageHandlers.wheel);
    frame.removeEventListener('touchstart', stageHandlers.touchstart);
    frame.removeEventListener('touchend', stageHandlers.touchend);
    frame.removeEventListener('click', stageHandlers.click);
    document.removeEventListener('pointermove', stageHandlers.pointermove);
    root.classList.remove('is-idle');
    slides.forEach(function (s) { s.removeAttribute('inert'); s.removeAttribute('aria-hidden'); });
  }


  /* ── 5 · Modo documento (móvil) ─────────────────────────────────────── */

  function scrollToSlide(i) {
    var s = slides[clamp(i)];
    if (s) s.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  }

  function enterFlow() {
    state.mode = 'flow';
    root.classList.add('is-flow');
    root.classList.remove('is-stage');
    root.removeAttribute('data-theme');
    document.body.style.removeProperty('--stage-bg');

    if (!reduced() && 'IntersectionObserver' in window) {
      /* Las diapositivas fuera de pantalla quedan en su estado inicial y se
         revelan al entrar. Las visibles al cargar se animan ya. */
      var revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          revealIO.unobserve(en.target);
          var i = slides.indexOf(en.target);
          var tl = state.timelines[i];
          if (tl) { tl.play(0); startLoops(en.target); state.visited[i] = true; }
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
      slides.forEach(function (s, i) {
        state.timelines[i] = buildEnter(s);
        state.timelines[i].progress(0).pause();
        revealIO.observe(s);
      });
      state.observers.push(revealIO);
    }

    /* Diapositiva «actual» para el contador y el enlace directo */
    if ('IntersectionObserver' in window) {
      var currentIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            var i = slides.indexOf(en.target);
            state.current = i;
            ui.now.textContent = pad(i + 1);
            setHash(i);
          }
        });
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
      slides.forEach(function (s) { currentIO.observe(s); });
      state.observers.push(currentIO);
    }

    window.addEventListener('scroll', flowProgress, { passive: true });
    flowProgress();

    var start = indexFromHash();
    if (start > 0) setTimeout(function () { slides[start].scrollIntoView({ block: 'start' }); }, 60);
    postHeight();
  }
  function leaveFlow() {
    state.observers.forEach(function (o) { o.disconnect(); });
    state.observers = [];
    window.removeEventListener('scroll', flowProgress);
  }
  function flowProgress() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? window.scrollY / max : 0;
    ui.progress.style.transform = 'scaleX(' + p + ')';
  }

  /* Altura para el iframe: la página que incrusta la presentación puede
     escuchar este mensaje y ajustar la altura del iframe en móvil. */
  var lastHeight = 0;
  function postHeight() {
    if (!inIframe) return;
    // Altura real del contenido (no scrollHeight, que nunca baja de la altura del iframe)
    var h = state.mode === 'stage' ? 0 : Math.ceil(document.getElementById('deck').getBoundingClientRect().height);
    if (h === lastHeight) return;
    lastHeight = h;
    try { window.parent.postMessage({ type: 'senda-deck:height', mode: state.mode, height: h }, '*'); } catch (e) {}
  }


  /* ── 6 · Interacciones comunes ───────────────────────────────────────── */

  function initPillars() {
    var pillars = $all('.pillar');
    pillars.forEach(function (p) {
      var btn = p.querySelector('.pillar__btn');
      var panel = p.querySelector('.pillar__panel');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = btn.getAttribute('aria-expanded') === 'true';
        pillars.forEach(function (o) { if (o !== p) setPillar(o, false); });
        setPillar(p, !open);
      });
    });
  }
  function setPillar(p, open) {
    var btn = p.querySelector('.pillar__btn');
    var panel = p.querySelector('.pillar__panel');
    var isOpen = btn.getAttribute('aria-expanded') === 'true';
    if (open === isOpen) return;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    p.classList.toggle('is-open', open);
    if (reduced()) { panel.hidden = !open; postHeight(); return; }
    gsap.killTweensOf(panel);
    if (open) {
      panel.hidden = false;
      gsap.fromTo(panel, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.7, ease: 'expo.out', onComplete: postHeight });
      var items = $all('p, li', panel);
      gsap.fromTo(items, { y: unit() * 1.2, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.025, delay: 0.08 });
    } else {
      gsap.to(panel, {
        height: 0, opacity: 0, duration: 0.45, ease: 'power3.inOut',
        onComplete: function () { panel.hidden = true; gsap.set(panel, { clearProps: 'height,opacity' }); postHeight(); }
      });
    }
  }

  function initGoto() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-goto]');
      if (!btn) return;
      e.stopPropagation();
      goTo(parseInt(btn.getAttribute('data-goto'), 10) - 1);
    });
    ui.prev.addEventListener('click', function (e) { e.stopPropagation(); prev(); });
    ui.next.addEventListener('click', function (e) { e.stopPropagation(); next(); });
    window.addEventListener('hashchange', function () {
      var i = indexFromHash();
      if (i !== state.current) goTo(i);
    });
  }

  function toggleFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  }
  function initFullscreen() {
    ui.fs.addEventListener('click', function (e) { e.stopPropagation(); toggleFullscreen(); });
    document.addEventListener('fullscreenchange', function () {
      var on = !!document.fullscreenElement;
      root.classList.toggle('is-fullscreen', on);
      ui.fs.setAttribute('aria-pressed', on ? 'true' : 'false');
      ui.fs.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Pantalla completa');
    });
  }


  /* ── 7 · Arranque y cambio de modo ───────────────────────────────────── */

  function resetAnimations() {
    Object.keys(state.timelines).forEach(function (k) { state.timelines[k].kill(); });
    state.timelines = {};
    slides.forEach(stopLoops);
    if (gsap) {
      gsap.killTweensOf(curtain);
      gsap.set(curtain, { clearProps: 'transform,backgroundColor' });
      /* Sólo las propiedades que animamos: el atributo style de muchos
         elementos lleva además sus variables de posición (--x, --y…). */
      var animated = $all('[data-anim], [data-anim] *, .giant__line, .ch, .k, .k-stitch, .timeline__line path, .phase__node, .phase__num, .phase__name, .numeral text, .manifest__num, .manifest__words li, [data-slide]');
      gsap.set(animated, { clearProps: 'transform,opacity,visibility,clipPath,strokeDasharray,strokeDashoffset,fillOpacity,letterSpacing,height' });
    }
    $all('[data-depth]').forEach(function (el) { el.style.translate = ''; });
    $all('.k-count').forEach(function (el) { el.textContent = el.getAttribute('data-to'); });
    state.busy = false;
    state.queued = null;
  }

  function applyMode() {
    var want = mqStage.matches ? 'stage' : 'flow';
    if (want === state.mode) return;
    if (state.mode === 'stage') leaveStage();
    if (state.mode === 'flow') leaveFlow();
    resetAnimations();
    if (want === 'stage') enterStage(); else enterFlow();
    fitGiants();
  }

  function init() {
    prepareDom();
    initPillars();
    initGoto();
    initFullscreen();
    applyMode();
    if (mqStage.addEventListener) mqStage.addEventListener('change', applyMode);
    else mqStage.addListener(applyMode);
    if ('ResizeObserver' in window) new ResizeObserver(postHeight).observe(document.body);
    window.addEventListener('load', postHeight);
    /* Si cambia el tamaño en escenario, las unidades de desplazamiento cambian:
       la diapositiva actual se reposiciona sin animación. */
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        fitGiants();
        if (state.mode === 'stage' && state.timelines[state.current]) state.timelines[state.current].progress(1);
      }, 150);
    });
    root.classList.add('is-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
