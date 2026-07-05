import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   Ukelele Fácil v2 — plan de 15 min/día
   Nuevo: Reto de cambios por minuto (CPM) + Niveles con puertas
   medibles + progreso guardado.
   ============================================================ */

// ---- Paleta ----
const T = {
  bg: "#FBF6EE", card: "#FFFFFF", ink: "#33271C", inkSoft: "#8A7C6C",
  wood: "#B5763A", woodDark: "#8A5526", coral: "#FF6B4A", coralDark: "#E8482A",
  ocean: "#1F9E8F", sand: "#F3E7D3", line: "#EBDFCB", gold: "#E8A93C",
};
const FONT_DISPLAY = "'Fredoka', ui-rounded, 'Segoe UI', system-ui, sans-serif";
const FONT_BODY = "'Nunito', ui-rounded, system-ui, sans-serif";

// ---- Notas (afinación reentrante G-C-E-A) ----
const OPEN = { G: 392.0, C: 261.63, E: 329.63, A: 440.0 };
const STRING_ORDER = ["G", "C", "E", "A"];
const freq = (open, fret) => open * Math.pow(2, fret / 12);

// ---- Acordes ----
const CHORDS = {
  C: { es: "Do", frets: [0, 0, 0, 3], dedos: [0, 0, 0, 3], nota: "El más fácil: un solo dedo." },
  Am: { es: "La menor", frets: [2, 0, 0, 0], dedos: [2, 0, 0, 0], nota: "También un dedo." },
  F: { es: "Fa", frets: [2, 0, 1, 0], dedos: [2, 0, 1, 0], nota: "Dos dedos." },
  G7: { es: "Sol séptima", frets: [0, 2, 1, 2], dedos: [0, 2, 1, 3], nota: "Tres dedos en triángulo." },
  G: { es: "Sol", frets: [0, 2, 3, 2], dedos: [0, 1, 3, 2], nota: "Para más adelante." },
  Em: { es: "Mi menor", frets: [0, 4, 3, 2], dedos: [0, 3, 2, 1], nota: "Una escalerita." },
  D: { es: "Re", frets: [2, 2, 2, 0], dedos: [1, 2, 3, 0], nota: "Tres dedos en fila." },
};
const CORE = ["C", "Am", "F", "G7"];
const MAS = ["G", "Em", "D"];
const PAIRS = [["C", "Am"], ["C", "F"], ["F", "G7"], ["Am", "G7"]];

// ---- Audio ----
let AC = null;
function getCtx() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === "suspended") AC.resume();
  return AC;
}
function pluck(ctx, f, t, dur = 1.6, vol = 0.22) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o.type = "triangle"; o2.type = "sine";
  o.frequency.value = f; o2.frequency.value = f * 2;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); o2.connect(g); g.connect(ctx.destination);
  o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
}
function strumChord(chordKey, up = false, vol = 0.18) {
  const ctx = getCtx(), c = CHORDS[chordKey];
  const order = up ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const now = ctx.currentTime;
  order.forEach((idx, i) => pluck(ctx, freq(OPEN[STRING_ORDER[idx]], c.frets[idx]), now + i * 0.022, 1.5, vol));
}
function click(ctx, t, accent = false) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "square"; o.frequency.value = accent ? 1500 : 1000;
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(accent ? 0.12 : 0.07, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + 0.06);
}

// ---- Progreso persistente (localStorage en la PWA) ----
const DEFAULT_PROGRESS = { bestCpm: {}, levels: {}, history: [] };
let memProgress = { ...DEFAULT_PROGRESS };
async function loadProgress() {
  try {
    const raw = localStorage.getItem("uke-progress");
    if (raw) return JSON.parse(raw);
  } catch (e) { /* sin storage: seguimos en memoria */ }
  return memProgress;
}
async function saveProgress(p) {
  memProgress = p;
  try {
    localStorage.setItem("uke-progress", JSON.stringify(p));
  } catch (e) { /* seguimos en memoria */ }
}

// =================== UI helpers ===================
function Pill({ active, onClick, emoji, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: FONT_DISPLAY, fontWeight: 600,
        color: active ? "#fff" : T.ink,
        background: active ? T.coral : T.card,
        border: `2px solid ${active ? T.coral : T.line}`,
        boxShadow: active ? "0 5px 12px rgba(255,107,74,.28)" : "none",
        minWidth: 0,
      }}
      className="px-1 py-2 rounded-2xl transition-all flex-1"
    >
      <span className="block" style={{ fontSize: 17 }}>{emoji}</span>
      <span style={{ fontSize: 10.5 }}>{label}</span>
    </button>
  );
}

