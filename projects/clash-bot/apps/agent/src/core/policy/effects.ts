import { PLACEMENT_EFFECTS } from '../combat-reference.ts';

// Contacts at the observed locations. Poison exposure and future movement are
// NOT asserted: a snapshot does not prove eight seconds of damage.
export function observedContacts(
  card: string | null,
  target: readonly [number, number],
  enemies: ReadonlyArray<readonly [string, number, number, string]>,
): number | null {
  if (!['ice_wizard', 'barbarian_barrel', 'poison'].includes(card ?? '')) return null;
  return enemies.filter(([kind, x, y]) => {
    if (card === 'barbarian_barrel')
      return (
        PLACEMENT_EFFECTS.knownGroundBodies.includes(kind) &&
        Math.abs(x - target[0]) <= PLACEMENT_EFFECTS.barbarian_barrel.width / 2 &&
        y >= target[1] &&
        y <= target[1] + PLACEMENT_EFFECTS.barbarian_barrel.length
      );
    const radius =
      card === 'ice_wizard' ? PLACEMENT_EFFECTS.ice_wizard.radius : PLACEMENT_EFFECTS.poison.radius;
    return Math.hypot(x - target[0], y - target[1]) <= radius;
  }).length;
}
