export const PERSONAL_BEST_KEY = "1minus1:neon-shooter:personal-bests";

const browserStorage = () => window.localStorage;

export function readPersonalBests(getStorage = browserStorage) {
  try {
    const saved = JSON.parse(getStorage().getItem(PERSONAL_BEST_KEY));
    if (
      Number.isSafeInteger(saved?.score) &&
      Number.isSafeInteger(saved?.wave) &&
      saved.wave >= 0
    )
      return { score: saved.score, wave: saved.wave };
  } catch {
    // Storage can be disabled, unavailable, or contain an invalid record.
  }
  return null;
}

function report(label, value, previous) {
  if (previous === undefined || value > previous) return `New best ${label}!`;
  if (value === previous) return `Best ${label} matched`;
  return `${label === "score" ? "Score" : "Wave"} below best`;
}

export function completeRun(previous, run, getStorage = browserStorage) {
  const best = {
    score: Math.max(previous?.score ?? run.score, run.score),
    wave: Math.max(previous?.wave ?? run.wave, run.wave),
  };
  try {
    getStorage().setItem(PERSONAL_BEST_KEY, JSON.stringify(best));
  } catch {
    // Keep the in-memory record even when the browser cannot persist it.
  }
  return {
    best,
    scoreReport: report("score", run.score, previous?.score),
    waveReport: report("wave", run.wave, previous?.wave),
  };
}