// =================== Afinador (micrófono + tonos de referencia) ===================
// Detección de pitch por autocorrelación (ACF2+)
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return -1; // demasiado silencio

  // recorta bordes silenciosos
  let r1 = 0, r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  const b = buf.slice(r1, r2);
  const N = b.length;
  if (N < 64) return -1;

  const c = new Array(N).fill(0);
  for (let lag = 0; lag < N; lag++)
    for (let i = 0; i < N - lag; i++) c[lag] += b[i] * b[i + lag];

  let d = 0;
  while (d < N - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < N; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  if (maxpos <= 0) return -1;

  // interpolación parabólica
  let T0 = maxpos;
  const x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2, bq = (x3 - x1) / 2;
  if (a) T0 = T0 - bq / (2 * a);
  const f = sampleRate / T0;
  if (f < 60 || f > 1200) return -1;
  return f;
}

function Afinador() {
  const [last, setLast] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [micErr, setMicErr] = useState(null);
  const [reading, setReading] = useState(null); // {string, cents, freq}
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const analyserRef = useRef(null);
  const centsSmooth = useRef(null);
  const lastHeard = useRef(0);

  const play = (s) => {
    pluck(getCtx(), OPEN[s], getCtx().currentTime, 2.4, 0.28);
    setLast(s);
    setTimeout(() => setLast((p) => (p === s ? null : p)), 1400);
  };

  const stopMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    centsSmooth.current = null;
    setMicOn(false);
    setReading(null);
  }, []);

  const startMic = async () => {
    setMicErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const ctx = getCtx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      setMicOn(true);

      const buf = new Float32Array(analyser.fftSize);
      const loop = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        const f = autoCorrelate(buf, ctx.sampleRate);
        const now = performance.now();
        if (f > 0) {
          lastHeard.current = now;
          // cuerda más cercana (compara también en octava para robustez con armónicos)
          let bestS = null, bestAbs = Infinity, bestCents = 0;
          STRING_ORDER.forEach((s) => {
            [f, f / 2, f * 2].forEach((ff) => {
              const cents = 1200 * Math.log2(ff / OPEN[s]);
              if (Math.abs(cents) < bestAbs) { bestAbs = Math.abs(cents); bestS = s; bestCents = cents; }
            });
          });
          if (bestAbs <= 120) {
            const sm = centsSmooth.current == null ? bestCents : centsSmooth.current * 0.6 + bestCents * 0.4;
            centsSmooth.current = sm;
            setReading({ string: bestS, cents: sm, freq: f });
          }
        } else if (now - lastHeard.current > 900) {
          centsSmooth.current = null;
          setReading(null);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      setMicErr("No pude acceder al micrófono. Da permiso en el navegador y prueba de nuevo.");
      setMicOn(false);
    }
  };

  useEffect(() => () => stopMic(), [stopMic]);

  const inTune = reading && Math.abs(reading.cents) < 6;
  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const needleX = 150 + (cents / 50) * 120;

  return (
    <div>
      <p style={{ color: T.inkSoft }} className="mb-4 leading-relaxed">
        Activa el micro, toca <b style={{ color: T.ink }}>una cuerda al aire</b> y sigue la aguja: al centro y en verde,
        afinada. La cuerda <b>G</b> suena aguda, no grave.
      </p>

      {/* ---- Afinador de micrófono ---- */}
      <div style={{ background: T.sand, border: `2px solid ${inTune ? T.ocean : T.line}` }} className="rounded-3xl p-4 mb-4 transition-all">
        {!micOn ? (
          <div className="text-center py-2">
            <button onClick={startMic}
              style={{ background: T.coral, fontFamily: FONT_DISPLAY, boxShadow: "0 8px 18px rgba(255,107,74,.3)" }}
              className="text-white font-bold rounded-2xl px-7 py-3 text-lg active:scale-95 transition-transform">
              🎤 Activar afinador con micro
            </button>
            {micErr && <div style={{ color: T.coralDark, fontSize: 13, marginTop: 10 }}>{micErr}</div>}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600, color: T.ocean }}>● Escuchando…</div>
              <button onClick={stopMic}
                style={{ fontSize: 12, color: T.inkSoft, border: `1.5px solid ${T.line}`, background: "#fff" }}
                className="rounded-xl px-3 py-1">
                Apagar
              </button>
            </div>

            <div className="text-center" style={{ minHeight: 64 }}>
              {reading ? (
                <>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 52, fontWeight: 700, lineHeight: 1, color: inTune ? T.ocean : T.ink }}>
                    {reading.string}
                  </span>
                  <span style={{ fontSize: 14, color: T.inkSoft, marginLeft: 8 }}>{reading.freq.toFixed(1)} Hz</span>
                </>
              ) : (
                <div style={{ fontSize: 15, color: T.inkSoft, paddingTop: 18 }}>Toca una cuerda al aire…</div>
              )}
            </div>

            {/* aguja */}
            <svg width="100%" viewBox="0 0 300 74" style={{ display: "block" }}>
              <rect x="30" y="34" width="240" height="8" rx="4" fill="#fff" stroke={T.line} strokeWidth="1.5" />
              <rect x="138" y="30" width="24" height="16" rx="6" fill={inTune ? T.ocean : "#E7DBC6"} opacity="0.55" />
              {[-50, -25, 0, 25, 50].map((v) => (
                <g key={v}>
                  <line x1={150 + (v / 50) * 120} y1="46" x2={150 + (v / 50) * 120} y2="52" stroke={T.inkSoft} strokeWidth="1.2" />
                  <text x={150 + (v / 50) * 120} y="64" textAnchor="middle" fontSize="9" fill={T.inkSoft}>{v > 0 ? "+" + v : v}</text>
                </g>
              ))}
              <line x1="150" y1="26" x2="150" y2="50" stroke={T.inkSoft} strokeWidth="1.2" strokeDasharray="2 2" />
              {reading && (
                <g style={{ transition: "transform .12s linear", transform: `translateX(${needleX - 150}px)` }}>
                  <line x1="150" y1="18" x2="150" y2="56" stroke={inTune ? T.ocean : T.coral} strokeWidth="4" strokeLinecap="round" />
                  <circle cx="150" cy="14" r="5" fill={inTune ? T.ocean : T.coral} />
                </g>
              )}
            </svg>

            <div className="text-center" style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: inTune ? T.ocean : T.ink, minHeight: 24 }}>
              {reading ? (inTune ? "✓ ¡Afinada!" : reading.cents < 0 ? "▲ Aprieta la clavija (sube)" : "▼ Afloja la clavija (baja)") : ""}
            </div>
          </div>
        )}
      </div>

      {/* ---- Tonos de referencia ---- */}
      <div className="mb-2" style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, color: T.inkSoft, fontSize: 14 }}>
        O afina de oído con los tonos de referencia
      </div>
      <div className="flex gap-3">
        {STRING_ORDER.map((s, i) => (
          <button key={s} onClick={() => play(s)}
            style={{
              background: last === s ? T.ocean : T.sand,
              color: last === s ? "#fff" : T.woodDark,
              border: `2px solid ${last === s ? T.ocean : T.line}`,
              fontFamily: FONT_DISPLAY,
              transform: last === s ? "translateY(-4px)" : "none",
              boxShadow: last === s ? "0 8px 18px rgba(31,158,143,.3)" : "none",
            }}
            className="flex-1 rounded-3xl py-5 transition-all">
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{s}</div>
            <div style={{ fontSize: 11, marginTop: 5, opacity: 0.85 }}>{["sol", "do", "mi", "la"][i]}</div>
          </button>
        ))}
      </div>
      <div style={{ background: T.sand, color: T.woodDark }} className="mt-4 rounded-2xl px-4 py-3 text-sm">
        💡 Si usas el micro y los tonos a la vez, el afinador puede "oír" el altavoz: afina en silencio.
      </div>
    </div>
  );
}

