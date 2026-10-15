// Shared pickup catalogue: simulation, in-world colours and HUD timers agree.
export const POWERUPS = {
  machine: { label: "MACHINE GUN", color: "gold", duration: 12, weight: 11 },
  laser: { label: "TWIN LASERS", color: "cyan", duration: 12, weight: 11 },
  missile: { label: "MISSILE +1", color: "orange", weight: 17 },
  shield: { label: "SHIELD", color: "mint", duration: 8, weight: 11 },
  speed: { label: "SPEED BOOST", color: "violet", duration: 15, weight: 11 },
  orbit: { label: "ORBITAL GUARD", color: "mint", duration: 10, weight: 30 },
  wingmen: { label: "WING ORBS", color: "cyan", duration: 12, weight: 8 },
  spread: { label: "TRIPLE WING ORBS", color: "pink", duration: 12, weight: 8 },
  scatter: { label: "SCATTER BOMBS", color: "orange", duration: 12, weight: 8 },
  mega: { label: "MEGA LASER", color: "gold", duration: 12, weight: 8 },
  fleet: { label: "CALL IN THE FLEET", color: "cyan", duration: 10, weight: 8 },
  emp: { label: "EMP PULSE", color: "cyan", duration: 5, weight: 8 },
  chain: { label: "CHAIN LIGHTNING", color: "violet", duration: 12, weight: 8 },
  assault: { label: "ASSAULT FLEET", color: "orange", duration: 20, weight: 8 },
};

export function supplyPower(roll) {
  const total = Object.values(POWERUPS).reduce(
    (sum, config) => sum + config.weight,
    0,
  );
  let threshold = 0;
  for (const [power, { weight }] of Object.entries(POWERUPS)) {
    threshold += weight;
    if (roll * total < threshold) return power;
  }
  return "mega";
}
