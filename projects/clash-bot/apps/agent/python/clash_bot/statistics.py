"""The shared exact paired win test; ties do not enter the binomial sample."""


def paired_win_probability(wins, losses):
    if type(wins) is not int or type(losses) is not int or wins < 0 or losses < 0:
        raise ValueError("Expected nonnegative integer paired win/loss counts")
    decisive = wins + losses
    if decisive == 0:
        return 1.0
    # Keep SciPy's initialization out of the live inference startup path.
    from scipy.stats import binomtest

    return float(binomtest(wins, decisive, p=0.5, alternative="greater").pvalue)
