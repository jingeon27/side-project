from datetime import datetime, timedelta, timezone
import tempfile
import unittest

from clash_bot.arena.balance import Articles, changed_fields, old_enough, relevant_rows
from clash_bot.arena.league import initialize


class BalanceContractsTest(unittest.TestCase):
    def test_unrelated_merge_mode_is_excluded_and_recent_releases_wait(self):
        parser = Articles()
        parser.feed('<a href="/en/games/clashroyale/blog/a/">October Balance Changes</a>'
                    '<a href="/en/games/clashroyale/blog/b/">Merge Tactics Balance Changes</a>')
        self.assertEqual([row['title'] for row in parser.links], ['October Balance Changes'])
        now = datetime.now(timezone.utc)
        asset = {'upload_time_iso_8601': (now - timedelta(hours=23)).isoformat()}
        self.assertFalse(old_enough(asset, now))
        self.assertTrue(old_enough({**asset, 'upload_time_iso_8601': (now - timedelta(hours=25)).isoformat()}, now))

    def test_child_unit_changes_are_reported_and_rule_changes_require_new_league(self):
        base = {'cards': [{'name': 'Knight', 'speed': 60}], 'units': {'FireSpirit': {'name': 'FireSpirit', 'damage': 10}}}
        next_table = {**base, 'units': {'FireSpirit': {'name': 'FireSpirit', 'damage': 12}}}
        self.assertEqual(changed_fields(relevant_rows(base), relevant_rows(next_table)),
                         [{'field': 'units.FireSpirit.damage', 'before': 10, 'after': 12}])
        with tempfile.TemporaryDirectory() as directory:
            initialize(directory, {'id': 'rules-a'})
            with self.assertRaisesRegex(ValueError, 'separate league'):
                initialize(directory, {'id': 'rules-b'})


if __name__ == '__main__':
    unittest.main()
