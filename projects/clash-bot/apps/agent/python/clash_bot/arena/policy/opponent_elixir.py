"""The live screen's bound on the opponent's elixir, without the battle engine."""


def clamp(amount):
    return max(0, min(10, amount))


class OpponentElixir:
    """The live upper bound on the opponent's elixir; its lower bound is always 0.

    The same arithmetic as ElixirLedger.snapshot in src/core/battle/elixir-ledger.ts, one sample
    of our own bar at a time; test-fixtures/opponent-elixir-cases.json holds both to it. Both
    sides regenerate alike, so our bar and spending bound the shared gain. While our bar is full
    the gain cannot be read from it and the fastest rate is assumed. A play the screen did not
    recognize is never subtracted.
    """

    def __init__(self, at, amount):
        amount = clamp(amount)
        self.first = amount
        self.at, self.amount = at, amount
        self.own_spent = 0
        self.shared = 0.2
        self.leak = 0
        self.upper = clamp(amount + 0.2)

    def sample(self, at, amount, own_spent, opponent_spent):
        """`at` in seconds; the costs are those since the previous sample."""
        amount = clamp(amount)
        observable = amount - self.amount + own_spent
        if amount >= 9.75 or self.amount >= 9.75:
            self.leak += max(0, (at - self.at) * (3 / 2.8) - max(0, observable))
        self.own_spent += own_spent
        shared = max(self.shared, amount + 0.2 + self.own_spent + self.leak - self.first)
        self.upper = clamp(max(0, self.upper - opponent_spent) + shared - self.shared)
        self.shared = shared
        self.at, self.amount = at, amount
        return self.upper
