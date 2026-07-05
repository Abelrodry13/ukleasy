import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   Ukelele Fácil — rediseño iOS
   Sistema: fondo #F5F5F7, superficies blancas, hairlines,
   un único acento (#0A84FF), tipografía del sistema,
   control segmentado y cabecera translúcida.
   La lógica (afinador, cromograma, rutina, niveles) no cambia.
   ============================================================ */

// ---- Tokens ----
const T = {
  bg: "var(--bg)",
  card: "var(--card)",
  ink: "var(--ink)",
  soft: "var(--soft)",
  hair: "var(--hair)",
  track: "var(--track)",
  fill: "var(--fill)",
  tint: "var(--tint)",
  tintSoft: "var(--tint-soft)",
  green: "var(--green)",
  greenSoft: "var(--green-soft)",
  red: "var(--red)",
  segActive: "var(--seg-active)",
  headerBg: "var(--header-bg)",
  faint: "var(--faint)",
  string: "var(--string)",
};
const FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', Roboto, sans-serif";

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

// ---- Progreso persistente ----
const DEFAULT_PROGRESS = { bestCpm: {}, levels: {}, history: [] };
let memProgress = { ...DEFAULT_PROGRESS };
async function loadProgress() {
  try {
    const raw = localStorage.getItem("uke-progress");
    if (raw) return JSON.parse(raw);
  } catch (e) { /* sin storage: memoria */ }
  return memProgress;
}
async function saveProgress(p) {
  memProgress = p;
  try { localStorage.setItem("uke-progress", JSON.stringify(p)); } catch (e) { /* memoria */ }
}

// ---- Iconos (trazo fino, 1.8px) ----
function Icon({ d, size = 17, color = "currentColor", filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"}
      stroke={filled ? "none" : color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "-3px" }}>
      <path d={d} />
    </svg>
  );
}
const IC = {
  mic: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M19 11a7 7 0 0 1-14 0 M12 18v3",
  play: "M8 5.5v13l11-6.5z",
  pause: "M8 5.5v13 M16 5.5v13",
  reset: "M4 10a8 8 0 1 1 2 6 M4 10V5 M4 10h5",
  shuffle: "M3 7h4l10 10h4 M17 3l4 4-4 4 M3 17h4 M14 7h3 M17 13l4 4-4 4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  lock: "M7 11V8a5 5 0 0 1 10 0v3 M6 11h12v9H6z",
  chev: "M9 6l6 6-6 6",
};

// ---- Componentes base ----
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 600, color: T.soft, textTransform: "uppercase",
      letterSpacing: "0.06em", margin: "0 4px 8px",
    }}>
      {children}
    </div>
  );
}
function Button({ children, onClick, kind = "tint", disabled, style, className = "" }) {
  const base = {
    tint: { background: T.tint, color: "#fff" },
    gray: { background: T.fill, color: T.ink },
    plain: { background: "transparent", color: T.tint },
  }[kind];
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        ...base, fontFamily: FONT, fontWeight: 600, fontSize: 16,
        borderRadius: 999, padding: "12px 22px", border: "none",
        opacity: disabled ? 0.4 : 1, transition: "transform .12s, opacity .2s",
        ...style,
      }}
      className={"active:scale-[0.97] " + className}>
      {children}
    </button>
  );
}

