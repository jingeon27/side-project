"""Value-based policy improvement; compulsory exploration visits are not expert labels.

Exponentially tilt the unnoised prior by searched action values, within a KL budget.
The estimated value can improve; imperfect short-horizon estimates do not guarantee wins.
"""

import numpy as np

from ..policy.learning_spec import SPEC


def improved_policy(prior, values, visits):
    prior, values, visits = map(lambda x: np.asarray(x, np.float64), (prior, values, visits))
    if (
        len(prior) == 0
        or prior.shape != values.shape
        or prior.shape != visits.shape
        or not all(np.isfinite(x).all() for x in (prior, values, visits))
        or np.any(prior < 0)
        or np.any(visits < 0)
        or not np.any(visits > 0)
    ):
        raise ValueError("Invalid searched policy improvement")
    supported = visits > 0
    base = np.where(supported, prior, 0)
    if base.sum() <= 0:
        raise ValueError("Visited actions have no prior support")
    base /= base.sum()
    centered = values - values[supported].max()

    def tilted(scale):
        weighted = base * np.exp(np.clip(centered * scale, -700, 0))
        return weighted / weighted.sum()

    def kl(target):
        positive = target > 0
        return float(np.sum(target[positive] * np.log(target[positive] / base[positive])))

    low, high = 0.0, 1 / SPEC.temperature
    if kl(tilted(high)) <= SPEC.maxKL:
        low = high
    else:
        for _ in range(32):
            middle = (low + high) / 2
            if kl(tilted(middle)) > SPEC.maxKL:
                high = middle
            else:
                low = middle
    target = tilted(low)
    return {
        "target": target.astype(np.float32),
        "targetPolicy": SPEC.target,
        "targetKL": kl(target),
        "priorValue": float(base @ values),
        "targetValue": float(target @ values),
    }
