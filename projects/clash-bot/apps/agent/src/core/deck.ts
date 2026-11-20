// 양쪽 모두 이 덱으로 두는 미러전이다. 자가대국의 실전 덱(contracts/arena.json의 liveDeck)과 같다.
export const LIVE_DECK = [
  'barbarian_barrel',
  'furnace',
  'goblin_hut',
  'graveyard',
  'ice_wizard',
  'knight',
  'poison',
  'skeletons',
] as const;
// Visible deck portraits are verified by assertDecks; charge counts are the
// versioned reference rules, not a read of the site's internal game state.
export const LIVE_DECK_EVOLUTIONS = { knight: 2, furnace: 2 } as const;