// =================== Afinador ===================
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return -1;

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
  const [reading, setReading] = useState(null);
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
      setMicErr("Sin acceso al micrófono. Concede el permiso en el navegador e inténtalo de nuevo.");
      setMicOn(false);
    }
  };

  useEffect(() => () => stopMic(), [stopMic]);

  const inTune = reading && Math.abs(reading.cents) < 6;
  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const needleX = 150 + (cents / 50) * 120;

  return (
    <div>
      <p style={{ color: T.soft, fontSize: 15, lineHeight: 1.5, margin: "0 4px 16px" }}>
        Activa el micrófono y toca una cuerda al aire. Aguja al centro y en verde: afinada.
        La cuerda G suena aguda, no grave.
      </p>

      <div style={{
        background: T.card, borderRadius: 20, border: `1px solid ${inTune ? T.green : T.hair}`,
        boxShadow: "var(--shadow-card)", padding: 18, marginBottom: 22, transition: "border-color .3s",
      }}>
        {!micOn ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <Button onClick={startMic}><Icon d={IC.mic} size={16} /> Activar afinador</Button>
            {micErr && <div style={{ color: T.red, fontSize: 13, marginTop: 12 }}>{micErr}</div>}
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tint, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: T.tint, display: "inline-block" }} />
                Escuchando
              </div>
              <button onClick={stopMic} style={{
                fontSize: 14, fontWeight: 600, color: T.tint, background: "transparent", border: "none", padding: 4,
              }}>
                Apagar
              </button>
            </div>

            <div style={{ textAlign: "center", minHeight: 66 }}>
              {reading ? (
                <>
                  <span style={{
                    fontSize: 56, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1,
                    color: inTune ? T.green : T.ink, transition: "color .2s",
                  }}>
                    {reading.string}
                  </span>
                  <span style={{ fontSize: 13, color: T.soft, marginLeft: 10 }}>{reading.freq.toFixed(1)} Hz</span>
                </>
              ) : (
                <div style={{ fontSize: 15, color: T.soft, paddingTop: 22 }}>Toca una cuerda al aire</div>
              )}
            </div>

            <div className="neu-inset" style={{ borderRadius: 16, padding: "6px 4px 0", margin: "8px 0 10px" }}>
            <svg width="100%" viewBox="0 0 300 70" style={{ display: "block" }}>
              <line x1="30" y1="38" x2="270" y2="38" stroke={T.track} strokeWidth="2" />
              <rect x="142" y="32" width="16" height="12" rx="4" fill={inTune ? T.greenSoft : T.fill} />
              {[-50, -25, 0, 25, 50].map((v) => (
                <g key={v}>
                  <line x1={150 + (v / 50) * 120} y1="42" x2={150 + (v / 50) * 120} y2="47" stroke={T.hair} strokeWidth="1.5" />
                  <text x={150 + (v / 50) * 120} y="60" textAnchor="middle" fontSize="9" fill={T.soft} fontFamily={FONT}>
                    {v > 0 ? "+" + v : v}
                  </text>
                </g>
              ))}
              <line x1="150" y1="26" x2="150" y2="44" stroke={T.hair} strokeWidth="1.5" />
              {reading && (
                <g style={{ transition: "transform .12s linear", transform: `translateX(${needleX - 150}px)` }}>
                  <line x1="150" y1="18" x2="150" y2="48" stroke={inTune ? T.green : T.tint} strokeWidth="3" strokeLinecap="round" />
                </g>
              )}
            </svg>
            </div>

            <div style={{
              textAlign: "center", fontWeight: 600, fontSize: 15, minHeight: 22,
              color: inTune ? T.green : T.ink,
            }}>
              {reading ? (inTune ? "Afinada" : reading.cents < 0 ? "Aprieta la clavija" : "Afloja la clavija") : ""}
            </div>
          </div>
        )}
      </div>

      <SectionLabel>Tonos de referencia</SectionLabel>
      <div style={{ display: "flex", gap: 10 }}>
        {STRING_ORDER.map((s, i) => (
          <button key={s} onClick={() => play(s)}
            style={{ flex: 1, borderRadius: 16, padding: "16px 0", transition: "all .2s", fontFamily: FONT }}
            className={"active:scale-[0.97] " + (last === s ? "neu-inset" : "neu")}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: last === s ? T.tint : T.ink, lineHeight: 1 }}>{s}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: T.soft }}>{["sol", "do", "mi", "la"][i]}</div>
          </button>
        ))}
      </div>
      <p style={{ fontSize: 13, color: T.soft, margin: "14px 4px 0", lineHeight: 1.5 }}>
        Si usas el micrófono, afina en silencio: los tonos del altavoz interfieren en la lectura.
      </p>
    </div>
  );
}

