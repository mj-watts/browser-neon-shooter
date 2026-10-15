export const BATTLE_HISTORY_KEY = "1minus1:neon-shooter:past-battles";
const browserStorage = () => window.localStorage;

export function readBattles(getStorage = browserStorage) {
  try {
    const saved = JSON.parse(getStorage().getItem(BATTLE_HISTORY_KEY));
    if (Array.isArray(saved))
      return saved
        .filter(isBattle)
        .slice(0, 10)
        .map(({ score, wave, kills }) => ({ score, wave, kills }));
  } catch {
    // History is optional when storage is blocked or corrupt.
  }
  return [];
}

export function recordBattle(
  previous,
  { score, wave, kills },
  getStorage = browserStorage,
) {
  const battles = [{ score, wave, kills }, ...previous].slice(0, 10);
  try {
    getStorage().setItem(BATTLE_HISTORY_KEY, JSON.stringify(battles));
  } catch {
    // Keep this session's history if storage is unavailable or full.
  }
  return battles;
}

const BEST_BATTLE_KEY = "1minus1:neon-shooter:best-battle";

function isBattle(battle) {
  return (
    Number.isSafeInteger(battle?.score) &&
    Number.isSafeInteger(battle?.wave) &&
    battle.wave >= 0 &&
    Number.isSafeInteger(battle?.kills) &&
    battle.kills >= 0
  );
}

function betterBattle(previous, next) {
  if (!previous) return next;
  for (const field of ["score", "wave", "kills"]) {
    if (next[field] !== previous[field])
      return next[field] > previous[field] ? next : previous;
  }
  return previous;
}

export function readBestBattle(history = [], getStorage = browserStorage) {
  let best = null;
  try {
    const saved = JSON.parse(getStorage().getItem(BEST_BATTLE_KEY));
    if (isBattle(saved)) best = saved;
  } catch {
    // Older sessions can still recover a best battle from their history.
  }
  return history.reduce(betterBattle, best);
}

export function recordBestBattle(previous, run, getStorage = browserStorage) {
  const { score, wave, kills } = betterBattle(previous, run);
  const best = { score, wave, kills };
  try {
    getStorage().setItem(BEST_BATTLE_KEY, JSON.stringify(best));
  } catch {
    // Preserve the best battle in memory when persistence is unavailable.
  }
  return best;
}