// =================== Diagrama de acorde ===================
function ChordDiagram({ chordKey, big }) {
  const c = CHORDS[chordKey];
  const W = big ? 150 : 96, H = big ? 175 : 112;
  const padX = W * 0.16, padTop = H * 0.16, padBot = H * 0.1;
  const colGap = (W - padX * 2) / 3, rowGap = (H - padTop - padBot) / 4;
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <rect x={padX - 2} y={padTop - 6} width={colGap * 3 + 4} height={5} rx={2} fill={T.woodDark} />
      {Array.from({ length: 4 }).map((_, r) => (
        <line key={r} x1={padX} y1={padTop + rowGap * (r + 1)} x2={padX + colGap * 3} y2={padTop + rowGap * (r + 1)} stroke={T.line} strokeWidth={2} />
      ))}
      {STRING_ORDER.map((s, i) => (
        <line key={s} x1={padX + colGap * i} y1={padTop} x2={padX + colGap * i} y2={H - padBot} stroke={T.wood} strokeWidth={1.5} />
      ))}
      {STRING_ORDER.map((s, i) => (
        <text key={s} x={padX + colGap * i} y={H - 2} textAnchor="middle" fontSize={big ? 12 : 9} fill={T.inkSoft} fontFamily={FONT_BODY} fontWeight="700">{s}</text>
      ))}
      {c.frets.map((fr, i) => {
        const x = padX + colGap * i;
        if (fr === 0) return <circle key={i} cx={x} cy={padTop - 12} r={big ? 5 : 3.5} fill="none" stroke={T.inkSoft} strokeWidth={1.5} />;
        const y = padTop + rowGap * (fr - 0.5);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={big ? 11 : 7} fill={T.coral} />
            <text x={x} y={y + (big ? 4 : 3)} textAnchor="middle" fontSize={big ? 13 : 9} fill="#fff" fontFamily={FONT_DISPLAY} fontWeight="700">{c.dedos[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

// =================== Acordes ===================
function Acordes() {
  const [sel, setSel] = useState("C");
  const c = CHORDS[sel];
  return (
    <div>
      <p style={{ color: T.inkSoft }} className="mb-4 leading-relaxed">
        Toca un acorde para verlo y <b style={{ color: T.ink }}>escucharlo</b>. Los números son qué dedo usar
        (1 índice · 2 corazón · 3 anular · 4 meñique).
      </p>
      <div className="flex flex-col items-center gap-3 mb-5">
        <div style={{ background: T.sand, border: `2px solid ${T.line}` }} className="rounded-3xl px-6 py-4 flex items-center gap-5">
          <ChordDiagram chordKey={sel} big />
          <div style={{ minWidth: 90 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 700, color: T.ink, lineHeight: 1 }}>{sel}</div>
            <div style={{ color: T.woodDark, fontWeight: 700 }}>{c.es}</div>
            <div style={{ color: T.inkSoft, fontSize: 13, marginTop: 6 }}>{c.nota}</div>
          </div>
        </div>
        <button onClick={() => strumChord(sel)}
          style={{ background: T.ocean, fontFamily: FONT_DISPLAY, boxShadow: "0 8px 18px rgba(31,158,143,.3)" }}
          className="text-white font-bold rounded-2xl px-8 py-3 text-lg active:scale-95 transition-transform">
          ▶ Sonar acorde
        </button>
      </div>
      <div className="mb-2" style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, color: T.ink }}>
        Los 4 acordes que lo desbloquean casi todo
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {CORE.map((k) => <ChordCard key={k} k={k} sel={sel} onClick={() => setSel(k)} />)}
      </div>
      <div className="mb-2" style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, color: T.inkSoft, fontSize: 14 }}>
        Cuando domines los de arriba
      </div>
      <div className="grid grid-cols-4 gap-2">
        {MAS.map((k) => <ChordCard key={k} k={k} sel={sel} onClick={() => setSel(k)} />)}
      </div>
    </div>
  );
}
function ChordCard({ k, sel, onClick }) {
  const active = sel === k;
  return (
    <button onClick={onClick}
      style={{
        background: active ? "#fff" : T.card,
        border: `2px solid ${active ? T.coral : T.line}`,
        boxShadow: active ? "0 6px 14px rgba(255,107,74,.22)" : "none",
      }}
      className="rounded-2xl p-2 flex flex-col items-center transition-all">
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, color: T.ink }}>{k}</div>
      <ChordDiagram chordKey={k} />
    </button>
  );
}