// =================== Diagrama de acorde ===================
function ChordDiagram({ chordKey, big, tint }) {
  const c = CHORDS[chordKey];
  const W = big ? 150 : 96, H = big ? 175 : 112;
  const padX = W * 0.16, padTop = H * 0.16, padBot = H * 0.1;
  const colGap = (W - padX * 2) / 3, rowGap = (H - padTop - padBot) / 4;
  const dot = tint || T.ink;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: big ? "clamp(110px, 36vw, 150px)" : "100%", maxWidth: W, height: "auto" }}>
      <rect x={padX - 2} y={padTop - 5} width={colGap * 3 + 4} height={4} rx={2} fill={T.ink} />
      {Array.from({ length: 4 }).map((_, r) => (
        <line key={r} x1={padX} y1={padTop + rowGap * (r + 1)} x2={padX + colGap * 3} y2={padTop + rowGap * (r + 1)} stroke={T.track} strokeWidth={1.5} />
      ))}
      {STRING_ORDER.map((s, i) => (
        <line key={s} x1={padX + colGap * i} y1={padTop} x2={padX + colGap * i} y2={H - padBot} stroke={T.string} strokeWidth={1.3} />
      ))}
      {STRING_ORDER.map((s, i) => (
        <text key={s} x={padX + colGap * i} y={H - 1} textAnchor="middle" fontSize={big ? 11 : 9} fill={T.soft} fontFamily={FONT} fontWeight="600">{s}</text>
      ))}
      {c.frets.map((fr, i) => {
        const x = padX + colGap * i;
        if (fr === 0) return <circle key={i} cx={x} cy={padTop - 11} r={big ? 4.5 : 3.2} fill="none" stroke={T.string} strokeWidth={1.5} />;
        const y = padTop + rowGap * (fr - 0.5);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={big ? 10.5 : 7} fill={dot} />
            <text x={x} y={y + (big ? 3.8 : 2.8)} textAnchor="middle" fontSize={big ? 12 : 8.5} fill={T.card} fontFamily={FONT} fontWeight="700">{c.dedos[i]}</text>
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
      <p style={{ color: T.soft, fontSize: 15, lineHeight: 1.5, margin: "0 4px 16px" }}>
        Toca un acorde para verlo y escucharlo. El número indica el dedo: 1 índice, 2 corazón, 3 anular, 4 meñique.
      </p>

      <div style={{
        background: T.card, borderRadius: 20, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", padding: 18, marginBottom: 14,
        display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 18,
      }}>
        <ChordDiagram chordKey={sel} big tint={T.tint} />
        <div style={{ minWidth: 120, flex: "1 1 120px", maxWidth: 200 }}>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", color: T.ink, lineHeight: 1 }}>{sel}</div>
          <div style={{ color: T.soft, fontWeight: 600, fontSize: 15, marginTop: 2 }}>{c.es}</div>
          <div style={{ color: T.soft, fontSize: 13, marginTop: 8, lineHeight: 1.45 }}>{c.nota}</div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <Button onClick={() => strumChord(sel)}><Icon d={IC.play} size={14} filled color="#fff" /> Escuchar {sel}</Button>
      </div>

      <SectionLabel>Los cuatro esenciales</SectionLabel>
      <div className="grid grid-cols-4 gap-2" style={{ marginBottom: 22 }}>
        {CORE.map((k) => <ChordCard key={k} k={k} sel={sel} onClick={() => setSel(k)} />)}
      </div>

      <SectionLabel>Siguiente paso</SectionLabel>
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
        background: active ? T.tintSoft : T.card,
        border: `1px solid ${active ? T.tint : T.hair}`,
        borderRadius: 16, padding: 8, transition: "all .2s", fontFamily: FONT,
      }}
      className="flex flex-col items-center active:scale-[0.97]">
      <div style={{ fontWeight: 700, fontSize: 15, color: active ? T.tint : T.ink, marginBottom: 2 }}>{k}</div>
      <ChordDiagram chordKey={k} tint={active ? T.tint : undefined} />
    </button>
  );
}

// =================== Rasgueo ===================
// =================== Ritmo: patrones de rasgueo ===================
// D = abajo · U = arriba · X = chuck (apagado percusivo) · null = silencio
const STRUM_PATTERNS = [
  {
    id: "basico", n: "Básico", level: "Fácil",
    slots: ["D", null, "D", null, "D", null, "D", null],
    desc: "Un golpe hacia abajo por pulso. Empieza aquí hasta que salga sin mirar.",
  },
  {
    id: "vaiven", n: "Vaivén", level: "Fácil",
    slots: ["D", "U", "D", "U", "D", "U", "D", "U"],
    desc: "Abajo-arriba constante. Trabaja la muñeca suelta, como sacudir agua de la mano.",
  },
  {
    id: "clasico", n: "El clásico", level: "Media",
    slots: ["D", null, "D", "U", null, "U", "D", "U"],
    desc: "El patrón que suena en la mitad de las canciones de ukelele. Tu objetivo principal.",
  },
  {
    id: "pop", n: "Pop", level: "Media",
    slots: ["D", null, "D", "U", "D", null, "D", "U"],
    desc: "Variante con más empuje, típica de pop y country. Acentúa el primer golpe.",
  },
  {
    id: "reggae", n: "Reggae", level: "Media",
    slots: [null, "U", null, "U", null, "U", null, "U"],
    desc: "Solo golpes arriba a contratiempo, cortos y secos. El silencio es parte del ritmo.",
  },
  {
    id: "percusivo", n: "Percusivo", level: "Difícil",
    slots: ["D", null, "X", "U", null, "U", "X", "U"],
    desc: "El clásico con chuck: apoya la palma en las cuerdas al golpear para hacer chak.",
  },
];

// Sonido de chuck: golpe de ruido corto y apagado
function chuck(ctx, t, vol = 0.2) {
  const dur = 0.07;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = 900;
  filt.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(ctx.destination);
  src.start(t);
}

