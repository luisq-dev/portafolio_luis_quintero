(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);

    const KEY = 'lq-sound';

    /* Volumen general. Sube o baja este número para ajustar el carácter:
       por debajo de 0.10 será casi imperceptible, 0.30 ya se nota bastante. */
    const VOLUME = 0.15;

    let ctx = null;
    let master = null;
    let enabled = true;

    try {
        const saved = localStorage.getItem(KEY);
        if (saved !== null) enabled = saved === 'on';
    } catch (e) { /* localStorage bloqueado */ }


    /* ---------------------------------------------------------------
       reverb: una respuesta de impulso de ruido con caída exponencial
       da esa sensación de "aire" sin cargar ningún archivo .wav
    --------------------------------------------------------------- */

    function impulse(seconds, decay) {
        const rate = ctx.sampleRate;
        const length = Math.max(1, Math.floor(rate * seconds));
        const buffer = ctx.createBuffer(2, length, rate);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        return buffer;
    }


    /* ---------------------------------------------------------------
       Arranque perezoso del contexto de audio
    --------------------------------------------------------------- */

    function init() {
        if (ctx) return true;

        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;

        ctx = new AC();

        master = ctx.createGain();
        master.gain.value = enabled ? VOLUME : 0;

        // Quita los agudos: evita que suene metálico o "de synthesizer"
        const soften = ctx.createBiquadFilter();
        soften.type = 'lowpass';
        soften.frequency.value = 3800;
        soften.Q.value = 0.5;

        // Evita picos incómodos si se encadenan varios sonidos
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.ratio.value = 6;

        const reverb = ctx.createConvolver();
        reverb.buffer = impulse(1.7, 2.8);

        const wet = ctx.createGain();
        wet.gain.value = 0.45;

        master.connect(soften);
        soften.connect(comp);
        comp.connect(ctx.destination);

        master.connect(wet);
        wet.connect(reverb);
        reverb.connect(comp);

        return true;
    }

    /* El navegador sólo permite audio tras una interacción del usuario */
    function prime() {
        if (!enabled) return;
        if (init() && ctx.state === 'suspended') ctx.resume();
    }

    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
        window.addEventListener(ev, prime, { once: true, passive: true });
    });

    /* Al pasar a segundo plano se suspende, pero con margen de gracia.

       Sin esta espera el sonido se cortaba a media nota al abrir otra
       pestaña y, al volver, ctx.resume() lo reanudaba desde el principio:
       se oía el mismo chasquido dos veces. Con la espera, el sonido
       termina solo y luego se suspende el contexto ya en silencio. */
    let hideTimer = 0;

    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;

        clearTimeout(hideTimer);

        if (document.hidden) {
            hideTimer = setTimeout(() => {
                if (document.hidden && ctx) ctx.suspend();
            }, 400);
        } else if (enabled) {
            ctx.resume();
        }
    });


    /* ---------------------------------------------------------------
       Un solo tono: la primitiva con la que se construyen todos los sonidos
    --------------------------------------------------------------- */

    function tone(opts) {
        if (!enabled) return;
        if (!init()) return;
        if (ctx.state === 'suspended') ctx.resume();

        const o = Object.assign({
            freq: 660,     // frecuencia inicial en Hz
            to: null,      // frecuencia final (barrido suave)
            type: 'sine',
            dur: 0.16,     // duración en segundos
            gain: 0.5,     // altura relativa
            attack: 0.008,
            delay: 0
        }, opts);

        const t0 = ctx.currentTime + o.delay;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();

        osc.type = o.type;
        osc.frequency.setValueAtTime(o.freq, t0);
        if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);

        // Envolvente: ataque casi instantáneo y caída exponencial
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(o.gain, t0 + o.attack);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

        osc.connect(env);
        env.connect(master);

        osc.start(t0);
        osc.stop(t0 + o.dur + 0.06);
    }


    /* ---------------------------------------------------------------
       Paleta de sonidos
    --------------------------------------------------------------- */

    const S = {
        /* Botón principal: pulsación corta y firme */
        tap() {
            tone({ freq: 760, to: 590, dur: 0.12, gain: 0.46 });
            tone({ freq: 1520, dur: 0.06, gain: 0.10, type: 'triangle' });
        },

        /* Enlaces con forma de botón: algo más suave que un tap */
        link() {
            tone({ freq: 880, to: 740, dur: 0.11, gain: 0.32 });
        },

        /* Conmutadores: acorde corto ascendente */
        theme() {
            tone({ freq: 523.25, dur: 0.30, gain: 0.34 });
            tone({ freq: 783.99, dur: 0.34, gain: 0.20, delay: 0.05 });
        },

        /* Volver arriba: barrido ascendente */
        up() {
            tone({ freq: 480, to: 1046, dur: 0.26, gain: 0.34 });
        }
    };


    /* ---------------------------------------------------------------
       Al pulsar

       Importante: el sonido sólo suena al PULSAR, nunca al pasar el
       cursor. El puntero se mueve solo por la pantalla, así que
       cualquier sonido ligado a "hover" se vuelve un ruido de fondo
       constante. Un clic siempre es una acción deliberada.
    --------------------------------------------------------------- */

    const CLICK_SEL = '.btn, .socials a, .contact__mail, .nav__link';

    /* Tiempo que se concede al sonido antes de abandonar la página */
    const LINK_DELAY = 220;

    let navigating = false;

    /* ¿Este enlace va a sustituir la página actual?

       Si se abre en pestaña nueva no hace falta esperar: esta página
       sigue viva y el sonido termina solo. */
    function needsDelay(a) {
        if (a.target === '_blank') return false;

        const href = a.getAttribute('href');
        if (!href || href === '#' || href.charAt(0) === '#') return false;

        try {
            return new URL(a.href, location.href).origin !== location.origin;
        } catch (e) {
            return true;   // mailto:, tel: ... no tienen origen
        }
    }

    document.addEventListener('click', (e) => {
        // Los conmutadores llevan su propio sonido más elaborado
        if (e.target.closest('.icon-toggle')) return;

        // Clic secundario o con modificadores: el usuario manda
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const target = e.target.closest(CLICK_SEL);
        if (!target) return;

        if (target.matches('.btn')) S.tap();
        else S.link();

        /* Enlaces que se van de esta página: se retrasa la salida para
           que el sonido no muera a media nota. */
        if (target.tagName === 'A' && needsDelay(target) && !navigating) {
            e.preventDefault();
            navigating = true;
            const destino = target.href;
            setTimeout(() => { window.location.href = destino; }, LINK_DELAY);
        }
    });


    /* ---------------------------------------------------------------
       Botones con sonido propio
    --------------------------------------------------------------- */

    const themeBtn = $('[data-theme-toggle]');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => S.theme());
    }

    const toTop = $('[data-to-top]');
    if (toTop) {
        toTop.addEventListener('click', () => S.up());
    }


    /* ---------------------------------------------------------------
       Botón de silencio
    --------------------------------------------------------------- */

    const soundBtn = $('[data-sound-toggle]');

    if (soundBtn) {
        const sync = () => {
            soundBtn.setAttribute('aria-pressed', String(enabled));
            soundBtn.setAttribute('aria-label',
                enabled ? 'Desactivar los sonidos' : 'Activar los sonidos');
            soundBtn.classList.toggle('is-off', !enabled);
            soundBtn.classList.toggle('is-on', enabled);
        };

        soundBtn.addEventListener('click', () => {
            enabled = !enabled;

            try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignorado */ }

            if (enabled) {
                if (init() && ctx.state === 'suspended') ctx.resume();
                if (master) master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.04);
                S.theme();
            } else if (master) {
                master.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
            }

            sync();
        });

        sync();
    }
})();