// =================== Rasgueo + metrónomo ===================
const PATTERN = ["D", null, "D", "U", null, "U", "D", "U"];
function Rasgueo() {
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(70);
  const [step, setStep] = useState(-1);
  const [withChord, setWithChord] = useState(true);
  const stepRef = useRef(0);
  const timer = useRef(null);

  const doTick = useCallback(() => {
    const i = stepRef.current % 8;
    setStep(i);
    const ctx = getCtx();
    const slot = PATTERN[i];
    if (slot) {
      if (withChord) strumChord("C", slot === "U", 0.16);
      else click(ctx, ctx.currentTime, i === 0);
    } else click(ctx, ctx.currentTime, false);
    stepRef.current += 1;
  }, [withChord]);

  const stop = useCallback(() => {
    clearInterval(timer.current);
    setPlaying(false); setStep(-1);
  }, []);

  const start = () => {
    getCtx(); stepRef.current = 0; setPlaying(true);
    doTick();
    timer.current = setInterval(doTick, 60000 / (bpm * 2));
  };

  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => {
    if (playing) {
      clearInterval(timer.current);
      timer.current = setInterval(doTick, 60000 / (bpm * 2));
    }
  }, [bpm, doTick, playing]);

  return (
    <div>
      <p style={{ color: T.inkSoft }} className="mb-4 leading-relaxed">
        El patrón rey: <b style={{ color: T.ink }}>Abajo – Abajo Arriba – Arriba Abajo Arriba</b>. Mueve desde la muñeca. Empieza lento.
      </p>
      <div className="flex justify-center gap-2 mb-5">
        {PATTERN.map((slot, i) => {
          const on = step === i, isBeat = i % 2 === 0;
          return (
            <div key={i} className="flex flex-col items-center" style={{ width: 34 }}>
              <div style={{ fontSize: 10, color: T.inkSoft, fontWeight: 700, marginBottom: 4 }}>{isBeat ? i / 2 + 1 : "·"}</div>
              <div style={{
                width: 34, height: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 700, fontFamily: FONT_DISPLAY,
                color: slot ? (on ? "#fff" : T.ink) : T.line,
                background: slot ? (on ? T.coral : T.sand) : "transparent",
                border: `2px solid ${on ? T.coral : slot ? T.line : "transparent"}`,
                transform: on ? "translateY(-4px) scale(1.08)" : "none",
                transition: "all .08s",
              }}>
                {slot === "D" ? "↓" : slot === "U" ? "↑" : "·"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={playing ? stop : start}
          style={{ background: playing ? T.coralDark : T.coral, fontFamily: FONT_DISPLAY, boxShadow: "0 8px 18px rgba(255,107,74,.3)" }}
          className="text-white font-bold rounded-2xl px-6 py-3 text-lg active:scale-95 transition-transform">
          {playing ? "■ Parar" : "▶ Empezar"}
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-sm" style={{ color: T.inkSoft }}>
            <span>Velocidad</span>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, color: T.ink }}>{bpm} BPM</span>
          </div>
          <input type="range" min="50" max="120" value={bpm} onChange={(e) => setBpm(+e.target.value)} style={{ width: "100%", accentColor: T.coral }} />
        </div>
      </div>
      <label style={{ background: T.sand, color: T.woodDark }} className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm cursor-pointer">
        <input type="checkbox" checked={withChord} onChange={(e) => setWithChord(e.target.checked)} style={{ accentColor: T.ocean, width: 18, height: 18 }} />
        Sonar con acorde de Do (en vez de solo clic)
      </label>
    </div>
  );
}

// =================== RETO: cambios por minuto ===================
function Reto({ progress, onSave }) {
  const [pairIdx, setPairIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(60);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState(null);
  const tick = useRef(null);
  const pair = PAIRS[pairIdx];
  const key = pair.join("-");
  const best = progress.bestCpm[key] || 0;

  const finish = useCallback((finalCount) => {
    clearInterval(tick.current);
    setRunning(false);
    setResult(finalCount);
    click(getCtx(), getCtx().currentTime, true);
    const p = { ...progress, bestCpm: { ...progress.bestCpm } };
    if (finalCount > (p.bestCpm[key] || 0)) p.bestCpm[key] = finalCount;
    p.history = [...(p.history || []), { key, cpm: finalCount, date: new Date().toISOString().slice(0, 10) }].slice(-50);
    onSave(p);
  }, [progress, key, onSave]);

  const countRef = useRef(0);
  const start = () => {
    getCtx();
    setResult(null); setCount(0); countRef.current = 0; setLeft(60); setRunning(true);
    tick.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) { finish(countRef.current); return 0; }
        return l - 1;
      });
    }, 1000);
  };
  useEffect(() => () => clearInterval(tick.current), []);

  const tap = () => {
    if (!running) return;
    countRef.current += 1;
    setCount(countRef.current);
    strumChord(countRef.current % 2 === 0 ? pair[0] : pair[1], false, 0.1);
  };

  return (
    <div>
      <p style={{ color: T.inkSoft }} className="mb-4 leading-relaxed">
        Tu métrica de progreso real: <b style={{ color: T.ink }}>cambios por minuto (CPM)</b>. Cambia entre los dos
        acordes y pulsa el botón grande <b>cada vez que el cambio suene limpio</b>. Meta para Nivel 2: <b>20+ CPM</b>.
      </p>

      <div className="flex gap-2 mb-4">
        {PAIRS.map((p, i) => (
          <button key={i} onClick={() => { if (!running) { setPairIdx(i); setResult(null); } }}
            style={{
              fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14,
              color: pairIdx === i ? "#fff" : T.ink,
              background: pairIdx === i ? T.ocean : T.card,
              border: `2px solid ${pairIdx === i ? T.ocean : T.line}`,
              opacity: running && pairIdx !== i ? 0.4 : 1,
            }}
            className="flex-1 rounded-2xl py-2 transition-all">
            {p[0]}↔{p[1]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <div style={{ fontSize: 12, color: T.inkSoft }}>Tiempo</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 700, color: left <= 10 && running ? T.coralDark : T.ink }}>
            {String(Math.floor(left / 60)).padStart(1, "0")}:{String(left % 60).padStart(2, "0")}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: T.inkSoft }}>Cambios</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 700, color: T.coral }}>{count}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: T.inkSoft }}>Récord {pair[0]}↔{pair[1]}</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 700, color: T.gold }}>{best}</div>
        </div>
      </div>

      {running ? (
        <button onClick={tap}
          style={{
            background: `linear-gradient(135deg, ${T.coral}, ${T.coralDark})`,
            fontFamily: FONT_DISPLAY, boxShadow: "0 10px 24px rgba(255,107,74,.4)", width: "100%",
          }}
          className="text-white font-bold rounded-3xl py-10 text-2xl active:scale-95 transition-transform">
          ✓ ¡Cambio limpio!
        </button>
      ) : (
        <button onClick={start}
          style={{ background: T.ocean, fontFamily: FONT_DISPLAY, boxShadow: "0 8px 18px rgba(31,158,143,.3)", width: "100%" }}
          className="text-white font-bold rounded-3xl py-6 text-xl active:scale-95 transition-transform">
          ▶ Empezar reto de 60 s
        </button>
      )}

      {result !== null && (
        <div style={{ background: T.sand, border: `2px solid ${result >= 20 ? T.ocean : T.line}` }} className="mt-4 rounded-2xl px-4 py-3 text-center">
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: result >= 20 ? T.ocean : T.ink }}>
            {result} CPM {result >= 20 ? "· ¡Puerta de Nivel 2 superada! 🎉" : result > 0 && result >= best ? "· ¡Nuevo récord! 🔥" : ""}
          </div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
            {result >= 20 ? "Prueba ahora otra pareja de acordes." : "Sigue así: la meta son 20+. Lento y limpio gana a rápido y sucio."}
          </div>
        </div>
      )}

      <div style={{ background: T.card, border: `2px solid ${T.line}`, color: T.inkSoft, fontSize: 13 }} className="mt-4 rounded-2xl px-4 py-3">
        Cuenta solo los cambios donde <b style={{ color: T.ink }}>las 4 cuerdas suenan</b> sin trastear. Sé honesto: la métrica es para ti.
      </div>
    </div>
  );
}

