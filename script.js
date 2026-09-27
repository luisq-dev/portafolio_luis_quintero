(function () {
    'use strict';

    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    /* ---------------------------------------------------------------
       Utilidades
    --------------------------------------------------------------- */

    const $ = (sel, ctx) => (ctx || document).querySelector(sel);
    const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
    const lerp = (a, b, t) => a + (b - a) * t;

    /* Estado global del puntero (efecto magnetismo con inercia) */
    const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    let ticking = false;

    window.addEventListener('pointermove', (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(frame);
        }
    }, { passive: true });

    function frame() {
        ticking = false;
        for (const m of magnetics) m.update();
        for (const t of tilts) t.update();
    }

    /* ===============================================================
       1. TEMA CLARO / OSCURO
    =============================================================== */

    function initTheme() {
        const btn = $('[data-theme-toggle]');
        if (!btn) return;

        const sync = () => {
            const dark = root.getAttribute('data-theme') === 'dark';
            btn.setAttribute('aria-pressed', String(dark));
            btn.setAttribute('aria-label',
                dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
        };

        sync();

        btn.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('lq-theme', next); } catch (e) { /* ignorado */ }
            sync();
        });

        // Sigue la preferencia del sistema si el usuario nunca eligió manualmente
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            let saved = null;
            try { saved = localStorage.getItem('lq-theme'); } catch (err) { /* ignorado */ }
            if (saved) return;
            root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            sync();
        });
    }

    /* ===============================================================
       2. HALO QUE SIGUE AL CURSOR
    =============================================================== */

    function initCursorGlow() {
        const glow = $('.cursor-glow');
        if (!glow || !finePointer.matches) return;

        let shown = false;

        window.addEventListener('pointermove', () => {
            if (shown) return;
            shown = true;
            glow.classList.add('is-active');
        }, { passive: true, once: true });

        document.addEventListener('pointerleave', () => glow.classList.remove('is-active'));
        document.addEventListener('pointerenter', () => glow.classList.add('is-active'));
    }

    /* ===============================================================
       3. REVELADO AL HACER SCROLL
    =============================================================== */

    let revealObserver = null;

    function initReveal() {
        const targets = $$('[data-reveal]');

        if (!('IntersectionObserver' in window) || reducedMotion.matches) {
            targets.forEach((el) => el.classList.add('is-in'));
            return;
        }

        revealObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-in');
                obs.unobserve(entry.target);
            });
        }, {
            rootMargin: '0px 0px -12% 0px',
            threshold: 0.12
        });

        targets.forEach((el) => revealObserver.observe(el));
    }

    /* ---------------------------------------------------------------
       Revelado de la portada (oculto, sin mostrar)
    --------------------------------------------------------------- */

    function initHeroIntro() {
        const heroItems = $$('.hero__item');
        const title = $('.hero__title');

        requestAnimationFrame(() => {
            heroItems.forEach((el) => el.classList.add('is-in'));
            if (title) title.classList.add('is-in');
        });
    }

    /* ===============================================================
       4. TÍTULO: DIVISIÓN EN PALABRAS
    =============================================================== */

    function initSplitText() {
        const groups = $$('[data-split]');
        if (!groups.length) return;

        let base = 0;

        groups.forEach((el) => {
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            const words = text.split(' ');

            // Accesibilidad: el texto real queda en aria-label,
            // la versión animada se oculta a lectores de pantalla.
            el.setAttribute('aria-label', text);

            const frag = document.createDocumentFragment();

            words.forEach((word, i) => {
                const outer = document.createElement('span');
                outer.className = 'word';

                const inner = document.createElement('span');
                inner.className = 'word__i';
                inner.style.setProperty('--base', base + i);
                inner.textContent = word;

                outer.appendChild(inner);
                frag.appendChild(outer);

                if (i < words.length - 1) frag.appendChild(document.createTextNode(' '));
            });

            el.textContent = '';
            el.appendChild(frag);
            el.setAttribute('aria-hidden', 'true');

            base += words.length;
        });
    }

    /* ===============================================================
       5. CABECERA, PROGRESO Y BOTÓN "VOLVER ARRIBA"
    =============================================================== */

    const toTop = $('[data-to-top]');

    function initScrollChrome() {
        const header = $('[data-header]');
        const progress = $('[data-progress]');

        function update() {
            const y = scrollY;
            const max = document.documentElement.scrollHeight - innerHeight;

            if (header) header.classList.toggle('is-stuck', y > 12);
            if (progress) {
                progress.style.setProperty('--progress', max > 0 ? clamp(y / max, 0, 1) : 0);
            }
            if (toTop) toTop.classList.toggle('is-visible', y > innerHeight * 0.9);

            updateTimeline();
            updateSpy();
        }

        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update, { passive: true });
        update();
    }

    /* ===============================================================
       6. LÍNEA DE TIEMPO QUE SE DIBUJA
    =============================================================== */

    let timelineEl = null;

    function updateTimeline() {
        if (!timelineEl) return;

        const rect = timelineEl.getBoundingClientRect();
        const anchor = innerHeight * 0.75;
        const total = rect.height || 1;

        const p = clamp((anchor - rect.top) / total, 0, 1);
        timelineEl.style.setProperty('--p', p.toFixed(3));
    }

    /* ===============================================================
       7. ENLACE ACTIVO SEGÚN SCROLL (scroll spy)
    =============================================================== */

    const sections = $$('main section[id]');
    const navLinks = $$('.nav__link');
    const indicator = $('[data-nav-indicator]');

    function updateSpy() {
        if (!navLinks.length) return;

        const line = scrollY + innerHeight * 0.3;
        let currentId = null;

        for (const section of sections) {
            if (section.offsetTop <= line) currentId = section.id;
        }

        navLinks.forEach((link) => {
            link.classList.toggle('is-active', link.getAttribute('href') === '#' + currentId);
        });

        if (indicator) {
            const activeLink = navLinks.find((l) =>
                l.getAttribute('href') === '#' + currentId);

            if (activeLink) {
                indicator.style.setProperty('--ind-w', activeLink.offsetWidth + 'px');
                indicator.style.setProperty('--ind-x', activeLink.offsetLeft + 'px');
                indicator.classList.add('is-visible');
            } else {
                indicator.classList.remove('is-visible');
            }
        }
    }

    /* ===============================================================
       8. EFECTO MAGNÉTICO EN BOTONES Y ENLACES
    =============================================================== */

    const magnetics = [];

    function initMagnetic() {
        if (!finePointer.matches || reducedMotion.matches) return;

        $$('[data-magnetic]').forEach((el) => {
            const state = { x: 0, y: 0, tx: 0, ty: 0, active: false, raf: 0 };

            state.update = function () {
                state.x = lerp(state.x, state.tx, 0.18);
                state.y = lerp(state.y, state.ty, 0.18);

                el.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0)`;

                const moving = Math.abs(state.tx - state.x) > 0.05 ||
                    Math.abs(state.ty - state.y) > 0.05;

                if (state.active && moving) {
                    state.raf = requestAnimationFrame(state.update);
                } else {
                    state.active = false;
                }
            };

            const start = () => {
                if (!state.active) {
                    state.active = true;
                    state.raf = requestAnimationFrame(state.update);
                }
            };

            el.addEventListener('pointerenter', () => {
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const dx = pointer.x - cx;
                const dy = pointer.y - cy;
                state.tx = dx * 0.22;
                state.ty = dy * 0.32;
                start();
            });

            el.addEventListener('pointermove', () => {
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                state.tx = (pointer.x - cx) * 0.22;
                state.ty = (pointer.y - cy) * 0.32;
                start();
            });

            el.addEventListener('pointerleave', () => {
                state.tx = 0;
                state.ty = 0;
                start();
            });

            magnetics.push(state);
        });
    }

    /* ===============================================================
       9. INCLINACIÓN 3D (efecto tilt)
    =============================================================== */

    const tilts = [];

    function initTilt() {
        if (!finePointer.matches || reducedMotion.matches) return;

        $$('[data-tilt]').forEach((el) => {
            const state = { x: 0, y: 0, tx: 0, ty: 0, active: false };

            state.update = function () {
                state.x = lerp(state.x, state.tx, 0.12);
                state.y = lerp(state.y, state.ty, 0.12);

                el.style.transform =
                    `perspective(900px) rotateX(${state.y.toFixed(2)}deg) rotateY(${state.x.toFixed(2)}deg) translateZ(0)`;

                const moving = Math.abs(state.tx - state.x) > 0.01 ||
                    Math.abs(state.ty - state.y) > 0.01;

                if (state.active && moving) {
                    requestAnimationFrame(state.update);
                } else {
                    state.active = false;
                }
            };

            const start = () => {
                if (!state.active) {
                    state.active = true;
                    requestAnimationFrame(state.update);
                }
            };

            el.addEventListener('pointerenter', (e) => {
                const r = el.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width;
                const py = (e.clientY - r.top) / r.height;
                state.tx = (px - 0.5) * 2;
                state.ty = (py - 0.5) * -2;
                start();
            });

            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width;
                const py = (e.clientY - r.top) / r.height;
                state.tx = (px - 0.5) * 2;
                state.ty = (py - 0.5) * -2;
                start();
            });

            el.addEventListener('pointerleave', () => {
                state.tx = 0;
                state.ty = 0;
                start();
            });

            tilts.push(state);
        });
    }

    /* ===============================================================
       10. REFLEJO QUE SIGUE AL CURSOR EN LAS TARJETAS
    =============================================================== */

    function initSpotlight() {
        if (!finePointer.matches) return;

        $$('[data-spotlight]').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
                el.style.setProperty('--my', (e.clientY - r.top) + 'px');
            }, { passive: true });
        });

        // Halo global
        const glow = $('.cursor-glow');
        if (!glow) return;

        let gx = null, gy = null, cx = null, cy = null, raf = 0;

        function loop() {
            if (gx === null) { gx = pointer.x; gy = pointer.y; cx = gx; cy = gy; }
            cx = lerp(cx, gx, 0.09);
            cy = lerp(cy, gy, 0.09);

            glow.style.setProperty('--cx', cx.toFixed(1) + 'px');
            glow.style.setProperty('--cy', cy.toFixed(1) + 'px');

            if (Math.abs(gx - cx) > 0.1 || Math.abs(gy - cy) > 0.1) {
                raf = requestAnimationFrame(loop);
            } else {
                raf = 0;
            }
        }

        window.addEventListener('pointermove', (e) => {
            gx = e.clientX;
            gy = e.clientY;
            if (!raf) raf = requestAnimationFrame(loop);
        }, { passive: true });
    }

    /* ===============================================================
       11. BRILLO EN LOS BOTONES + ONDA AL PULSAR
    =============================================================== */

    function initButtons() {
        $$('.btn, .contact__mail').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
                el.style.setProperty('--my', (e.clientY - r.top) + 'px');
            }, { passive: true });

            el.addEventListener('click', (e) => {
                if (reducedMotion.matches) return;

                const r = el.getBoundingClientRect();
                const size = Math.max(r.width, r.height) * 2.2;

                const span = document.createElement('span');
                span.className = 'ripple';
                span.style.width = span.style.height = size + 'px';
                span.style.left = (e.clientX - r.left) + 'px';
                span.style.top = (e.clientY - r.top) + 'px';

                el.appendChild(span);
                setTimeout(() => span.remove(), 700);
            });
        });
    }

    /* ===============================================================
       12. CONTADORES ANIMADOS
    =============================================================== */

    function animateCount(el) {
        const target = parseFloat(el.dataset.count || '0');
        const duration = 1500;
        const start = performance.now();

        if (reducedMotion.matches) {
            el.textContent = String(target);
            return;
        }

        function step(now) {
            const t = clamp((now - start) / duration, 0, 1);
            const eased = 1 - Math.pow(1 - t, 4);          // easeOutQuart
            el.textContent = String(Math.round(target * eased));
            if (t < 1) requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }

    function initCounters() {
        const counters = $$('[data-count]');
        if (!counters.length) return;

        if (!('IntersectionObserver' in window)) {
            counters.forEach(animateCount);
            return;
        }

        const io = new IntersectionObserver((entries, obs) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                animateCount(entry.target);
                obs.unobserve(entry.target);
            });
        }, { threshold: 0.6 });

        counters.forEach((el) => io.observe(el));
    }

    /* ===============================================================
       13. CINTA INFINITA
    ===============================================================

       Antes se duplicaba el contenido y se animaba hasta -50%. Eso
       tenía dos problemas visibles: se veía el texto repetido y el
       salto del reinicio se notaba.

       Aquí en su lugar la cinta se desplaza un píxel a cada frame y,
       cuando la primera vuelta ya ha salido por completo, se le suma
       su propia anchura. Como el contenido es una repetición perfecta
       y el desplazamiento vuelve al mismo punto, el resultado visual
       es idéntico: no hay costura, ni principio, ni final.

       La pista se rellena con las vueltas necesarias para que siempre
       cubra la ventana, de modo que nunca aparece un hueco vacío.
    */

    const MARQUEE_VELOCIDAD = 42;   // píxeles por segundo

    function initMarquee() {
        const cinta = $('[data-marquee]');
        if (!cinta) return;

        const pista = $('[data-marquee-track]', cinta);
        if (!pista) return;

        // Si el usuario pide menos movimiento, la cinta se queda quieta
        if (reducedMotion.matches) return;

        // Se guarda una copia limpia de los elementos originales
        const plantilla = Array.from(pista.children).map((el) => el.cloneNode(true));
        if (!plantilla.length) return;

        let anchoVuelta = 0;
        let x = 0;
        let anterior = 0;
        let raf = 0;
        let visible = true;

        /* Añade vueltas hasta tapar la ventana más una vuelta de margen,
           para que al reciclar nunca quede un hueco vacío. */
        function rellenar() {
            pista.textContent = '';

            let ancho = 0;
            do {
                plantilla.forEach((el) => {
                    const nodo = el.cloneNode(true);
                    nodo.setAttribute('aria-hidden', 'true');
                    pista.appendChild(nodo);
                });
                ancho += anchoVuelta;
            } while (ancho < window.innerWidth + anchoVuelta);
        }

        /* Calcula lo que ocupa una vuelta completa.

           Ojo: hay que medir DESPUÉS de montar los elementos en la página.
           Un nodo que no está en el DOM devuelve anchura 0, y con ese
           valor el salto del bucle quedaría descuadrado y se vería. */
        function medir() {
            // Se deja una sola vuelta para poder medirla
            pista.textContent = '';
            plantilla.forEach((el) => pista.appendChild(el.cloneNode(true)));

            const cs = getComputedStyle(pista);
            const hueco = parseFloat(cs.columnGap || cs.gap) || 0;

            // Anchura del contenido, que aún no incluye el hueco final
            const ancho = pista.getBoundingClientRect().width;

            // El periodo real del contenido es texto + hueco: es la
            // distancia tras la cual la repetición empieza otra vez
            anchoVuelta = ancho + hueco;

            if (anchoVuelta > 0) {
                rellenar();

                // La cinta debe quedar siempre dentro de (-vuelta, 0].
                // Ojo con el signo: en JavaScript -105 % 1347 da -105, no
                // 1242. Si se normalizara al revés, la pista se quedaría
                // a la derecha de la ventana y se vería una cinta vacía.
                x = x % anchoVuelta;
                if (x > 0) x -= anchoVuelta;
            }
        }

        function paso(ahora) {
            if (!anterior) anterior = ahora;

            // Se limita el salto para que al volver de otra pestaña
            // la cinta no dé un tirón de varios píxeles de golpe
            const dt = Math.min((ahora - anterior) / 1000, 0.05);
            anterior = ahora;

            x -= MARQUEE_VELOCIDAD * dt;

            // Una vuelta entera ha salido por la izquierda: se recupera.
            // El contenido es idéntico, así que no se nota el reinicio.
            if (x <= -anchoVuelta) x += anchoVuelta;

            pista.style.transform = 'translate3d(' + x.toFixed(2) + 'px, 0, 0)';
            raf = requestAnimationFrame(paso);
        }

        function arrancar() {
            if (raf || !visible || !anchoVuelta) return;
            anterior = 0;
            raf = requestAnimationFrame(paso);
        }

        function detener() {
            if (!raf) return;
            cancelAnimationFrame(raf);
            raf = 0;
        }

        /* No se gasta CPU con la cinta fuera de pantalla o en segundo plano */
        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entradas) => {
                visible = entradas[0].isIntersecting;
                visible ? arrancar() : detener();
            }, { threshold: 0 }).observe(cinta);
        }

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) detener();
            else arrancar();
        });

        let anchoVentana = window.innerWidth;
        window.addEventListener('resize', () => {
            if (window.innerWidth === anchoVentana) return;   // solo altura
            anchoVentana = window.innerWidth;
            medir();
        }, { passive: true });

        medir();

        // Las fuentes web cambian el ancho del texto: se vuelve a medir
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(medir);
        }
        window.addEventListener('load', medir, { once: true });

        arrancar();
    }

    /* ===============================================================
       14. DESPLAZAMIENTO SUAVE DE LOS ENLACES INTERNOS
    =============================================================== */

    function initSmoothScroll() {
        $$('a[href^="#"]').forEach((link) => {
            link.addEventListener('click', (e) => {
                const id = link.getAttribute('href');
                if (!id || id === '#') return;

                const target = document.querySelector(id);
                if (!target) return;

                e.preventDefault();

                const top = target.getBoundingClientRect().top + scrollY
                    - (parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 68) - 16;

                scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
                history.replaceState(null, '', id);
            });
        });

        if (toTop) {
            toTop.addEventListener('click', () => {
                scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
            });
        }
    }

    /* ===============================================================
       15. AÑO EN EL PIE
    =============================================================== */

    function initYear() {
        $$('[data-year]').forEach((el) => {
            el.textContent = String(new Date().getFullYear());
        });
    }

    /* ===============================================================
       ARRANQUE
    =============================================================== */

    function init() {
        timelineEl = $('[data-timeline]');

        initTheme();
        initSplitText();
        initCursorGlow();
        initSpotlight();
        initMagnetic();
        initTilt();
        initButtons();
        initMarquee();
        initReveal();
        initHeroIntro();
        initCounters();
        initSmoothScroll();
        initScrollChrome();
        initYear();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
