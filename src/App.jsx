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
const DEFAULT_PROGRESS = { bestCpm: {}, levels: {}, history: [], retoLevels: {}, sessions: [], practiceSec: 0, appSec: 0, practiceDays: {}, calibration: null, reminder: { enabled: false, time: "19:00", last: null }, ear: { ok: 0, total: 0, streak: 0, best: 0 } };
let memProgress = { ...DEFAULT_PROGRESS };
async function loadProgress() {
  try {
    const raw = localStorage.getItem("uke-progress");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_PROGRESS, ...parsed,
        reminder: { ...DEFAULT_PROGRESS.reminder, ...(parsed.reminder || {}) },
        ear: { ...DEFAULT_PROGRESS.ear, ...(parsed.ear || {}) },
      };
    }
  } catch (e) { /* sin storage: memoria */ }
  return memProgress;
}
async function saveProgress(p) {
  memProgress = p;
  try { localStorage.setItem("uke-progress", JSON.stringify(p)); } catch (e) { /* memoria */ }
}

// ---- Tiempo, días y racha ----
function addPractice(p, sec) {
  const day = new Date().toISOString().slice(0, 10);
  const pd = { ...(p.practiceDays || {}) };
  pd[day] = (pd[day] || 0) + sec;
  return { ...p, practiceSec: (p.practiceSec || 0) + sec, practiceDays: pd };
}
function streakDays(pd = {}) {
  let n = 0;
  const d = new Date();
  const today = d.toISOString().slice(0, 10);
  if (!pd[today]) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    if (pd[k] > 0) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}