function Rasgueo() {
  const [patIdx, setPatIdx] = useState(2); // El clásico por defecto
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(70);
  const [step, setStep] = useState(-1);
  const [withChord, setWithChord] = useState(true);
  const stepRef = useRef(0);
  const timer = useRef(null);

  const pat = STRUM_PATTERNS[patIdx];
  const slots = pat.slots;

  const doTick = useCallback(() => {
    const i = stepRef.current % slots.length;
    setStep(i);
    const ctx = getCtx();
    const slot = slots[i];
    if (slot === "X") {
      chuck(ctx, ctx.currentTime);
    } else if (slot) {
      if (withChord) strumChord("C", slot === "U", 0.16);
      else click(ctx, ctx.currentTime, i === 0);
    } else {
      click(ctx, ctx.currentTime, false);
    }
    stepRef.current += 1;
  }, [withChord, slots]);

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

  const selectPattern = (i) => {
    setPatIdx(i);
    stepRef.current = 0;
    if (!playing) setStep(-1);
  };

  const glyph = (slot) => (slot === "D" ? "↓" : slot === "U" ? "↑" : slot === "X" ? "✕" : "·");

  return (
    <div>
      <p style={{ color: T.soft, fontSize: 15, lineHeight: 1.5, margin: "0 4px 16px" }}>
        Elige un patrón y síguelo con el metrónomo. Mueve la muñeca, no el brazo, y domina uno antes de pasar al
        siguiente.
      </p>

      {/* Visualizador del patrón activo */}
      <div style={{
        background: T.card, borderRadius: 20, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", padding: "18px 12px 14px", marginBottom: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
          {slots.map((slot, i) => {
            const on = step === i, isBeat = i % 2 === 0;
            return (
              <div key={i} style={{ width: 32, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: T.soft, fontWeight: 600, marginBottom: 5 }}>{isBeat ? i / 2 + 1 : "·"}</div>
                <div className={slot ? (on ? "neu-inset" : "neu-sm") : ""}
                  style={{
                    width: 32, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: slot === "X" ? 16 : 19, fontWeight: 700,
                    color: slot ? (on ? T.tint : T.ink) : T.track,
                    transition: "all .08s",
                  }}>
                  {glyph(slot)}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 13, color: T.soft, textAlign: "center", lineHeight: 1.45, padding: "0 8px" }}>
          {pat.desc}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <Button onClick={playing ? stop : start} style={{ minWidth: 118 }}>
          <Icon d={playing ? IC.pause : IC.play} size={14} filled={!playing} color="#fff" /> {playing ? "Parar" : "Empezar"}
        </Button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.soft, marginBottom: 2 }}>
            <span>Velocidad</span>
            <span style={{ fontWeight: 600, color: T.ink }}>{bpm} BPM</span>
          </div>
          <input type="range" min="50" max="120" value={bpm} onChange={(e) => setBpm(+e.target.value)}
            style={{ width: "100%", accentColor: T.tint }} />
        </div>
      </div>

      {/* Lista de patrones */}
      <SectionLabel>Patrones</SectionLabel>
      <div style={{
        background: T.card, borderRadius: 16, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", overflow: "hidden", marginBottom: 16,
      }}>
        {STRUM_PATTERNS.map((p, i) => {
          const active = i === patIdx;
          return (
            <button key={p.id} onClick={() => selectPattern(i)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                width: "100%", textAlign: "left", padding: "12px 16px",
                background: active ? T.tintSoft : "transparent",
                border: "none", borderTop: i > 0 ? `1px solid ${T.hair}` : "none",
                fontFamily: FONT, transition: "background .15s",
              }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: active ? T.tint : T.ink }}>{p.n}</span>
                  <span style={{ fontSize: 11, color: T.soft, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {p.level}
                  </span>
                </div>
                <div style={{
                  fontSize: 14, color: T.soft, marginTop: 2, letterSpacing: "0.18em",
                  fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                }}>
                  {p.slots.map(glyph).join("")}
                </div>
              </div>
              {active && <Icon d={IC.check} size={16} color={T.tint} />}
            </button>
          );
        })}
      </div>

      <label style={{
        background: T.card, border: `1px solid ${T.hair}`, borderRadius: 14,
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        fontSize: 14, color: T.ink, cursor: "pointer",
      }}>
        <input type="checkbox" checked={withChord} onChange={(e) => setWithChord(e.target.checked)}
          style={{ accentColor: T.tint, width: 17, height: 17 }} />
        Sonar con acorde de Do en lugar del clic
      </label>
    </div>
  );
}

// =================== Reto (detección por micrófono) ===================
const CHORD_PCS = { C: [0, 4, 7], Am: [9, 0, 4], F: [5, 9, 0], G7: [7, 11, 2, 5] };
function chromaFromFFT(freqData, sampleRate, fftSize) {
  const chroma = new Array(12).fill(0);
  const binHz = sampleRate / fftSize;
  const iMin = Math.max(1, Math.floor(80 / binHz));
  const iMax = Math.min(freqData.length - 1, Math.ceil(1000 / binHz));
  let total = 0;
  for (let i = iMin; i <= iMax; i++) {
    const amp = Math.pow(10, freqData[i] / 20);
    const f = i * binHz;
    const pc = ((Math.round(12 * Math.log2(f / 261.63)) % 12) + 12) % 12;
    chroma[pc] += amp;
    total += amp;
  }
  return { chroma, total };
}
function chordSimilarity(chroma, chord) {
  const pcs = CHORD_PCS[chord];
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
  norm = Math.sqrt(norm) || 1;
  let dot = 0;
  pcs.forEach((pc) => { dot += chroma[pc]; });
  return dot / (norm * Math.sqrt(pcs.length));
}

function Reto({ progress, onSave }) {
  const [pairIdx, setPairIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(60);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState(false);
  const [heard, setHeard] = useState(null);
  const [micErr, setMicErr] = useState(null);

  const tick = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const countRef = useRef(0);
  const stableRef = useRef({ chord: null, frames: 0 });
  const currentRef = useRef(null);
  const lastCountT = useRef(0);
  const noiseRef = useRef(1e9);

  const pair = PAIRS[pairIdx];
  const key = pair.join("-");
  const best = progress.bestCpm[key] || 0;

  const stopMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    setHeard(null);
  }, []);

  const finish = useCallback((finalCount) => {
    clearInterval(tick.current);
    stopMic();
    setRunning(false);
    setResult(finalCount);
    click(getCtx(), getCtx().currentTime, true);
    const p = { ...progress, bestCpm: { ...progress.bestCpm } };
    if (finalCount > (p.bestCpm[key] || 0)) p.bestCpm[key] = finalCount;
    p.history = [...(p.history || []), { key, cpm: finalCount, date: new Date().toISOString().slice(0, 10) }].slice(-50);
    onSave(p);
  }, [progress, key, onSave, stopMic]);

  const addChange = useCallback(() => {
    countRef.current += 1;
    setCount(countRef.current);
    click(getCtx(), getCtx().currentTime, false);
  }, []);

  const startMic = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    streamRef.current = stream;
    const ctx = getCtx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.55;
    src.connect(analyser);
    analyserRef.current = analyser;
    noiseRef.current = 1e9;
    stableRef.current = { chord: null, frames: 0 };
    currentRef.current = null;

    const freqData = new Float32Array(analyser.frequencyBinCount);
    const [a, b] = PAIRS[pairIdx];
    const loop = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getFloatFrequencyData(freqData);
      const { chroma, total } = chromaFromFFT(freqData, ctx.sampleRate, analyser.fftSize);
      noiseRef.current = Math.min(noiseRef.current * 1.002, total || noiseRef.current);
      const loud = total > Math.max(noiseRef.current * 3, 0.004);

      let cand = null;
      if (loud) {
        const sA = chordSimilarity(chroma, a);
        const sB = chordSimilarity(chroma, b);
        const bestS = Math.max(sA, sB);
        if (bestS > 0.45 && Math.abs(sA - sB) > 0.02) cand = sA > sB ? a : b;
      }

      const st = stableRef.current;
      if (cand && cand === st.chord) st.frames += 1;
      else stableRef.current = { chord: cand, frames: cand ? 1 : 0 };

      if (cand && stableRef.current.frames >= 6) {
        setHeard(cand);
        const now = performance.now();
        if (currentRef.current && currentRef.current !== cand && now - lastCountT.current > 700) {
          lastCountT.current = now;
          addChange();
        }
        currentRef.current = cand;
      } else if (!loud) {
        setHeard(null);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const start = async () => {
    getCtx();
    setMicErr(null);
    if (!manual) {
      try { await startMic(); }
      catch (e) {
        setMicErr("Sin acceso al micrófono. Activado el modo manual.");
        setManual(true);
      }
    }
    setResult(null); setCount(0); countRef.current = 0; setLeft(60); setRunning(true);
    tick.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) { finish(countRef.current); return 0; }
        return l - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { clearInterval(tick.current); stopMic(); }, [stopMic]);

  const tapManual = () => {
    if (!running) return;
    addChange();
    strumChord(countRef.current % 2 === 0 ? pair[0] : pair[1], false, 0.1);
  };

  const Stat = ({ label, value, color }) => (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 12, color: T.soft, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );

  return (
    <div>
      <p style={{ color: T.soft, fontSize: 15, lineHeight: 1.5, margin: "0 4px 16px" }}>
        Tu métrica de progreso: <b style={{ color: T.ink, fontWeight: 600 }}>cambios por minuto</b>. Empieza, alterna
        los dos acordes y el micrófono cuenta los cambios. Meta para el Nivel 2: 20 o más.
      </p>

      <div style={{ background: T.track, borderRadius: 12, padding: 2, display: "flex", marginBottom: 18 }}>
        {PAIRS.map((p, i) => (
          <button key={i} onClick={() => { if (!running) { setPairIdx(i); setResult(null); } }}
            style={{
              flex: 1, border: "none", borderRadius: 10, padding: "8px 0",
              fontFamily: FONT, fontSize: 13, fontWeight: 600,
              color: pairIdx === i ? T.ink : T.soft,
              background: pairIdx === i ? T.segActive : "transparent",
              boxShadow: pairIdx === i ? "var(--shadow-seg)" : "none",
              opacity: running && pairIdx !== i ? 0.4 : 1,
              transition: "all .2s",
            }}>
            {p[0]} · {p[1]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 34, marginBottom: 18 }}>
        {pair.map((k) => (
          <div key={k} style={{ width: 86, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              fontWeight: 700, fontSize: 16, marginBottom: 2,
              color: heard === k && running ? T.tint : T.ink, transition: "color .15s",
            }}>
              {k}
            </div>
            <ChordDiagram chordKey={k} tint={heard === k && running ? T.tint : undefined} />
          </div>
        ))}
      </div>

      <div style={{
        background: T.card, borderRadius: 16, border: `1px solid ${T.hair}`,
        display: "flex", padding: "12px 8px", marginBottom: 16,
      }}>
        <Stat label="Tiempo" value={`0:${String(left % 60).padStart(2, "0")}`} color={left <= 10 && running ? T.red : T.ink} />
        <div style={{ width: 1, background: T.hair }} />
        <Stat label="Cambios" value={count} color={T.tint} />
        <div style={{ width: 1, background: T.hair }} />
        <Stat label="Récord" value={best} color={T.soft} />
      </div>

      {running ? (
        manual ? (
          <button onClick={tapManual}
            style={{
              width: "100%", color: T.tint,
              borderRadius: 22, padding: "34px 0", fontFamily: FONT, fontSize: 21, fontWeight: 700,
            }}
            className="neu active:scale-[0.98] transition-transform">
            Cambio limpio
          </button>
        ) : (
          <div className="neu-inset"
            style={{ width: "100%", borderRadius: 22, padding: "24px 0", textAlign: "center", transition: "all .2s" }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: heard ? T.tint : T.soft }}>
              <Icon d={IC.mic} size={17} /> {heard ? `Oigo ${heard}` : "Escuchando…"}
            </div>
            <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
              Rasguea cada acorde dos o tres veces antes de cambiar.
            </div>
          </div>
        )
      ) : (
        <div style={{ textAlign: "center" }}>
          <Button onClick={start} style={{ width: "100%", padding: "15px 0", fontSize: 17 }}>
            <Icon d={manual ? IC.play : IC.mic} size={15} filled={manual} color="#fff" /> Empezar reto de 60 s
          </Button>
        </div>
      )}

      {micErr && <div style={{ color: T.red, fontSize: 13, marginTop: 10, textAlign: "center" }}>{micErr}</div>}

      {result !== null && (
        <div style={{
          background: result >= 20 ? T.greenSoft : T.fill,
          border: `1px solid ${result >= 20 ? T.green : T.hair}`,
          borderRadius: 16, padding: "14px 16px", textAlign: "center", marginTop: 16,
        }}>
          <div style={{ fontSize: 21, fontWeight: 700, color: result >= 20 ? T.green : T.ink }}>
            {result} CPM{result >= 20 ? " · Nivel 2 superado" : result > 0 && result >= best ? " · Nuevo récord" : ""}
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 2 }}>
            {result >= 20 ? "Prueba ahora otra pareja de acordes." : "La meta son 20. Lento y limpio gana a rápido y sucio."}
          </div>
        </div>
      )}

      <label style={{
        background: T.card, border: `1px solid ${T.hair}`, borderRadius: 14,
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        fontSize: 14, color: T.ink, cursor: "pointer", marginTop: 16,
      }}>
        <input type="checkbox" checked={manual} disabled={running}
          onChange={(e) => setManual(e.target.checked)} style={{ accentColor: T.tint, width: 17, height: 17 }} />
        Contar los cambios a mano con un botón
      </label>
    </div>
  );
}

