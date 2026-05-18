// Shared chat notification sound. Settings live in localStorage so both
// the background tab-alert and the in-chat "test" button stay in sync.
export const SOUND_KEY = "phdapp.chatSoundType"; // "chime" | "ding" | "pop" | "none"
export const VOL_KEY = "phdapp.chatVol"; // "0".."1"
// Legacy mute flag (pre-dates the type selector) — treat "1" as "none".
const LEGACY_MUTE = "phdapp.muteChat";

export type SoundType = "chime" | "ding" | "pop" | "none";

export function getSoundType(): SoundType {
  if (typeof window === "undefined") return "chime";
  if (window.localStorage.getItem(LEGACY_MUTE) === "1") return "none";
  const v = window.localStorage.getItem(SOUND_KEY);
  return v === "ding" || v === "pop" || v === "none" || v === "chime"
    ? v
    : "chime";
}

export function getVolume(): number {
  if (typeof window === "undefined") return 0.15;
  const v = parseFloat(window.localStorage.getItem(VOL_KEY) ?? "");
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.15;
}

let ctx: AudioContext | null = null;

/** Play the configured notification sound (best-effort; never throws). */
export function playChatSound(force?: { type?: SoundType; vol?: number }) {
  try {
    if (typeof window === "undefined") return;
    const type = force?.type ?? getSoundType();
    if (type === "none") return;
    const vol = force?.vol ?? getVolume();
    if (vol <= 0) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const tone = (
      freq: number,
      start: number,
      dur: number,
      shape: OscillatorType = "sine",
    ) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = shape;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, vol),
        t + start + 0.02,
      );
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g);
      g.connect(ctx!.destination);
      o.start(t + start);
      o.stop(t + start + dur);
    };
    if (type === "chime") {
      tone(660, 0, 0.15);
      tone(880, 0.16, 0.22);
    } else if (type === "ding") {
      tone(1046, 0, 0.35, "triangle");
    } else {
      // pop
      tone(420, 0, 0.09, "square");
    }
  } catch {
    // audio blocked until a user gesture — ignore
  }
}
