import unittest
from unittest.mock import patch

from clash_bot.arena.parallel import play_frozen_games


class ParallelSelfplayTest(unittest.TestCase):
    def test_workers_are_bounded_and_single_worker_keeps_order(self):
        for workers in (0,5):
            with self.assertRaises(ValueError):play_frozen_games([],workers)
        with self.assertRaises(ValueError):play_frozen_games([{},{}],1)
        with patch('clash_bot.arena.parallel.play_frozen_game',return_value={'completed':True}) as play:
            self.assertEqual(play_frozen_games([{'id':'same-frozen-game'}],1),[{'completed':True}])
            play.assert_called_once_with({'id':'same-frozen-game'})


if __name__ == '__main__':
    unittest.main()
