import unittest
from unittest.mock import patch

from clash_bot.arena.evaluation import evaluate, paired_gate, pfsp_weights
from clash_bot.arena.policy import Policy


class QualificationTest(unittest.TestCase):
    def test_late_alpha_spending_increases_the_budget_instead_of_permanently_blocking_promotion(self):
        challenger = Policy(seed=1, metadata={'version': 1, 'rulesID': 'rules-a'})
        champion = Policy(seed=2, metadata={'version': 0, 'rulesID': 'rules-a'})
        def game(models, *args, **kwargs):
            return {'completed': True, 'rejectedCommands': 0, 'winner': 0 if models[0] is challenger else 1, 'samples': []}
        with patch('clash_bot.arena.evaluation.play_game', side_effect=game):
            result = evaluate(challenger, champion, 'rules-a', 10000, pairs=16)
        self.assertGreater(result['requestedPairs'], 16)
        self.assertEqual(len(result['games']), 2*result['requestedPairs'])
        self.assertTrue(result['gate']['passed'])

    def test_ties_small_samples_and_nonfinite_results_cannot_promote(self):
        for scores in ([1] * 4, [.5] * 64, [0] * 32, [float('nan')]):
            self.assertFalse(paired_gate(scores)['passed'])
        self.assertTrue(paired_gate([1] * 16)['passed'])
        self.assertGreater(pfsp_weights([.1, .9])[0], pfsp_weights([.1, .9])[1])

    def test_evaluation_swaps_seats_reuses_pair_seed_and_disables_training(self):
        a = Policy(metadata={'version': 1, 'rulesID': 'rules-a'})
        b = Policy(metadata={'version': 0, 'rulesID': 'rules-a'})
        before = (a.checksum(), b.checksum())
        game = {'completed': True, 'rejectedCommands': 0, 'winner': 0, 'samples': []}
        with patch('clash_bot.arena.evaluation.play_game', return_value=game) as play:
            result = evaluate(a, b, 'rules-a', 0, pairs=2, simulations=4)
        self.assertEqual(result['pairs'], [.5, .5])
        self.assertFalse(result['gate']['passed'])
        self.assertEqual((a.checksum(), b.checksum()), before)
        calls = play.call_args_list
        self.assertEqual(calls[0].args[1], calls[1].args[1])
        self.assertTrue(calls[0].args[1].startswith('holdout-'))
        self.assertIs(calls[0].args[0][0], a)
        self.assertIs(calls[1].args[0][1], a)
        self.assertTrue(all(call.kwargs['training'] is False for call in calls))
        with patch('clash_bot.arena.evaluation.play_game', return_value={**game, 'completed': False}):
            with self.assertRaisesRegex(ValueError, 'Unverified'):
                evaluate(a, b, 'rules-a', 0, pairs=1)

    def test_rule_mismatch_and_interrupted_evaluation_do_not_promote(self):
        a = Policy(metadata={'version': 1, 'rulesID': 'rules-a'})
        with self.assertRaisesRegex(ValueError, 'another rule'):
            evaluate(a, a, 'rules-b', 0)
        result = evaluate(a, a, 'rules-a', 0, should_stop=lambda: True)
        self.assertFalse(result['complete'])
        self.assertEqual(result['gate']['reason'], 'interrupted_evaluation')


if __name__ == '__main__':
    unittest.main()
