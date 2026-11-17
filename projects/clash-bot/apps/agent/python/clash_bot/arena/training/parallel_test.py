import unittest
from unittest.mock import patch

from clash_bot.arena.training.parallel import MAX_WORKERS, Workers, play_frozen_game


class WorkersTest(unittest.TestCase):
    def test_workers_are_bounded_and_single_worker_keeps_order(self):
        for count in (0, MAX_WORKERS + 1):
            with self.assertRaises(ValueError):
                Workers(count)
        with Workers(1) as workers:
            self.assertIsNone(workers.pool)
            with self.assertRaises(ValueError):
                workers.map(play_frozen_game, [{}, {}])
            with patch(
                "clash_bot.arena.training.parallel.play_frozen_game",
                return_value={"completed": True},
            ) as play:
                self.assertEqual(
                    workers.map(play, [{"id": "same-frozen-game"}]), [{"completed": True}]
                )
                play.assert_called_once_with({"id": "same-frozen-game"})


if __name__ == "__main__":
    unittest.main()