// =================== Rutina 15 min ===================
const PHASES = [
  { n: "Afinar", s: 60, c: "#1F9E8F" },
  { n: "Cambios de 2 acordes", s: 180, c: "#FF6B4A" },
  { n: "Rasgueo con metrónomo", s: 180, c: "#B5763A" },
  { n: "Una canción entera", s: 300, c: "#1F9E8F" },
  { n: "Cantar mientras tocas", s: 180, c: "#E8A93C", opt: true },
];
function Rutina() {
  const [withSinging, setWithSinging] = useState(true);
  const phases = withSinging ? PHASES : PHASES.filter((p) => !p.opt);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(phases[0].s);
  const [run, setRun] = useState(false);
  const tick = useRef(null);

  useEffect(() => {
    if (run) {
      tick.current = setInterval(() => {
        setLeft((l) => {
          if (l <= 1) {
            click(getCtx(), getCtx().currentTime, true);
            setIdx((i) => {
              const next = i + 1;
              if (next >= phases.length) { setRun(false); return i; }
              setLeft(phases[next].s);
              return next;
            });
            return 0;
          }
          return l - 1;
        });
      }, 1000);
    }
    return () => clearInterval(tick.current);
  }, [run, phases.length]);

  const reset = () => { setRun(false); setIdx(0); setLeft(phases[0].s); };
  useEffect(() => { reset(); /* eslint-disable-next-line */ }, [withSinging]);

  const ph = phases[idx];
  const done = idx === phases.length - 1 && left === 0 && !run;
  const pct = ph.s > 0 ? (left / ph.s) * 100 : 0;
  const R = 70, circ = 2 * Math.PI * R;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const totalMin = phases.reduce((a, p) => a + p.s, 0) / 60;

  return (
    <div>
      <p style={{ color: T.inkSoft }} className="mb-3 leading-relaxed">
        <b style={{ color: T.ink }}>{totalMin} min al día.</b> Corto y diario gana a largo y esporádico: tus yemas y tu
        agenda lo agradecerán. En ~11 semanas habrás sumado tus 20 horas.
      </p>

      <label style={{ background: T.sand, color: T.woodDark }} className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm cursor-pointer mb-4">
        <input type="checkbox" checked={withSinging} onChange={(e) => setWithSinging(e.target.checked)} style={{ accentColor: T.gold, width: 18, height: 18 }} />
        Incluir fase de cantar (actívala desde la semana 2)
      </label>

      <div className="flex justify-center mb-4">
        <div style={{ position: "relative", width: 180, height: 180 }}>
          <svg width="180" height="180">
            <circle cx="90" cy="90" r={R} fill="none" stroke={T.sand} strokeWidth="14" />
            <circle cx="90" cy="90" r={R} fill="none" stroke={done ? T.ocean : ph.c} strokeWidth="14"
              strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
              transform="rotate(-90 90 90)" style={{ transition: "stroke-dashoffset 1s linear" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {done ? (
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: T.ocean }}>¡Hecho! 🎉</div>
            ) : (
              <>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 700, color: T.ink, lineHeight: 1 }}>{mm}:{ss}</div>
                <div style={{ color: T.inkSoft, fontSize: 12, marginTop: 4, textAlign: "center", maxWidth: 110 }}>{ph.n}</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-3 mb-5 justify-center">
        <button onClick={() => { getCtx(); setRun((r) => !r); }} disabled={done}
          style={{
            background: done ? T.line : run ? T.coralDark : T.coral,
            fontFamily: FONT_DISPLAY, boxShadow: done ? "none" : "0 8px 18px rgba(255,107,74,.3)",
          }}
          className="text-white font-bold rounded-2xl px-7 py-3 text-lg active:scale-95 transition-transform">
          {run ? "⏸ Pausa" : "▶ Empezar"}
        </button>
        <button onClick={reset}
          style={{ background: T.card, color: T.ink, border: `2px solid ${T.line}`, fontFamily: FONT_DISPLAY }}
          className="font-bold rounded-2xl px-5 py-3">
          ↺ Reiniciar
        </button>
      </div>

      <div className="space-y-2">
        {phases.map((p, i) => (
          <div key={i}
            style={{
              background: i === idx ? T.sand : "transparent",
              border: `2px solid ${i === idx ? p.c : T.line}`,
              opacity: i < idx ? 0.5 : 1,
            }}
            className="rounded-2xl px-4 py-2 flex items-center justify-between">
            <span style={{ color: T.ink, fontWeight: 700 }}>{i < idx ? "✓ " : ""}{p.n}</span>
            <span style={{ color: T.inkSoft, fontSize: 14 }}>{p.s / 60} min</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =================== Niveles con puertas medibles ===================
const LEVELS = [
  {
    id: "n1", n: "N1 · Superviviente", meta: "1 acorde nítido",
    gate: "C suena limpio 5 veces seguidas (las 4 cuerdas, sin zumbidos).",
    auto: null,
  },
  {
    id: "n2", n: "N2 · Cuatro acordes", meta: "1 canción lenta entera",
    gate: "20+ CPM en el Reto y patrón completo a 70 BPM sin parar.",
    auto: (p) => Object.values(p.bestCpm || {}).some((v) => v >= 20),
  },
  {
    id: "n3", n: "N3 · Cancionero", meta: "Cantar y tocar a la vez",
    gate: "1 canción entera cantando, sin parar aunque falles.",
    auto: null,
  },
  {
    id: "n4", n: "N4 · Ritmo y dinámica", meta: "Que suene con groove",
    gate: "3 canciones de memoria y 2 patrones de ritmo distintos.",
    auto: null,
  },
  {
    id: "n5", n: "N5 · Intérprete", meta: "Tocar para alguien",
    gate: "Toca una canción delante de alguien (Irene cuenta 🙂).",
    auto: null,
  },
];
function Niveles({ progress, onSave }) {
  const toggle = (id) => {
    const p = { ...progress, levels: { ...progress.levels, [id]: !progress.levels[id] } };
    onSave(p);
  };
  let unlocked = true;
  return (
    <div>
      <p style={{ color: T.inkSoft }} className="mb-4 leading-relaxed">
        Cada nivel tiene una <b style={{ color: T.ink }}>puerta medible</b>. Nada de "más o menos me sale": o pasas la
        puerta o sigues practicando. El N2 se desbloquea solo con el Reto.
      </p>
      <div className="space-y-3">
        {LEVELS.map((lv, i) => {
          const autoDone = lv.auto ? lv.auto(progress) : false;
          const done = !!progress.levels[lv.id] || autoDone;
          const isCurrent = unlocked && !done;
          const locked = !unlocked;
          if (!done) unlocked = false;
          return (
            <div key={lv.id}
              style={{
                background: done ? "#F0F7F0" : isCurrent ? T.sand : T.card,
                border: `2px solid ${done ? T.ocean : isCurrent ? T.coral : T.line}`,
                opacity: locked ? 0.55 : 1,
              }}
              className="rounded-2xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, color: done ? T.ocean : T.ink }}>
                  {done ? "✓ " : locked ? "🔒 " : "▸ "}{lv.n}
                </div>
                <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em" }}>{lv.meta}</div>
              </div>
              <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 4 }}>{lv.gate}</div>
              {!locked && !autoDone && (
                <button onClick={() => toggle(lv.id)}
                  style={{
                    fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, marginTop: 8,
                    background: done ? "transparent" : T.coral,
                    color: done ? T.inkSoft : "#fff",
                    border: done ? `2px solid ${T.line}` : "none",
                  }}
                  className="rounded-xl px-4 py-1.5">
                  {done ? "Desmarcar" : "He pasado la puerta ✓"}
                </button>
              )}
              {autoDone && (
                <div style={{ fontSize: 12, color: T.ocean, fontWeight: 700, marginTop: 6 }}>
                  Desbloqueado automáticamente con tu récord del Reto 🏆
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =================== App ===================
const TABS = [
  { id: "afinar", label: "Afinar", emoji: "🎵" },
  { id: "acordes", label: "Acordes", emoji: "🎸" },
  { id: "rasgueo", label: "Rasgueo", emoji: "👋" },
  { id: "reto", label: "Reto", emoji: "⚡" },
  { id: "rutina", label: "Rutina", emoji: "⏱️" },
  { id: "niveles", label: "Nivel", emoji: "🏆" },
];

export default function App() {
  const [tab, setTab] = useState("afinar");
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700&display=swap";
    document.head.appendChild(l);
    loadProgress().then(setProgress);
  }, []);

  const handleSave = (p) => { setProgress(p); saveProgress(p); };

  return (
    <div style={{ background: T.bg, fontFamily: FONT_BODY, minHeight: "100vh", color: T.ink }} className="w-full flex justify-center">
      <div className="w-full" style={{ maxWidth: 480, padding: "20px 16px 32px" }}>
        <div className="flex items-center gap-3 mb-1">
          <div style={{ background: `linear-gradient(135deg, ${T.wood}, ${T.woodDark})`, boxShadow: "0 6px 16px rgba(138,85,38,.35)" }}
            className="rounded-2xl flex items-center justify-center">
            <span style={{ fontSize: 30, padding: "6px 10px" }}>🪕</span>
          </div>
          <div>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 26, lineHeight: 1 }}>Ukelele Fácil</h1>
            <p style={{ color: T.inkSoft, fontSize: 13, marginTop: 2 }}>15 min al día · niveles con puertas medibles</p>
          </div>
        </div>

        <div className="flex gap-1.5 my-4">
          {TABS.map((t) => (
            <Pill key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} emoji={t.emoji} label={t.label} />
          ))}
        </div>

        <div style={{ background: T.card, border: `2px solid ${T.line}`, boxShadow: "0 10px 30px rgba(138,85,38,.08)" }} className="rounded-3xl p-5">
          {tab === "afinar" && <Afinador />}
          {tab === "acordes" && <Acordes />}
          {tab === "rasgueo" && <Rasgueo />}
          {tab === "reto" && <Reto progress={progress} onSave={handleSave} />}
          {tab === "rutina" && <Rutina />}
          {tab === "niveles" && <Niveles progress={progress} onSave={handleSave} />}
        </div>

        <p style={{ color: T.inkSoft, fontSize: 12, textAlign: "center", marginTop: 16 }}>
          Sube el volumen 🔊 · Lento y limpio gana a rápido y sucio.
        </p>
      </div>
    </div>
  );
}
