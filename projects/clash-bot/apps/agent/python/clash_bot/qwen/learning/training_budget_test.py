import unittest
from unittest.mock import Mock

from clash_bot.qwen.learning.training_budget import TrainingBudget


class TrainingBudgetTest(unittest.TestCase):
    def budget(self, seconds=1):
        ticks = iter([0, seconds])
        return TrainingBudget(0.9, Mock(), clock=lambda: next(ticks), sleep=Mock())

    def test_completed_gpu_work_is_followed_by_bounded_rest(self):
        budget = self.budget()
        with budget.work():
            pass
        budget.synchronize.assert_called_once()
        rest = budget.sleep.call_args.args[0]
        self.assertGreater(rest, 0.1)
        self.assertLess(rest, 1)
        self.assertEqual(budget.snapshot()["cycles"], 1)
        self.assertFalse(budget.snapshot()["hardCap"])

    def test_over_budget_window_reduces_duty_and_idle_window_recovers(self):
        busy = self.budget()
        busy.samples.extend([1] * 20)
        with busy.work():
            pass
        idle = self.budget()
        idle.samples.extend([0.2] * 20)
        with idle.work():
            pass
        self.assertLess(busy.duty, idle.duty)
        self.assertGreater(busy.rest_seconds, idle.rest_seconds)

    def test_failed_work_does_not_sleep_or_hide_the_error(self):
        budget = self.budget()
        with self.assertRaisesRegex(ValueError, "invalid sample"):
            with budget.work():
                raise ValueError("invalid sample")
        budget.sleep.assert_not_called()
        budget.synchronize.assert_not_called()

    def test_long_work_does_not_exceed_a_two_second_rest(self):
        budget = self.budget(120)
        with budget.work():
            pass
        budget.sleep.assert_called_once_with(2)
        for value in (0, 1, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                TrainingBudget(value, Mock())


if __name__ == "__main__":
    unittest.main()