// =================== Rutina ===================
const PHASES = [
  { id: "afinar", n: "Afinar", s: 60 },
  { id: "cambios", n: "Cambios de 2 acordes", s: 180 },
  { id: "rasgueo", n: "Rasgueo con metrónomo", s: 180 },
  { id: "cancion", n: "Una canción entera", s: 300 },
  { id: "cantar", n: "Cantar mientras tocas", s: 180, opt: true },
];
function Rutina() {
  const [withSinging, setWithSinging] = useState(true);
  const phases = withSinging ? PHASES : PHASES.filter((p) => !p.opt);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(phases[0].s);
  const [run, setRun] = useState(false);
  const [pair, setPair] = useState(() => PAIRS[Math.floor(Math.random() * PAIRS.length)]);
  const tick = useRef(null);

  const newPair = useCallback(() => {
    setPair((prev) => {
      let p = prev;
      while (p === prev) p = PAIRS[Math.floor(Math.random() * PAIRS.length)];
      return p;
    });
  }, []);

  const label = (p) => (p.id === "cambios" ? `Cambios ${pair[0]} y ${pair[1]}` : p.n);

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

  const reset = () => { setRun(false); setIdx(0); setLeft(phases[0].s); newPair(); };
  useEffect(() => { setRun(false); setIdx(0); setLeft(phases[0].s); /* eslint-disable-next-line */ }, [withSinging]);

  const ph = phases[idx];
  const done = idx === phases.length - 1 && left === 0 && !run;
  const pct = ph.s > 0 ? (left / ph.s) * 100 : 0;
  const R = 72, circ = 2 * Math.PI * R;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const totalMin = phases.reduce((a, p) => a + p.s, 0) / 60;
  const isCambios = ph.id === "cambios" && !done;

  return (
    <div>
      <p style={{ color: T.soft, fontSize: 15, lineHeight: 1.5, margin: "0 4px 14px" }}>
        <b style={{ color: T.ink, fontWeight: 600 }}>{totalMin} minutos al día.</b> Corto y diario gana a largo y
        esporádico. En unas once semanas habrás sumado tus veinte horas.
      </p>

      <label style={{
        background: T.card, border: `1px solid ${T.hair}`, borderRadius: 14,
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        fontSize: 14, color: T.ink, cursor: "pointer", marginBottom: 14,
      }}>
        <input type="checkbox" checked={withSinging} onChange={(e) => setWithSinging(e.target.checked)}
          style={{ accentColor: T.tint, width: 17, height: 17 }} />
        Incluir la fase de cantar, desde la semana 2
      </label>

      <div style={{
        background: T.card, borderRadius: 20,
        border: `1px solid ${isCambios ? T.tint : T.hair}`,
        boxShadow: "var(--shadow-card)",
        padding: "14px 16px", marginBottom: 16, transition: "border-color .3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>
            Pareja de hoy · <span style={{ color: T.tint }}>{pair[0]} y {pair[1]}</span>
          </div>
          <button onClick={newPair} disabled={run && isCambios}
            style={{
              fontSize: 14, fontWeight: 600, color: T.tint, background: "transparent",
              border: "none", padding: 4, opacity: run && isCambios ? 0.35 : 1, fontFamily: FONT,
            }}>
            <Icon d={IC.shuffle} size={14} /> Cambiar
          </button>
        </div>
        <div style={{ fontSize: 13, color: T.soft, marginBottom: 8, lineHeight: 1.45 }}>
          Coloca un acorde, rasguea, cambia al otro. Lento y limpio. El número indica el dedo.
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 34 }}>
          {pair.map((k) => (
            <div key={k} style={{ width: 84, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{k}</div>
              <ChordDiagram chordKey={k} tint={isCambios ? T.tint : undefined} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <div className="neu-inset" style={{ width: 208, height: 208, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 180, height: 180 }}>
          <svg width="180" height="180">
            <circle cx="90" cy="90" r={R} fill="none" stroke={T.track} strokeWidth="10" />
            <circle cx="90" cy="90" r={R} fill="none" stroke={done ? T.green : T.tint} strokeWidth="10"
              strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
              transform="rotate(-90 90 90)" style={{ transition: "stroke-dashoffset 1s linear" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {done ? (
              <div style={{ fontSize: 22, fontWeight: 700, color: T.green }}>Completada</div>
            ) : (
              <>
                <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", color: T.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {mm}:{ss}
                </div>
                <div style={{ color: T.soft, fontSize: 12, marginTop: 5, textAlign: "center", maxWidth: 112, lineHeight: 1.35 }}>{label(ph)}</div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 18 }}>
        <Button onClick={() => { getCtx(); setRun((r) => !r); }} disabled={done} style={{ minWidth: 132 }}>
          <Icon d={run ? IC.pause : IC.play} size={14} filled={!run} color="#fff" /> {run ? "Pausa" : "Empezar"}
        </Button>
        <Button kind="gray" onClick={reset}><Icon d={IC.reset} size={14} /> Reiniciar</Button>
      </div>

      <div style={{
        background: T.card, borderRadius: 16, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", overflow: "hidden",
      }}>
        {phases.map((p, i) => (
          <div key={i}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px",
              borderTop: i > 0 ? `1px solid ${T.hair}` : "none",
              background: i === idx && !done ? T.tintSoft : "transparent",
              opacity: i < idx || done ? 0.55 : 1,
            }}>
            <span style={{ color: T.ink, fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              {(i < idx || done) && <Icon d={IC.check} size={15} color={T.green} />}
              {label(p)}
            </span>
            <span style={{ color: T.soft, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{p.s / 60} min</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =================== Niveles ===================
const LEVELS = [
  {
    id: "n1", n: "Superviviente", num: "1", meta: "Un acorde nítido",
    gate: "C suena limpio cinco veces seguidas: las cuatro cuerdas, sin zumbidos.",
    auto: null,
  },
  {
    id: "n2", n: "Cuatro acordes", num: "2", meta: "Una canción lenta entera",
    gate: "20 o más CPM en el Reto y el patrón completo a 70 BPM sin parar.",
    auto: (p) => Object.values(p.bestCpm || {}).some((v) => v >= 20),
  },
  {
    id: "n3", n: "Cancionero", num: "3", meta: "Cantar y tocar a la vez",
    gate: "Una canción entera cantando, sin parar aunque falles.",
    auto: null,
  },
  {
    id: "n4", n: "Ritmo y dinámica", num: "4", meta: "Que suene con groove",
    gate: "Tres canciones de memoria y dos patrones de ritmo distintos.",
    auto: null,
  },
  {
    id: "n5", n: "Intérprete", num: "5", meta: "Tocar para alguien",
    gate: "Toca una canción delante de alguien. Irene cuenta.",
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
      <p style={{ color: T.soft, fontSize: 15, lineHeight: 1.5, margin: "0 4px 16px" }}>
        Cada nivel tiene una puerta medible: o la pasas o sigues practicando. El Nivel 2 se desbloquea solo con el Reto.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {LEVELS.map((lv) => {
          const autoDone = lv.auto ? lv.auto(progress) : false;
          const done = !!progress.levels[lv.id] || autoDone;
          const isCurrent = unlocked && !done;
          const locked = !unlocked;
          if (!done) unlocked = false;
          return (
            <div key={lv.id}
              style={{
                background: T.card,
                border: `1px solid ${done ? T.green : isCurrent ? T.tint : T.hair}`,
                borderRadius: 16, padding: "14px 16px",
                boxShadow: "var(--shadow-card)",
                opacity: locked ? 0.5 : 1,
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 99, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done ? T.green : isCurrent ? T.tint : T.fill,
                  color: done || isCurrent ? "#fff" : T.soft,
                  fontWeight: 700, fontSize: 14,
                }}>
                  {done ? <Icon d={IC.check} size={15} color="#fff" /> : locked ? <Icon d={IC.lock} size={13} color={T.soft} /> : lv.num}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{lv.n}</span>
                    <span style={{ fontSize: 11, color: T.soft, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{lv.meta}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.soft, marginTop: 2, lineHeight: 1.45 }}>{lv.gate}</div>
                </div>
              </div>
              {!locked && !autoDone && (
                <div style={{ marginTop: 10, paddingLeft: 42 }}>
                  <button onClick={() => toggle(lv.id)}
                    style={{
                      fontFamily: FONT, fontSize: 14, fontWeight: 600,
                      color: done ? T.soft : "#fff",
                      background: done ? T.fill : T.tint,
                      border: "none", borderRadius: 999, padding: "7px 16px",
                    }}
                    className="active:scale-[0.97] transition-transform">
                    {done ? "Desmarcar" : "He pasado la puerta"}
                  </button>
                </div>
              )}
              {autoDone && (
                <div style={{ fontSize: 13, color: T.green, fontWeight: 600, marginTop: 8, paddingLeft: 42 }}>
                  Desbloqueado con tu récord del Reto
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
  { id: "afinar", label: "Afinar" },
  { id: "acordes", label: "Acordes" },
  { id: "rasgueo", label: "Ritmo" },
  { id: "reto", label: "Reto" },
  { id: "rutina", label: "Rutina" },
  { id: "niveles", label: "Nivel" },
];

export default function App() {
  const [tab, setTab] = useState("afinar");
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);

  useEffect(() => { loadProgress().then(setProgress); }, []);
  const handleSave = (p) => { setProgress(p); saveProgress(p); };

  return (
    <div style={{ background: T.bg, fontFamily: FONT, minHeight: "100vh", color: T.ink, WebkitFontSmoothing: "antialiased" }}
      className="w-full flex justify-center">
      <div className="w-full" style={{ maxWidth: 480 }}>

        {/* Cabecera translúcida fija */}
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: T.headerBg,
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          borderBottom: `1px solid ${T.hair}`,
          padding: "16px 16px 12px",
        }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.022em", lineHeight: 1.1, margin: 0 }}>
            Ukelele Fácil
          </h1>
          <p style={{ color: T.soft, fontSize: 13, margin: "3px 0 12px" }}>15 minutos al día · progreso medible</p>

          <div style={{ background: T.track, borderRadius: 11, padding: 2, display: "flex" }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  flex: 1, border: "none", borderRadius: 9, padding: "7px 0",
                  fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
                  color: tab === t.id ? T.ink : T.soft,
                  background: tab === t.id ? T.segActive : "transparent",
                  boxShadow: tab === t.id ? "var(--shadow-seg)" : "none",
                  transition: "all .18s",
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido */}
        <div style={{ padding: "18px 16px 40px" }}>
          {tab === "afinar" && <Afinador />}
          {tab === "acordes" && <Acordes />}
          {tab === "rasgueo" && <Rasgueo />}
          {tab === "reto" && <Reto progress={progress} onSave={handleSave} />}
          {tab === "rutina" && <Rutina />}
          {tab === "niveles" && <Niveles progress={progress} onSave={handleSave} />}

          <p style={{ color: T.faint, fontSize: 12, textAlign: "center", marginTop: 28 }}>
            Lento y limpio gana a rápido y sucio.
          </p>
        </div>
      </div>
    </div>
  );
}