function notifyPractice() {
  const opts = { body: "Tu ukelele te espera. Cinco minutos protegen la racha.", icon: "/icon-192.png" };
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((r) => r.showNotification("Ukelele Fácil", opts))
        .catch(() => { try { new Notification("Ukelele Fácil", opts); } catch (e) { /* nada */ } });
      return;
    }
    new Notification("Ukelele Fácil", opts);
  } catch (e) { /* sin notificaciones */ }
}
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* sin háptica */ }
}
function calThresholds(p) {
  const c = (p && p.calibration) || {};
  return {
    rmsGate: Math.min(0.05, Math.max(0.008, c.rmsGate || 0.012)),
    totalGate: Math.min(0.02, Math.max(0.002, c.totalGate || 0.004)),
  };
}
function fmtTime(sec = 0) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} h ${m} m` : `${m} min`;
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
  flame: "M12 3c1 3-1 4-1 6a2.5 2.5 0 0 0 5 .5C17.5 11 19 12.5 19 15a7 7 0 0 1-14 0c0-3 2-4.5 3-6.5.7 1.3 1.6 1.8 1.6 1.8C9.5 7.5 10.5 5.5 12 3z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3.5 2",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  trophy: "M8 4h8v6a4 4 0 0 1-8 0z M8 5H5a3 3 0 0 0 3 4 M16 5h3a3 3 0 0 1-3 4 M12 14v3 M9 20h6 M12 17v3",
  music: "M9 18V6l10-2v12 M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  ear: "M6 10a6 6 0 1 1 12 0c0 3-2 3.5-2.6 5.4A3.6 3.6 0 0 1 12 19 M9.5 10a2.5 2.5 0 0 1 5 0c0 1.5-1.2 2-1.7 3",
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

function Afinador({ progress, onSave }) {
  const [last, setLast] = useState(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calPct, setCalPct] = useState(0);
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

      <div style={{ marginTop: 22 }}>
        <SectionLabel>Calibración del micrófono</SectionLabel>
        <div style={{
          background: T.card, borderRadius: 16, border: `1px solid ${T.hair}`,
          boxShadow: "var(--shadow-card)", padding: "14px 16px",
        }}>
          <div style={{ fontSize: 13, color: T.soft, lineHeight: 1.5, marginBottom: 10 }}>
            Mide el ruido de tu habitación durante 8 segundos para ajustar la sensibilidad del Reto y la Rutina.
            {progress.calibration
              ? ` Calibrado el ${progress.calibration.date}.`
              : " Aún sin calibrar: se usan valores por defecto."}
          </div>
          {calibrating ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.tint, marginBottom: 8, textAlign: "center" }}>
                Mantén silencio…
              </div>
              <div style={{ height: 6, borderRadius: 99, background: T.track, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${calPct}%`, background: T.tint, borderRadius: 99, transition: "width .2s" }} />
              </div>
            </div>
          ) : (
            <Button kind="gray" onClick={async () => {
              stopMic();
              setCalibrating(true); setCalPct(0);
              try {
                const stream = await navigator.mediaDevices.getUserMedia({
                  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                });
                const ctx = getCtx();
                const srcNode = ctx.createMediaStreamSource(stream);
                const an = ctx.createAnalyser();
                an.fftSize = 4096;
                srcNode.connect(an);
                const td = new Float32Array(an.fftSize);
                const fd = new Float32Array(an.frequencyBinCount);
                let sumRms = 0, sumTotal = 0, frames = 0;
                const t0 = performance.now();
                const DUR = 8000;
                await new Promise((resolve) => {
                  const step = () => {
                    const el = performance.now() - t0;
                    setCalPct(Math.min(100, Math.round((el / DUR) * 100)));
                    an.getFloatTimeDomainData(td);
                    let r = 0;
                    for (let i = 0; i < 2048; i++) r += td[i] * td[i];
                    sumRms += Math.sqrt(r / 2048);
                    an.getFloatFrequencyData(fd);
                    sumTotal += chromaFromFFT(fd, ctx.sampleRate, 4096).total;
                    frames++;
                    if (el < DUR) requestAnimationFrame(step); else resolve();
                  };
                  step();
                });
                stream.getTracks().forEach((t) => t.stop());
                const avgRms = sumRms / Math.max(1, frames);
                const avgTotal = sumTotal / Math.max(1, frames);
                onSave((prev) => ({
                  ...prev,
                  calibration: {
                    rmsGate: Math.min(0.05, Math.max(0.008, avgRms * 5 + 0.006)),
                    totalGate: Math.min(0.02, Math.max(0.002, avgTotal * 4 + 0.002)),
                    date: new Date().toISOString().slice(0, 10),
                  },
                }));
                buzz([20, 40, 20]);
              } catch (e) { /* permiso denegado: sin cambios */ }
              setCalibrating(false);
            }} style={{ fontSize: 15, padding: "10px 18px" }}>
              <Icon d={IC.mic} size={14} /> {progress.calibration ? "Recalibrar" : "Calibrar ahora"}
            </Button>
          )}
        </div>
      </div>
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
function Acordes({ progress, onSave }) {
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

      <EarTrainer progress={progress} onSave={onSave} />
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

// =================== Entrenador de oído ===================
const EAR_POOL = ["C", "Am", "F", "G7", "G", "Em", "D"];
function EarTrainer({ progress, onSave }) {
  const [answer, setAnswer] = useState(null);
  const [options, setOptions] = useState([]);
  const [picked, setPicked] = useState(null);
  const ear = progress.ear || { ok: 0, total: 0, streak: 0, best: 0 };

  const newRound = useCallback(() => {
    const ans = EAR_POOL[Math.floor(Math.random() * EAR_POOL.length)];
    const others = EAR_POOL.filter((c) => c !== ans).sort(() => Math.random() - 0.5).slice(0, 3);
    setAnswer(ans);
    setOptions([ans, ...others].sort(() => Math.random() - 0.5));
    setPicked(null);
    strumChord(ans, false, 0.2);
  }, []);

  const choose = (k) => {
    if (picked || !answer) return;
    setPicked(k);
    const correct = k === answer;
    buzz(correct ? [15, 30, 15] : 45);
    if (!correct) setTimeout(() => strumChord(answer, false, 0.16), 350);
    onSave((prev) => {
      const e = { ...(prev.ear || { ok: 0, total: 0, streak: 0, best: 0 }) };
      e.total += 1;
      if (correct) { e.ok += 1; e.streak += 1; e.best = Math.max(e.best, e.streak); }
      else e.streak = 0;
      return { ...prev, ear: e };
    });
    setTimeout(newRound, 1400);
  };

  return (
    <div style={{ marginTop: 22 }}>
      <SectionLabel>Entrena el oído</SectionLabel>
      <div style={{
        background: T.card, borderRadius: 16, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", padding: "14px 16px",
      }}>
        <div style={{ fontSize: 13, color: T.soft, lineHeight: 1.5, marginBottom: 12 }}>
          Suena un acorde: adivina cuál es. Reconocerlos de oído acelera todo lo demás.
        </div>
        {!answer ? (
          <div style={{ textAlign: "center" }}>
            <Button onClick={newRound} style={{ fontSize: 15, padding: "11px 22px" }}>
              <Icon d={IC.play} size={14} filled color="#fff" /> Empezar
            </Button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <Button kind="gray" onClick={() => strumChord(answer, false, 0.2)} style={{ fontSize: 14, padding: "9px 18px" }}>
                <Icon d={IC.reset} size={13} /> Repetir sonido
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 10 }}>
              {options.map((k) => {
                const isAns = k === answer, isPick = k === picked;
                let bg = T.fill, col = T.ink, bord = T.hair;
                if (picked) {
                  if (isAns) { bg = T.greenSoft; col = T.green; bord = T.green; }
                  else if (isPick) { bg = "rgba(255,59,48,0.10)"; col = T.red; bord = T.red; }
                }
                return (
                  <button key={k} onClick={() => choose(k)}
                    style={{
                      borderRadius: 14, padding: "13px 0", border: `1px solid ${bord}`,
                      background: bg, fontFamily: FONT, fontSize: 17, fontWeight: 700, color: col,
                      transition: "all .2s",
                    }}
                    className="active:scale-[0.97]">
                    {k} <span style={{ fontSize: 11, fontWeight: 600, color: T.soft }}>{CHORDS[k].es}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 12.5, color: T.soft, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
              Aciertos {ear.ok}/{ear.total} · Racha {ear.streak} · Mejor {ear.best}
            </div>
          </>
        )}
      </div>
    </div>
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

// =================== Canciones (tradicionales / dominio público) ===================
// Solo progresiones de acordes: las progresiones no tienen copyright.
const SONGS = [
  { id: "martinillo", n: "Martinillo", origen: "Tradicional", level: 1, beats: 4, chords: ["C"], bars: ["C", "C", "C", "C"], strum: "basico", tip: "Toda la canción con Do. Céntrate solo en llevar el ritmo constante." },
  { id: "tomdooley", n: "Tom Dooley", origen: "Tradicional", level: 2, beats: 4, chords: ["C", "G7"], bars: ["C", "C", "G7", "G7"], strum: "basico", tip: "Un cambio cada dos compases. Prepara el G7 un pulso antes." },
  { id: "cucaracha", n: "La Cucaracha", origen: "Tradicional", level: 2, beats: 4, chords: ["C", "G7"], bars: ["C", "C", "G7", "G7", "G7", "G7", "C", "C"], strum: "vaiven", tip: "Mismo par de acordes, más rápido. Canta encima cuando salga sola." },
  { id: "cumple", n: "Cumpleaños feliz", origen: "Tradicional", level: 3, beats: 3, chords: ["C", "F", "G7"], bars: ["C", "G7", "G7", "C", "C", "F", "G7", "C"], strum: "basico", tip: "Va en 3/4: tres golpes abajo por compás, el primero más fuerte." },
  { id: "estrellita", n: "Estrellita", origen: "Tradicional", level: 3, beats: 4, chords: ["C", "F", "G7"], bars: ["C", "F", "C", "G7"], strum: "basico", tip: "Cuatro compases en bucle. Tu primera canción con tres acordes." },
  { id: "susanna", n: "Oh! Susanna", origen: "Tradicional", level: 3, beats: 4, chords: ["C", "F", "G7"], bars: ["C", "C", "G7", "C", "C", "F", "G7", "C"], strum: "vaiven", tip: "Estructura de ocho compases, la base de mucho folk y country." },
  { id: "doowop", n: "El bucle doo-wop", origen: "Progresión clásica", level: 4, beats: 4, chords: ["C", "Am", "F", "G7"], bars: ["C", "Am", "F", "G7"], strum: "clasico", tip: "La progresión de cientos de éxitos pop. Cántale encima cualquier melodía que te suene: probablemente encaje." },
  { id: "cielito", n: "Cielito Lindo", origen: "Tradicional", level: 4, beats: 3, chords: ["C", "F", "G7"], bars: ["C", "F", "G7", "C"], strum: "basico", tip: "Vals en 3/4 para cantar y tocar a la vez. Ay, ay, ay, ay." },
  { id: "sloopjohnb", n: "Sloop John B", origen: "Tradicional", level: 5, beats: 4, chords: ["C", "F", "G7"], bars: ["C", "C", "C", "C", "C", "F", "G7", "C"], strum: "percusivo", tip: "Compases largos sobre Do: perfectos para meter el chuck sin perderte." },
  { id: "folk", n: "El bucle folk", origen: "Progresión clásica", level: 6, beats: 4, chords: ["G", "Em", "C", "D"], bars: ["G", "Em", "C", "D"], strum: "pop", tip: "Introduce G, Em y D. Cuando salga limpio, prueba el patrón percusivo." },
];

function strumAt(ctx, chordKey, t, vol = 0.16, up = false) {
  const c = CHORDS[chordKey];
  const order = up ? [3, 2, 1, 0] : [0, 1, 2, 3];
  order.forEach((idx, i) => pluck(ctx, freq(OPEN[STRING_ORDER[idx]], c.frets[idx]), t + i * 0.02, 1.1, vol));
}
function playSong(bars, beats, bpm = 96) {
  const ctx = getCtx();
  const start = ctx.currentTime + 0.06;
  const spb = 60 / bpm;
  bars.forEach((ch, bi) => {
    for (let b = 0; b < beats; b++) strumAt(ctx, ch, start + (bi * beats + b) * spb, b === 0 ? 0.2 : 0.11);
  });
  return bars.length * beats * spb * 1000;
}

// =================== Reto: 8 niveles ===================
const RETO_LEVELS = [
  { lv: 1, n: "Iniciación", meta: 10, pares: [["C", "Am"]] },
  { lv: 2, n: "Primer salto", meta: 14, pares: [["C", "F"]] },
  { lv: 3, n: "Soltura", meta: 16, pares: [["Am", "G7"]] },
  { lv: 4, n: "El cruce", meta: 18, pares: [["F", "G7"]] },
  { lv: 5, n: "Ciclo pop", meta: 20, ciclo: ["C", "Am", "F", "G7"] },
  { lv: 6, n: "Nuevos aires", meta: 18, pares: [["G", "Em"]] },
  { lv: 7, n: "Cruzadas", meta: 20, pares: [["C", "D"], ["Em", "D"]] },
  { lv: 8, n: "Gran ciclo", meta: 24, ciclo: ["G", "Em", "C", "D"] },
];
const CHORD_PCS = { C: [0, 4, 7], Am: [9, 0, 4], F: [5, 9, 0], G7: [7, 11, 2, 5], G: [7, 11, 2], Em: [4, 7, 11], D: [2, 6, 9] };
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
function detectChord(chroma, candidates) {
  let best = null, bestS = -1, second = -1;
  candidates.forEach((ch) => {
    const s = chordSimilarity(chroma, ch);
    if (s > bestS) { second = bestS; bestS = s; best = ch; }
    else if (s > second) second = s;
  });
  if (bestS > 0.45 && bestS - second > 0.02) return best;
  return null;
}

function Reto({ progress, onSave }) {
  const passed = progress.retoLevels || {};
  const firstOpen = RETO_LEVELS.findIndex((l) => !passed[l.lv]);
  const [lvIdx, setLvIdx] = useState(firstOpen === -1 ? RETO_LEVELS.length - 1 : firstOpen);
  const [subIdx, setSubIdx] = useState(0);
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
  const leftRef = useRef(60);
  const initRef = useRef(false);
  const stableRef = useRef({ chord: null, frames: 0 });
  const currentRef = useRef(null);
  const lastCountT = useRef(0);
  const noiseRef = useRef(1e9);
  const levelPillRefs = useRef({});

  const level = RETO_LEVELS[lvIdx];
  const candidates = level.ciclo || level.pares[Math.min(subIdx, level.pares.length - 1)];
  const key = candidates.join("-");
  const best = progress.bestCpm[key] || 0;
  const isUnlocked = (i) => i === 0 || !!passed[RETO_LEVELS[i - 1].lv];

  useEffect(() => {
    const el = levelPillRefs.current[lvIdx];
    if (el) el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [lvIdx]);

  // Al cargar el progreso guardado, saltar al primer nivel pendiente (solo una vez)
  useEffect(() => {
    if (initRef.current) return;
    const rl = progress.retoLevels || {};
    if (Object.values(rl).some(Boolean)) {
      initRef.current = true;
      const fo = RETO_LEVELS.findIndex((l) => !rl[l.lv]);
      setLvIdx(fo === -1 ? RETO_LEVELS.length - 1 : fo);
    }
  }, [progress.retoLevels]);

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
    buzz(finalCount >= level.meta ? [30, 50, 30, 50, 90] : 45);
    onSave((prev) => {
      let p = addPractice(prev, 60);
      p = { ...p, bestCpm: { ...p.bestCpm }, retoLevels: { ...(p.retoLevels || {}) } };
      if (finalCount > (p.bestCpm[key] || 0)) p.bestCpm[key] = finalCount;
      if (finalCount >= level.meta) p.retoLevels[level.lv] = true;
      p.history = [...(p.history || []), { key, cpm: finalCount, date: new Date().toISOString().slice(0, 10) }].slice(-50);
      return p;
    });
  }, [key, level, onSave, stopMic]);

  const addChange = useCallback(() => {
    countRef.current += 1;
    setCount(countRef.current);
    click(getCtx(), getCtx().currentTime, false);
    buzz(15);
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

    const gates = calThresholds(progress);
    const freqData = new Float32Array(analyser.frequencyBinCount);
    const cands = candidates.slice();
    const loop = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getFloatFrequencyData(freqData);
      const { chroma, total } = chromaFromFFT(freqData, ctx.sampleRate, analyser.fftSize);
      noiseRef.current = Math.min(noiseRef.current * 1.002, total || noiseRef.current);
      const loud = total > Math.max(noiseRef.current * 3, gates.totalGate);

      const cand = loud ? detectChord(chroma, cands) : null;
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
    setResult(null); setCount(0); countRef.current = 0;
    leftRef.current = 60; setLeft(60); setRunning(true);
    tick.current = setInterval(() => {
      leftRef.current -= 1;
      setLeft(leftRef.current);
      if (leftRef.current <= 0) finish(countRef.current);
    }, 1000);
  };

  useEffect(() => () => { clearInterval(tick.current); stopMic(); }, [stopMic]);

  const tapManual = () => {
    if (!running) return;
    addChange();
    strumChord(candidates[countRef.current % candidates.length], false, 0.1);
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
        Cambios por minuto detectados con el micrófono. Ocho niveles: supera la meta de cada uno para desbloquear el
        siguiente.
      </p>

      {/* Niveles del reto: deslizable */}
      <div className="tabs-scroll" style={{ marginBottom: 16 }}>
        {RETO_LEVELS.map((l, i) => {
          const open = isUnlocked(i);
          const done = !!passed[l.lv];
          const active = i === lvIdx;
          return (
            <button key={l.lv} ref={(el) => { levelPillRefs.current[i] = el; }}
              onClick={() => { if (open && !running) { setLvIdx(i); setSubIdx(0); setResult(null); } }}
              style={{
                flex: "0 0 auto", minWidth: "23%", borderRadius: 14, padding: "9px 10px", fontFamily: FONT,
                background: active ? T.tintSoft : T.card,
                border: `1px solid ${active ? T.tint : done ? T.green : T.hair}`,
                opacity: open ? 1 : 0.45, transition: "all .2s",
              }}>
              <div style={{
                fontSize: 15, fontWeight: 700,
                color: done ? T.green : active ? T.tint : T.ink,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
              }}>
                {done ? <Icon d={IC.check} size={13} color={T.green} /> : !open ? <Icon d={IC.lock} size={12} color={T.soft} /> : null}
                {l.lv}
              </div>
              <div style={{ fontSize: 10, color: T.soft, fontWeight: 600, marginTop: 1, whiteSpace: "nowrap" }}>{l.n}</div>
            </button>
          );
        })}
      </div>

      {!level.ciclo && level.pares.length > 1 && (
        <div style={{ background: T.track, borderRadius: 12, padding: 2, display: "flex", marginBottom: 16 }}>
          {level.pares.map((p, i) => (
            <button key={i} onClick={() => { if (!running) { setSubIdx(i); setResult(null); } }}
              style={{
                flex: 1, border: "none", borderRadius: 10, padding: "8px 0",
                fontFamily: FONT, fontSize: 13, fontWeight: 600,
                color: subIdx === i ? T.ink : T.soft,
                background: subIdx === i ? T.segActive : "transparent",
                boxShadow: subIdx === i ? "var(--shadow-seg)" : "none",
                transition: "all .2s",
              }}>
              {p[0]} · {p[1]}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", gap: level.ciclo ? 12 : 34, marginBottom: 16 }}>
        {candidates.map((k) => (
          <div key={k} style={{ width: level.ciclo ? 66 : 86, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              fontWeight: 700, fontSize: level.ciclo ? 13 : 16, marginBottom: 2,
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
        display: "flex", padding: "12px 8px", marginBottom: 16, boxShadow: "var(--shadow-card)",
      }}>
        <Stat label="Tiempo" value={`0:${String(left % 60).padStart(2, "0")}`} color={left <= 10 && running ? T.red : T.ink} />
        <div style={{ width: 1, background: T.hair }} />
        <Stat label="Cambios" value={count} color={T.tint} />
        <div style={{ width: 1, background: T.hair }} />
        <Stat label="Meta" value={level.meta} color={count >= level.meta ? T.green : T.soft} />
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
              {level.ciclo ? `Recorre el ciclo ${level.ciclo.join(", ")} en orden.` : "Rasguea cada acorde dos o tres veces antes de cambiar."}
            </div>
          </div>
        )
      ) : (
        <div style={{ textAlign: "center" }}>
          <Button onClick={start} style={{ width: "100%", padding: "15px 0", fontSize: 17 }}>
            <Icon d={manual ? IC.play : IC.mic} size={15} filled={manual} color="#fff" /> Empezar · Nivel {level.lv} del reto
          </Button>
        </div>
      )}

      {micErr && <div style={{ color: T.red, fontSize: 13, marginTop: 10, textAlign: "center" }}>{micErr}</div>}

      {result !== null && (
        <div style={{
          background: result >= level.meta ? T.greenSoft : T.fill,
          border: `1px solid ${result >= level.meta ? T.green : T.hair}`,
          borderRadius: 16, padding: "14px 16px", textAlign: "center", marginTop: 16,
        }}>
          <div style={{ fontSize: 21, fontWeight: 700, color: result >= level.meta ? T.green : T.ink }}>
            {result} CPM{result >= level.meta ? ` · Nivel ${level.lv} superado` : result > 0 && result >= best ? " · Nuevo récord" : ""}
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 2 }}>
            {result >= level.meta
              ? (level.lv < RETO_LEVELS.length ? "Siguiente nivel desbloqueado." : "Has completado todos los niveles del reto.")
              : `La meta son ${level.meta}. Lento y limpio gana a rápido y sucio.`}
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

// =================== Rutina (validación por micro + tiempo real) ===================
const PHASES = [
  { id: "afinar", n: "Afinar", s: 60 },
  { id: "cambios", n: "Cambios de 2 acordes", s: 180 },
  { id: "rasgueo", n: "Rasgueo con metrónomo", s: 180 },
  { id: "cancion", n: "Una canción entera", s: 300 },
  { id: "cantar", n: "Cantar mientras tocas", s: 180, opt: true },
];
function Rutina({ progress, onSave }) {
  const [withSinging, setWithSinging] = useState(true);
  const phases = withSinging ? PHASES : PHASES.filter((p) => !p.opt);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(phases[0].s);
  const [run, setRun] = useState(false);
  const [pair, setPair] = useState(() => PAIRS[Math.floor(Math.random() * PAIRS.length)]);
  const [useMic, setUseMic] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [live, setLive] = useState({ tuned: [], changes: 0, strums: 0, activePct: 0 });
  const [valid, setValid] = useState({});

  const tick = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const idxRef = useRef(0);
  const leftRef = useRef(phases[0].s);
  const pairRef = useRef(pair);
  const micOnRef = useRef(false);
  const validRef = useRef({});
  const savedRef = useRef(false);
  const secAccum = useRef(0);
  const acc = useRef({ tuned: new Set(), changes: 0, strums: 0, activeMs: 0 });
  const stableRef = useRef({ chord: null, frames: 0 });
  const currentRef = useRef(null);
  const lastCountT = useRef(0);
  const prevRms = useRef(0);
  const lastOnset = useRef(0);
  const noiseRef = useRef(1e9);
  const pitchSkip = useRef(0);
  const lastT = useRef(0);
  const lastLiveT = useRef(0);

  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => { pairRef.current = pair; }, [pair]);

  const newPair = useCallback(() => {
    setPair((prev) => {
      let p = prev;
      while (p === prev) p = PAIRS[Math.floor(Math.random() * PAIRS.length)];
      return p;
    });
  }, []);

  const label = (p) => (p.id === "cambios" ? `Cambios ${pair[0]} y ${pair[1]}` : p.n);

  const flushTime = useCallback(() => {
    const s = secAccum.current;
    if (s > 0) {
      secAccum.current = 0;
      onSave((prev) => addPractice(prev, s));
    }
  }, [onSave]);

  const resetAcc = () => {
    acc.current = { tuned: new Set(), changes: 0, strums: 0, activeMs: 0 };
    stableRef.current = { chord: null, frames: 0 };
    currentRef.current = null;
    setLive({ tuned: [], changes: 0, strums: 0, activePct: 0 });
  };

  const evaluatePhase = useCallback((i, phs) => {
    if (!micOnRef.current) { validRef.current[i] = null; setValid({ ...validRef.current }); resetAcc(); return; }
    const a = acc.current;
    const id = phs[i]?.id;
    let ok = false;
    if (id === "afinar") ok = a.tuned.size >= 2;
    if (id === "cambios") ok = a.changes >= 15;
    if (id === "rasgueo") ok = a.strums >= 40;
    if (id === "cancion") ok = a.activeMs >= 150000;
    if (id === "cantar") ok = a.activeMs >= 90000;
    validRef.current[i] = ok;
    setValid({ ...validRef.current });
    resetAcc();
  }, []);

  const stopMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    micOnRef.current = false;
    setMicOn(false);
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
    micOnRef.current = true;
    setMicOn(true);
    noiseRef.current = 1e9;
    lastT.current = performance.now();

    const gates = calThresholds(progress);
    const td = new Float32Array(analyser.fftSize);
    const fd = new Float32Array(analyser.frequencyBinCount);
    const loop = () => {
      if (!analyserRef.current) return;
      const now = performance.now();
      const dt = Math.min(100, now - lastT.current);
      lastT.current = now;

      analyserRef.current.getFloatTimeDomainData(td);
      let rms = 0;
      for (let i = 0; i < 2048; i++) rms += td[i] * td[i];
      rms = Math.sqrt(rms / 2048);
      noiseRef.current = Math.min(noiseRef.current * 1.001 + 1e-6, Math.max(rms, 1e-4));
      const loud = rms > Math.max(noiseRef.current * 4, gates.rmsGate);

      const id = phases[idxRef.current]?.id;
      const a = acc.current;

      if (id === "afinar") {
        pitchSkip.current = (pitchSkip.current + 1) % 5;
        if (pitchSkip.current === 0 && rms > 0.008) {
          const f = autoCorrelate(td.subarray(0, 2048), getCtx().sampleRate);
          if (f > 0) {
            STRING_ORDER.forEach((s) => {
              [f, f / 2, f * 2].forEach((ff) => {
                const cents = 1200 * Math.log2(ff / OPEN[s]);
                if (Math.abs(cents) <= 8) a.tuned.add(s);
              });
            });
          }
        }
      } else if (id === "cambios") {
        analyserRef.current.getFloatFrequencyData(fd);
        const { chroma, total } = chromaFromFFT(fd, getCtx().sampleRate, 4096);
        const cand = total > gates.totalGate && loud ? detectChord(chroma, pairRef.current) : null;
        const st = stableRef.current;
        if (cand && cand === st.chord) st.frames += 1;
        else stableRef.current = { chord: cand, frames: cand ? 1 : 0 };
        if (cand && stableRef.current.frames >= 6) {
          if (currentRef.current && currentRef.current !== cand && now - lastCountT.current > 700) {
            lastCountT.current = now;
            a.changes += 1;
            buzz(15);
          }
          currentRef.current = cand;
        }
      } else if (id === "rasgueo") {
        if (loud && prevRms.current < rms * 0.55 && now - lastOnset.current > 140) {
          lastOnset.current = now;
          a.strums += 1;
        }
      } else if (id === "cancion" || id === "cantar") {
        if (rms > gates.rmsGate * 0.9) a.activeMs += dt;
      }
      prevRms.current = rms;

      if (now - lastLiveT.current > 250) {
        lastLiveT.current = now;
        const dur = phases[idxRef.current]?.s || 1;
        setLive({
          tuned: Array.from(a.tuned),
          changes: a.changes,
          strums: a.strums,
          activePct: Math.min(100, Math.round((a.activeMs / (dur * 1000)) * 100)),
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const saveSession = useCallback(() => {
    if (savedRef.current) return;
    savedRef.current = true;
    buzz([30, 40, 30, 40, 90]);
    const okCount = Object.values(validRef.current).filter((v) => v === true).length;
    const withMic = Object.values(validRef.current).some((v) => v !== null);
    const extraSec = secAccum.current;
    secAccum.current = 0;
    onSave((prev) => {
      let p = extraSec > 0 ? addPractice(prev, extraSec) : prev;
      return {
        ...p,
        sessions: [...(p.sessions || []), {
          date: new Date().toISOString().slice(0, 10),
          ok: withMic ? okCount : null,
          total: phases.length,
        }].slice(-200),
      };
    });
  }, [onSave, phases.length]);

  useEffect(() => {
    if (run) {
      tick.current = setInterval(() => {
        secAccum.current += 1;
        leftRef.current -= 1;
        setLeft(leftRef.current);
        if (leftRef.current <= 0) {
          click(getCtx(), getCtx().currentTime, true);
          buzz(25);
          const i = idxRef.current;
          evaluatePhase(i, phases);
          const next = i + 1;
          if (next >= phases.length) {
            setRun(false);
            stopMic();
            saveSession();
          } else {
            idxRef.current = next;
            setIdx(next);
            leftRef.current = phases[next].s;
            setLeft(leftRef.current);
          }
        }
      }, 1000);
    }
    return () => clearInterval(tick.current);
  }, [run, phases.length, evaluatePhase, stopMic, saveSession, phases]);

  const start = async () => {
    getCtx();
    if (useMic && !micOnRef.current) {
      try { await startMic(); } catch (e) { setUseMic(false); }
    }
    setRun(true);
  };
  const pause = () => { setRun(false); flushTime(); };

  const reset = () => {
    setRun(false); stopMic(); flushTime();
    idxRef.current = 0; setIdx(0);
    leftRef.current = phases[0].s; setLeft(leftRef.current);
    validRef.current = {}; setValid({});
    savedRef.current = false;
    resetAcc(); newPair();
  };
  useEffect(() => {
    setRun(false);
    idxRef.current = 0; setIdx(0);
    leftRef.current = phases[0].s; setLeft(leftRef.current);
    /* eslint-disable-next-line */
  }, [withSinging]);
  useEffect(() => () => { stopMic(); flushTime(); }, [stopMic, flushTime]);

  const ph = phases[idx];
  const done = idx === phases.length - 1 && left === 0 && !run;
  const pct = ph.s > 0 ? (left / ph.s) * 100 : 0;
  const R = 72, circ = 2 * Math.PI * R;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const totalMin = phases.reduce((a, p) => a + p.s, 0) / 60;
  const isCambios = ph.id === "cambios" && !done;

  const liveContent = () => {
    if (ph.id === "afinar") return (
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {STRING_ORDER.map((s) => (
          <span key={s} style={{
            width: 30, height: 30, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700,
            background: live.tuned.includes(s) ? T.green : T.fill,
            color: live.tuned.includes(s) ? "#fff" : T.soft,
            transition: "all .2s",
          }}>{s}</span>
        ))}
      </div>
    );
    if (ph.id === "cambios") return <LiveMetric value={live.changes} target={15} unit="cambios" />;
    if (ph.id === "rasgueo") return <LiveMetric value={live.strums} target={40} unit="golpes" />;
    return <LiveMetric value={live.activePct} target={50} unit="% de actividad" />;
  };

  return (
    <div>
      <p style={{ color: T.soft, fontSize: 15, lineHeight: 1.5, margin: "0 4px 14px" }}>
        <b style={{ color: T.ink, fontWeight: 600 }}>{totalMin} minutos al día.</b> El micrófono valida cada fase
        mientras tocas, y cada minuto suma a tu contador y a tu racha.
      </p>

      <label style={{
        background: T.card, border: `1px solid ${T.hair}`, borderRadius: 14,
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        fontSize: 14, color: T.ink, cursor: "pointer", marginBottom: 10,
      }}>
        <input type="checkbox" checked={useMic} disabled={run}
          onChange={(e) => { setUseMic(e.target.checked); if (!e.target.checked) stopMic(); }}
          style={{ accentColor: T.tint, width: 17, height: 17 }} />
        Validar la sesión con el micrófono
      </label>

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

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
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

      {run && micOn && (
        <div className="neu-inset" style={{ borderRadius: 16, padding: "12px 14px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.tint, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon d={IC.mic} size={13} /> Validando con el micrófono
          </div>
          {liveContent()}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 18 }}>
        <Button onClick={() => { run ? pause() : start(); }} disabled={done} style={{ minWidth: 132 }}>
          <Icon d={run ? IC.pause : IC.play} size={14} filled={!run} color="#fff" /> {run ? "Pausa" : "Empezar"}
        </Button>
        <Button kind="gray" onClick={reset}><Icon d={IC.reset} size={14} /> Reiniciar</Button>
      </div>

      <div style={{
        background: T.card, borderRadius: 16, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", overflow: "hidden",
      }}>
        {phases.map((p, i) => {
          const past = i < idx || done;
          const v = valid[i];
          return (
            <div key={i}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px",
                borderTop: i > 0 ? `1px solid ${T.hair}` : "none",
                background: i === idx && !done ? T.tintSoft : "transparent",
                opacity: past ? 0.65 : 1,
              }}>
              <span style={{ color: T.ink, fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                {past && (v === true
                  ? <Icon d={IC.check} size={15} color={T.green} />
                  : v === false
                    ? <span style={{ color: T.soft, fontWeight: 700, fontSize: 14 }}>·</span>
                    : <Icon d={IC.check} size={15} color={T.soft} />)}
                {label(p)}
              </span>
              <span style={{ color: T.soft, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{p.s / 60} min</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: T.faint, margin: "10px 4px 0", textAlign: "center" }}>
        Verde: fase validada por el micrófono. Punto: se acabó el tiempo sin llegar a la meta.
      </p>
    </div>
  );
}
function LiveMetric({ value, target, unit }) {
  const ok = value >= target;
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: ok ? T.green : T.ink, fontVariantNumeric: "tabular-nums" }}>
        {value} <span style={{ fontSize: 13, fontWeight: 600, color: T.soft }}>/ {target} {unit}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: T.track, marginTop: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, (value / target) * 100)}%`, background: ok ? T.green : T.tint, borderRadius: 99, transition: "width .3s" }} />
      </div>
    </div>
  );
}

// =================== Progreso: XP, tiempo, racha, 8 niveles, canciones ===================
const LEVELS = [
  { id: "n1", n: "Superviviente", num: "1", meta: "Un acorde nítido", gate: "C suena limpio cinco veces seguidas: las cuatro cuerdas, sin zumbidos.", auto: null },
  { id: "n2", n: "Primeros cambios", num: "2", meta: "Dos acordes fluidos", gate: "Supera el nivel 2 del Reto: 14 cambios C y F en un minuto.", auto: (p) => !!(p.retoLevels && p.retoLevels[2]) },
  { id: "n3", n: "Cuatro acordes", num: "3", meta: "El ciclo pop entero", gate: "Supera el nivel 5 del Reto: el ciclo C, Am, F, G7 a 20 cambios.", auto: (p) => !!(p.retoLevels && p.retoLevels[5]) },
  { id: "n4", n: "Cancionero", num: "4", meta: "Cantar y tocar a la vez", gate: "Una canción entera cantando, sin parar aunque falles.", auto: null },
  { id: "n5", n: "Ritmo y dinámica", num: "5", meta: "Que suene con groove", gate: "Dos patrones de ritmo distintos y el chuck del patrón percusivo.", auto: null },
  { id: "n6", n: "Nuevos acordes", num: "6", meta: "G, Em y D dominados", gate: "Supera el nivel 8 del Reto: el gran ciclo G, Em, C, D.", auto: (p) => !!(p.retoLevels && p.retoLevels[8]) },
  { id: "n7", n: "Repertorio", num: "7", meta: "Cinco canciones", gate: "Cinco canciones de memoria, de principio a fin.", auto: null },
  { id: "n8", n: "Intérprete", num: "8", meta: "Tocar para alguien", gate: "Toca una canción delante de alguien. Irene cuenta.", auto: null },
];
const PRACTICE_GOAL_MIN = 1200; // 20 horas
const SESSION_GOAL = 75;

const ACHIEVEMENTS = [
  { id: "s1", n: "Primera sesión", icon: "play", test: (d) => d.sessions >= 1 },
  { id: "r3", n: "Racha de 3", icon: "flame", test: (d) => d.streak >= 3 },
  { id: "r7", n: "Semana en llamas", icon: "flame", test: (d) => d.streak >= 7 },
  { id: "r30", n: "Mes imparable", icon: "flame", test: (d) => d.streak >= 30 },
  { id: "reto1", n: "Primer reto", icon: "check", test: (d) => d.retoPassed >= 1 },
  { id: "cpm20", n: "Club de los 20", icon: "trophy", test: (d) => d.maxCpm >= 20 },
  { id: "reto8", n: "Reto completo", icon: "trophy", test: (d) => d.retoPassed >= 8 },
  { id: "h1", n: "Primera hora", icon: "clock", test: (d) => d.practiceMin >= 60 },
  { id: "h5", n: "5 horas", icon: "clock", test: (d) => d.practiceMin >= 300 },
  { id: "h10", n: "10 horas", icon: "clock", test: (d) => d.practiceMin >= 600 },
  { id: "h20", n: "Las 20 horas", icon: "star", test: (d) => d.practiceMin >= 1200 },
  { id: "ear5", n: "Oído fino", icon: "ear", test: (d) => d.earBest >= 5 },
  { id: "ear10", n: "Oído absoluto", icon: "ear", test: (d) => d.earBest >= 10 },
  { id: "n4", n: "Medio método", icon: "music", test: (d) => d.doneLevels >= 4 },
  { id: "n8", n: "Método completo", icon: "star", test: (d) => d.doneLevels >= 8 },
  { id: "s25", n: "25 sesiones", icon: "check", test: (d) => d.sessions >= 25 },
];

function Progreso({ progress, onSave, onShowIntro }) {
  const [playingSong, setPlayingSong] = useState(null);

  const doneLevels = LEVELS.filter((lv) => (lv.auto && lv.auto(progress)) || progress.levels[lv.id]).length;
  const retoPassed = Object.values(progress.retoLevels || {}).filter(Boolean).length;
  const sessions = (progress.sessions || []).length;
  const practiceMin = Math.floor((progress.practiceSec || 0) / 60);
  const streak = streakDays(progress.practiceDays);

  // Proporcional de verdad: la práctica manda
  const pctGlobal = Math.min(100, Math.round(100 * (
    0.45 * Math.min(practiceMin, PRACTICE_GOAL_MIN) / PRACTICE_GOAL_MIN +
    0.25 * doneLevels / LEVELS.length +
    0.15 * retoPassed / RETO_LEVELS.length +
    0.15 * Math.min(sessions, SESSION_GOAL) / SESSION_GOAL
  )));

  const validatedBonus = (progress.sessions || []).reduce((a, s) => a + (s.ok || 0) * 5, 0);
  const earOk = (progress.ear && progress.ear.ok) || 0;
  const derived = {
    sessions, retoPassed, doneLevels, practiceMin, streak,
    maxCpm: Math.max(0, ...Object.values(progress.bestCpm || {})),
    earBest: (progress.ear && progress.ear.best) || 0,
  };
  const unlockedAch = ACHIEVEMENTS.filter((a) => a.test(derived));
  const xp = practiceMin * 2 + sessions * 20 + validatedBonus + retoPassed * 50 + doneLevels * 150 + earOk * 2 + unlockedAch.length * 25;

  const toggle = (id) => {
    onSave((prev) => ({ ...prev, levels: { ...prev.levels, [id]: !prev.levels[id] } }));
  };

  const play = (song) => {
    if (playingSong) return;
    setPlayingSong(song.id);
    const ms = playSong(song.bars, song.beats);
    setTimeout(() => setPlayingSong(null), ms + 200);
  };

  const Row = ({ label, value, max, suffix }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
      <span style={{ fontSize: 13, color: T.soft, width: 92, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 99, background: T.track, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, (value / max) * 100)}%`, background: T.tint, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 13, color: T.ink, fontWeight: 600, fontVariantNumeric: "tabular-nums", width: 74, textAlign: "right" }}>
        {value}{suffix || `/${max}`}
      </span>
    </div>
  );

  const StatChip = ({ icon, value, label, color }) => (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: color || T.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontVariantNumeric: "tabular-nums" }}>
        <Icon d={icon} size={16} color={color || T.ink} /> {value}
      </div>
      <div style={{ fontSize: 11, color: T.soft, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );

  let unlocked = true;

  return (
    <div>
      {/* Estadísticas Duolingo-style */}
      <div style={{
        background: T.card, borderRadius: 16, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", display: "flex", padding: "14px 8px", marginBottom: 14,
      }}>
        <StatChip icon={IC.flame} value={streak} label={streak === 1 ? "día de racha" : "días de racha"} color={streak > 0 ? "#FF9500" : T.soft} />
        <div style={{ width: 1, background: T.hair }} />
        <StatChip icon={IC.clock} value={fmtTime(progress.practiceSec)} label="tocando" color={T.tint} />
        <div style={{ width: 1, background: T.hair }} />
        <StatChip icon={IC.check} value={xp} label="XP" color={T.green} />
      </div>

      {/* Barra de progreso global */}
      <div style={{
        background: T.card, borderRadius: 20, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", padding: "16px 18px", marginBottom: 22,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Tu camino a las 20 horas</span>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: T.tint, fontVariantNumeric: "tabular-nums" }}>{pctGlobal}%</span>
        </div>
        <div className="neu-inset" style={{ height: 12, borderRadius: 99, marginTop: 10, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pctGlobal}%`, borderRadius: 99,
            background: "linear-gradient(90deg, var(--tint), var(--green))",
            transition: "width .6s",
          }} />
        </div>
        <Row label="Minutos" value={Math.min(practiceMin, PRACTICE_GOAL_MIN)} max={PRACTICE_GOAL_MIN} suffix={` / ${PRACTICE_GOAL_MIN}`} />
        <Row label="Niveles" value={doneLevels} max={LEVELS.length} />
        <Row label="Reto" value={retoPassed} max={RETO_LEVELS.length} />
        <Row label="Sesiones" value={Math.min(sessions, SESSION_GOAL)} max={SESSION_GOAL} />
        <p style={{ fontSize: 12, color: T.faint, margin: "10px 0 0", lineHeight: 1.45 }}>
          El tiempo tocando pesa un 45%: no hay atajos, hay minutos.
        </p>
      </div>

      <SectionLabel>Recordatorio diario</SectionLabel>
      <div style={{
        background: T.card, borderRadius: 16, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", padding: "14px 16px", marginBottom: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: T.ink, cursor: "pointer", flex: 1 }}>
            <input type="checkbox" checked={!!(progress.reminder && progress.reminder.enabled)}
              onChange={async (e) => {
                const on = e.target.checked;
                if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
                  const perm = await Notification.requestPermission();
                  if (perm !== "granted") return;
                }
                onSave((prev) => ({ ...prev, reminder: { ...(prev.reminder || {}), enabled: on, time: (prev.reminder && prev.reminder.time) || "19:00" } }));
              }}
              style={{ accentColor: T.tint, width: 17, height: 17 }} />
            Avísame para practicar
          </label>
          <input type="time"
            value={(progress.reminder && progress.reminder.time) || "19:00"}
            onChange={(e) => onSave((prev) => ({ ...prev, reminder: { ...(prev.reminder || {}), time: e.target.value } }))}
            style={{
              fontFamily: FONT, fontSize: 14, fontWeight: 600, color: T.tint,
              background: T.fill, border: "none", borderRadius: 10, padding: "7px 10px",
            }} />
        </div>
        <p style={{ fontSize: 12, color: T.faint, margin: "8px 0 0", lineHeight: 1.45 }}>
          Funciona con la app abierta o en segundo plano. Protege la racha.
        </p>
      </div>

      <SectionLabel>Evolución del Reto</SectionLabel>
      <div style={{
        background: T.card, borderRadius: 16, border: `1px solid ${T.hair}`,
        boxShadow: "var(--shadow-card)", padding: "12px 12px 8px", marginBottom: 22,
      }}>
        <ChartCPM history={progress.history} />
        <div style={{ fontSize: 11, color: T.faint, textAlign: "center", paddingBottom: 4 }}>
          Cambios por minuto en tus últimos retos
        </div>
      </div>

      <SectionLabel>Logros · {unlockedAch.length}/{ACHIEVEMENTS.length}</SectionLabel>
      <div className="grid grid-cols-4 gap-2" style={{ marginBottom: 22 }}>
        {ACHIEVEMENTS.map((a) => {
          const got = a.test(derived);
          return (
            <div key={a.id} style={{
              background: T.card, borderRadius: 14, border: `1px solid ${got ? T.tint : T.hair}`,
              padding: "10px 4px 8px", textAlign: "center",
              boxShadow: got ? "var(--shadow-card)" : "none",
              opacity: got ? 1 : 0.45,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 99, margin: "0 auto 5px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: got ? T.tint : T.fill,
              }}>
                <Icon d={IC[a.icon]} size={16} color={got ? "#fff" : T.soft} />
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: got ? T.ink : T.soft, lineHeight: 1.25 }}>{a.n}</div>
            </div>
          );
        })}
      </div>

      <SectionLabel>Niveles y canciones</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {LEVELS.map((lv) => {
          const autoDone = lv.auto ? lv.auto(progress) : false;
          const done = !!progress.levels[lv.id] || autoDone;
          const isCurrent = unlocked && !done;
          const locked = !unlocked;
          if (!done) unlocked = false;
          const songsHere = SONGS.filter((s) => s.level === Number(lv.num));
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
                <div style={{ marginTop: 10, paddingLeft: 42, display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => toggle(lv.id)}
                    style={{
                      fontFamily: FONT, fontSize: 14, fontWeight: 600,
                      color: done ? T.soft : lv.auto ? T.tint : "#fff",
                      background: done ? T.fill : lv.auto ? "transparent" : T.tint,
                      border: lv.auto && !done ? `1px solid ${T.tint}` : "none",
                      borderRadius: 999, padding: "7px 16px",
                    }}
                    className="active:scale-[0.97] transition-transform">
                    {done ? "Desmarcar" : lv.auto ? "Marcar a mano" : "He pasado la puerta"}
                  </button>
                </div>
              )}
              {autoDone && (
                <div style={{ fontSize: 13, color: T.green, fontWeight: 600, marginTop: 8, paddingLeft: 42 }}>
                  Desbloqueado con el Reto
                </div>
              )}
              {songsHere.length > 0 && !locked && (
                <div style={{ marginTop: 12, paddingLeft: 42, display: "flex", flexDirection: "column", gap: 8 }}>
                  {songsHere.map((s) => (
                    <SongCard key={s.id} song={s} playing={playingSong === s.id} onPlay={() => play(s)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: T.faint, textAlign: "center", lineHeight: 1.5, margin: "0 12px" }}>
        Cada casilla de una canción es un compás. Las canciones son tradicionales o progresiones clásicas; para letras y
        más temas, busca los acordes en Ukutabs.
      </p>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button onClick={onShowIntro}
          style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: T.tint, background: "transparent", border: "none" }}>
          Ver la introducción de nuevo
        </button>
      </div>
    </div>
  );
}
function ChartCPM({ history = [] }) {
  const data = history.slice(-20);
  if (data.length < 2) {
    return (
      <div style={{ fontSize: 13, color: T.soft, textAlign: "center", padding: "14px 0" }}>
        Completa al menos dos retos para ver tu curva de progreso.
      </div>
    );
  }
  const W = 300, H = 110, padL = 26, padR = 8, padT = 10, padB = 20;
  const maxY = Math.max(30, ...data.map((d) => d.cpm));
  const x = (i) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / maxY) * (H - padT - padB);
  const pts = data.map((d, i) => `${x(i)},${y(d.cpm)}`).join(" ");
  const gridVals = [0, Math.round(maxY / 2), maxY];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke={T.track} strokeWidth="1" />
          <text x={padL - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill={T.soft} fontFamily={FONT}>{v}</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke={T.tint} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.cpm)} r="3.2" fill={T.tint} />
      ))}
      <text x={padL} y={H - 6} fontSize="9" fill={T.soft} fontFamily={FONT}>{data[0].date.slice(5)}</text>
      <text x={W - padR} y={H - 6} textAnchor="end" fontSize="9" fill={T.soft} fontFamily={FONT}>{data[data.length - 1].date.slice(5)}</text>
    </svg>
  );
}

function SongCard({ song, playing, onPlay }) {
  const strumName = (STRUM_PATTERNS.find((p) => p.id === song.strum) || {}).n || "";
  return (
    <div style={{ background: T.fill, borderRadius: 14, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{song.n}</div>
          <div style={{ fontSize: 11, color: T.soft, fontWeight: 600 }}>
            {song.origen} · {song.beats}/4 · Ritmo {strumName}
          </div>
        </div>
        <button onClick={onPlay} disabled={playing}
          style={{
            width: 34, height: 34, borderRadius: 99, flexShrink: 0,
            border: "none", background: playing ? T.track : T.tint,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          className="active:scale-[0.94] transition-transform">
          <Icon d={IC.play} size={13} filled color={playing ? T.soft : "#fff"} />
        </button>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "8px 0 6px" }}>
        {song.bars.map((ch, i) => (
          <button key={i} onClick={() => strumChord(ch)}
            style={{
              minWidth: 38, padding: "5px 6px", borderRadius: 8, border: `1px solid ${T.hair}`,
              background: T.card, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: T.tint,
            }}
            className="active:scale-[0.94] transition-transform">
            {ch}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: T.soft, lineHeight: 1.45 }}>{song.tip}</div>
    </div>
  );
}

// =================== Onboarding ===================
// Ilustraciones dedicadas (no los iconos genéricos de la UI)
function IllustUke() {
  return (
    <svg width="86" height="86" viewBox="0 0 86 86">
      <ellipse cx="43" cy="56" rx="17" ry="17" fill="var(--tint-soft)" stroke="var(--tint)" strokeWidth="2" />
      <ellipse cx="43" cy="40" rx="12" ry="12" fill="var(--tint-soft)" stroke="var(--tint)" strokeWidth="2" />
      <circle cx="43" cy="53" r="6" fill="var(--card)" stroke="var(--tint)" strokeWidth="2" />
      <rect x="40" y="10" width="6" height="22" rx="2" fill="var(--tint)" />
      <rect x="37.5" y="5" width="11" height="9" rx="3" fill="var(--tint)" />
      <g stroke="var(--ink)" strokeWidth="1" opacity="0.55">
        <line x1="41" y1="12" x2="41" y2="62" />
        <line x1="42.4" y1="12" x2="42.4" y2="62" />
        <line x1="43.8" y1="12" x2="43.8" y2="62" />
        <line x1="45.2" y1="12" x2="45.2" y2="62" />
      </g>
      <rect x="37" y="63" width="12" height="3.5" rx="1.5" fill="var(--tint)" />
      <g fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round">
        <path d="M63 30c3-2 3-6 0-8" />
        <path d="M67 34c5-4 5-12 0-16" />
      </g>
      <g fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round">
        <path d="M23 30c-3-2-3-6 0-8" />
        <path d="M19 34c-5-4-5-12 0-16" />
      </g>
    </svg>
  );
}
function IllustRing() {
  const R = 26, C = 2 * Math.PI * R;
  return (
    <svg width="86" height="86" viewBox="0 0 86 86">
      <circle cx="43" cy="43" r={R} fill="none" stroke="var(--track)" strokeWidth="7" />
      <circle cx="43" cy="43" r={R} fill="none" stroke="var(--tint)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * 0.3} transform="rotate(-90 43 43)" />
      <path d="M39 34.5v17l13-8.5z" fill="var(--tint)" />
      <g fill="var(--green)">
        <circle cx="70" cy="22" r="3" />
        <circle cx="76" cy="34" r="2.2" />
      </g>
      <path d="M64 55l3.5 3.5L74 51" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="none" stroke="var(--soft)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7">
        <path d="M12 28h7 M9 36h10 M12 44h7" />
      </g>
    </svg>
  );
}
function IllustFlame() {
  return (
    <svg width="86" height="86" viewBox="0 0 86 86">
      <path d="M43 12c4 10-4 13-4 21a8.5 8.5 0 0 0 17 1.5C60.5 39 66 44.5 66 54a23 23 0 0 1-46 0c0-10 6.5-15 10-22 2.4 4.4 5.4 6 5.4 6C33.5 27 37.5 20 43 12z"
        fill="#FF9500" opacity="0.9" />
      <path d="M43 34c2.5 6-2.5 8-2.5 13a8 8 0 0 0 16 .8C58 51 60 54 60 59a17 17 0 0 1-34 0c0-6 4-9 6-13 1.5 2.7 3.3 3.7 3.3 3.7C34.5 43 39.5 39 43 34z"
        fill="#FFCC00" />
      <g fill="none" stroke="var(--tint)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M14 20v10 M9 25h10" />
      </g>
      <g fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M70 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--green)" stroke="none" opacity="0.85" />
      </g>
    </svg>
  );
}

const INTRO = [
  {
    Illust: IllustUke, title: "Cuatro cuerdas y tú",
    body: "Sol, Do, Mi, La: así se llaman tus nuevas compañeras. En la primera pestaña las afinas con el micrófono, escuchando de verdad. Y un secreto antes de empezar: no lo agarres fuerte. El ukelele se toca relajado, apoyado en el antebrazo, como quien no quiere la cosa.",
  },
  {
    Illust: IllustRing, title: "15 minutos que sí cumplen",
    body: "Nada de sesiones maratonianas que se abandonan el jueves. Aquí tocas un ratito cada día: la Rutina te lleva fase a fase, el micrófono comprueba que lo haces, y cada minuto alimenta tu racha. En unas semanas estarás tocando canciones de verdad.",
  },
  {
    Illust: IllustFlame, title: "Te aviso de dos cosas",
    body: "Las yemas te van a doler la primera semana o dos. Nos pasa a todos, y un buen día simplemente deja de pasar. Y sonarás regular al principio: bienvenido al club, nadie nació rasgueando. Tú ve lento y limpio. Nos vemos en el nivel 8.",
  },
];
function Onboarding({ onDone }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState("right");
  const touch = useRef(null);
  const s = INTRO[i];
  const last = i === INTRO.length - 1;

  const go = (n) => {
    if (n < 0 || n >= INTRO.length) return;
    setDir(n > i ? "right" : "left");
    setI(n);
  };
  const onTouchStart = (e) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    const t = touch.current;
    if (!t) return;
    touch.current = null;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) go(i + 1);
    else go(i - 1);
  };

  const Illust = s.Illust;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: T.headerBg,
      backdropFilter: "saturate(180%) blur(24px)",
      WebkitBackdropFilter: "saturate(180%) blur(24px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div key={i} className={dir === "right" ? "tab-in-right" : "tab-in-left"} style={{
        background: T.card, borderRadius: 24, border: `1px solid ${T.hair}`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)", padding: "26px 24px",
        maxWidth: 340, width: "100%", textAlign: "center",
      }}>
        <div className="neu" style={{
          width: 96, height: 96, borderRadius: 28, margin: "0 auto 16px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Illust />
        </div>
        <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", color: T.ink, marginBottom: 8 }}>{s.title}</div>
        <div style={{ fontSize: 14.5, color: T.soft, lineHeight: 1.55, marginBottom: 18 }}>{s.body}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16 }}>
          {INTRO.map((_, j) => (
            <button key={j} onClick={() => go(j)}
              style={{
                width: j === i ? 20 : 7, height: 7, borderRadius: 99, border: "none", padding: 0,
                background: j === i ? T.tint : T.track, transition: "all .25s",
              }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {i > 0 && (
            <Button kind="gray" onClick={() => go(i - 1)} style={{ padding: "13px 18px" }}>
              <span style={{ display: "inline-block", transform: "rotate(180deg)" }}><Icon d={IC.chev} size={14} /></span>
            </Button>
          )}
          <Button onClick={() => (last ? onDone() : go(i + 1))} style={{ flex: 1, padding: "13px 0" }}>
            {last ? "A tocar" : "Siguiente"}
          </Button>
        </div>
        {!last && (
          <button onClick={onDone}
            style={{ marginTop: 10, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: T.soft, background: "transparent", border: "none" }}>
            Saltar
          </button>
        )}
        <div style={{ fontSize: 11, color: T.faint, marginTop: 8 }}>Desliza para moverte entre pantallas</div>
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
  { id: "progreso", label: "Progreso" },
];

export default function App() {
  const [tab, setTab] = useState("afinar");
  const [dir, setDir] = useState("right");
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [moreTabs, setMoreTabs] = useState(true);
  const [showIntro, setShowIntro] = useState(false);
  const tabsRef = useRef(null);
  const pillRefs = useRef({});
  const touchRef = useRef(null);

  useEffect(() => {
    loadProgress().then((p) => {
      setProgress(p);
      if (!p.onboarded) setShowIntro(true);
    });
  }, []);

  const closeIntro = useCallback(() => {
    setShowIntro(false);
    handleSaveRef.current((prev) => ({ ...prev, onboarded: true }));
  }, []);

  const handleSave = useCallback((updater) => {
    setProgress((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveProgress(next);
      return next;
    });
  }, []);
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  // Tiempo con la app abierta
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") {
        handleSave((prev) => ({ ...prev, appSec: (prev.appSec || 0) + 15 }));
      }
    }, 15000);
    return () => clearInterval(iv);
  }, [handleSave]);

  // Recordatorio diario
  useEffect(() => {
    const check = () => {
      handleSave((prev) => {
        const r = prev.reminder || {};
        if (!r.enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return prev;
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        if (r.last === today) return prev;
        const [hh, mm] = (r.time || "19:00").split(":").map(Number);
        if (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm)) {
          // Si ya practicó hoy, no molestar
          if ((prev.practiceDays || {})[today] > 0) {
            return { ...prev, reminder: { ...r, last: today } };
          }
          notifyPractice();
          return { ...prev, reminder: { ...r, last: today } };
        }
        return prev;
      });
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [handleSave]);

  const goTo = (id, direction) => {
    setDir(direction);
    setTab(id);
  };
  const selectTab = (id) => {
    const from = TABS.findIndex((t) => t.id === tab);
    const to = TABS.findIndex((t) => t.id === id);
    goTo(id, to >= from ? "right" : "left");
  };

  // Centrar la pestaña activa en la barra
  useEffect(() => {
    const el = pillRefs.current[tab];
    if (el) el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [tab]);

  // Indicador de "hay más" a la derecha
  const onTabsScroll = () => {
    const el = tabsRef.current;
    if (!el) return;
    setMoreTabs(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  // Swipe entre pestañas
  const onTouchStart = (e) => {
    const t = e.target;
    if (t && t.closest && (t.closest(".tabs-scroll") || t.closest("input"))) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    const s = touchRef.current;
    if (!s) return;
    touchRef.current = null;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = TABS.findIndex((t) => t.id === tab);
    if (dx < 0 && i < TABS.length - 1) goTo(TABS[i + 1].id, "right");
    if (dx > 0 && i > 0) goTo(TABS[i - 1].id, "left");
  };

  const streak = streakDays(progress.practiceDays);

  return (
    <div style={{ background: T.bg, fontFamily: FONT, minHeight: "100vh", color: T.ink, WebkitFontSmoothing: "antialiased" }}
      className="w-full flex justify-center">
      {showIntro && <Onboarding onDone={closeIntro} />}
      <div className="w-full" style={{ maxWidth: 480 }}>

        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: T.headerBg,
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          borderBottom: `1px solid ${T.hair}`,
          padding: "14px 16px 10px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.022em", lineHeight: 1.1, margin: 0 }}>
                Ukelele Fácil
              </h1>
              <p style={{ color: T.soft, fontSize: 13, margin: "3px 0 0" }}>15 minutos al día</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: T.fill, borderRadius: 999, padding: "5px 10px",
                fontSize: 13, fontWeight: 700, color: streak > 0 ? "#FF9500" : T.soft,
                fontVariantNumeric: "tabular-nums",
              }}>
                <Icon d={IC.flame} size={14} color={streak > 0 ? "#FF9500" : T.soft} /> {streak}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: T.fill, borderRadius: 999, padding: "5px 10px",
                fontSize: 13, fontWeight: 700, color: T.tint, fontVariantNumeric: "tabular-nums",
              }}>
                <Icon d={IC.clock} size={14} color={T.tint} /> {fmtTime(progress.practiceSec)}
              </span>
            </div>
          </div>

          <div style={{ position: "relative", marginTop: 12 }}>
            <div ref={tabsRef} className="tabs-scroll" onScroll={onTabsScroll}>
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <button key={t.id} ref={(el) => { pillRefs.current[t.id] = el; }}
                    onClick={() => selectTab(t.id)}
                    style={{
                      flex: "0 0 auto", minWidth: "22.5%", border: "none", borderRadius: 999,
                      padding: "8px 14px", whiteSpace: "nowrap",
                      fontFamily: FONT, fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em",
                      color: active ? "#fff" : T.ink,
                      background: active ? T.tint : T.fill,
                      transition: "all .18s",
                    }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
            {moreTabs && (
              <div style={{
                position: "absolute", top: 0, right: -2, bottom: 2, width: 44,
                background: "linear-gradient(90deg, transparent, var(--bg))",
                display: "flex", alignItems: "center", justifyContent: "flex-end",
                pointerEvents: "none",
              }}>
                <Icon d={IC.chev} size={15} color={T.soft} />
              </div>
            )}
          </div>
        </div>

        <div key={tab} className={dir === "right" ? "tab-in-right" : "tab-in-left"}
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
          style={{ padding: "18px 16px 40px" }}>
          {tab === "afinar" && <Afinador progress={progress} onSave={handleSave} />}
          {tab === "acordes" && <Acordes progress={progress} onSave={handleSave} />}
          {tab === "rasgueo" && <Rasgueo />}
          {tab === "reto" && <Reto progress={progress} onSave={handleSave} />}
          {tab === "rutina" && <Rutina progress={progress} onSave={handleSave} />}
          {tab === "progreso" && <Progreso progress={progress} onSave={handleSave} onShowIntro={() => setShowIntro(true)} />}

          <p style={{ color: T.faint, fontSize: 12, textAlign: "center", marginTop: 28 }}>
            Lento y limpio gana a rápido y sucio.
          </p>
        </div>
      </div>
    </div>
  );
}
