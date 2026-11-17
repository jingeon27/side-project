"""A side's elixir as anyone can count it: the clock and the costs of its confirmed plays."""


class ElixirLedger:
    """One side's public elixir: the clock and its confirmed costs; overflow is discarded.

    50ms ticks, 2.8s/elixir, 2x from 120s and 3x after 240s are pinned native rules. A tick adds
    125/7 milli-elixir, so the balance is kept in sevenths of a milli-elixir: exact integers that
    cannot drift. Tests compare with native balances.
    """

    CAP = 10000 * 7

    def __init__(self, balance=5000 * 7, tick=0):
        self.balance, self.tick = balance, tick

    def copy(self):
        return ElixirLedger(self.balance, self.tick)

    def accrued(self, tick):
        edges = sorted(
            {self.tick, tick, *[edge for edge in (2400, 4800) if self.tick < edge < tick]}
        )
        gain = sum(
            125 * (b - a) * (1 if a < 2400 else 2 if a < 4800 else 3)
            for a, b in zip(edges, edges[1:])
        )
        return min(self.CAP, self.balance + gain)

    def spend(self, tick, cost):
        self.balance, self.tick = self.accrued(tick) - cost * 7000, tick

    def at(self, tick):
        return self.accrued(tick) / 7 / 1000


def public_mana(history, tick, team):
    """A side's elixir at `tick`, from the public record alone."""
    ledger = ElixirLedger()
    for event in history:
        if event["tick"] > tick:
            break
        for play in event["plays"]:
            if play["team"] == team:
                ledger.spend(event["tick"], play["cost"])
    return ledger.at(tick)
