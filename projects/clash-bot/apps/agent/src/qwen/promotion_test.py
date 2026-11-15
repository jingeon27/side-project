import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
import unittest

import mlx.core as mx

from learning_policy import FinalMLPLoRA, Learner, atomic_json, weights_digest
from learning_worker import LearningWorker
from promotion import publish


def fixture(directory, tied=False):
    mx.random.seed(7)
    data = Path(directory) / 'data'
    root = data / 'qwen/learning'
    learner = Learner(FinalMLPLoRA(12, 8), mx.ones(8), 1e-6, mx.random.normal((3, 8)), root)
    sample = {'features': mx.ones(12), 'base': mx.arange(8).astype(mx.float32), 'labels': [0, 1, 2],
              'version': 0, 'chosen': 1, 'remaining': 0}
    sample['old_log_probs'] = mx.stop_gradient(learner.log_probs(sample))
    learner.train([sample], 1, 'bootstrap')
    atomic_json(root / 'promotion-policy.json', {'enabled': True})
    private = data / 'arena/qwen/training/private'
    source = root / 'checkpoints/v000001'
    shutil.copytree(source, private / 'checkpoints/v000001')
    atomic_json(private / 'current.json', json.loads((root/'current.json').read_text()))
    candidate = Learner(FinalMLPLoRA(12, 8), learner.norm_weight, learner.norm_eps, learner.token_rows, private)
    candidate.metadata['candidate_parent_sha256'] = learner.metadata['weights_sha256']
    supervised = {**sample, 'version': 1, 'search_target': [0., 1., 0.]}
    supervised['old_log_probs'] = mx.stop_gradient(candidate.log_probs(supervised))
    if not candidate.distill_search([supervised], 'native-search-targets', 'rules-a')['updated']:
        raise AssertionError('Fixture gradient did not update the private candidate')
    checkpoint = private / 'checkpoints/v000002'
    report_path = data / 'counterpush/control/evaluations/trial.json'
    games = []
    for pair in range(16):
        order = ('baseline', 'candidate') if pair % 2 == 0 else ('candidate', 'baseline')
        for variant in order:
            meta = candidate.metadata if variant == 'candidate' else learner.metadata
            win = variant == 'candidate' and not tied
            blue, red = (3, 0) if win else (0, 3)
            episode = data / 'counterpush/runs' / f'pair-{pair}-{variant}'
            episode.mkdir(parents=True)
            rows = [{'type': 'match_start', 'source': 'counterpush_visible_browser', 'initialPhase': 'result'},
                    {'type': 'prediction', 'behavior': {'adapter_sha256': meta['weights_sha256'],
                     'model_identity': meta['model_sha256'], 'trainable': False, 'read_only_evaluation': True,
                     'selection': 'categorical_as_live'}},
                    {'type': 'result', 'source': 'counterpush_result_dom_verified2', 'blue': blue, 'red': red,
                     'readings': [f'Crowns: you {blue}, the opponent {red}'] * 2}]
            (episode / 'events.jsonl').write_text('\n'.join(json.dumps(row) for row in rows))
            games.append({'directory': str(episode), 'variant': variant, 'pair': pair,
                          'weightsSHA256': meta['weights_sha256'], 'result': 'win' if win else 'loss', 'score': int(win)})
    mean = .5 if tied else 1.
    report = {'format': 'counterpush-frozen-ab-evaluation-v1', 'complete': True, 'requestedPairs': 16,
              'trainingDuringEvaluation': False, 'selection': 'categorical_as_live', 'baselineUnchanged': True,
              'order': 'AB_BA_blocks', 'baseline': learner.metadata, 'candidate': candidate.metadata,
              'games': games, 'pairs': [mean] * 16, 'gate': {'passed': True, 'score': mean, 'alpha': .025},
              'trialID': 'reserved-trial', 'alphaSpendingAttempt': 0}
    atomic_json(report_path, report)
    atomic_json(data / 'counterpush/control/evaluation-attempts.json', {'count': 1, 'trials': {
        'reserved-trial': {'index': 0, 'file': str(report_path), 'baselineSHA256': learner.metadata['weights_sha256'],
                           'candidateSHA256': candidate.metadata['weights_sha256']}}})
    worker = object.__new__(LearningWorker)
    worker.directory, worker.learner, worker.champion_learner, worker.evaluation_backup = root, learner, learner, None
    worker.spec = {'input_size': 12, 'hidden_size': 8, 'identity': learner.metadata['model_sha256'], 'name': 'fixture'}
    worker.model = SimpleNamespace(language_model=SimpleNamespace(model=SimpleNamespace(norm=SimpleNamespace(adapter=learner.adapter))))
    return worker, checkpoint, report_path, report


class QualifiedPromotionTest(unittest.TestCase):
    def test_full_raw_evidence_publishes_once_reloads_and_keeps_the_previous_champion(self):
        with tempfile.TemporaryDirectory() as directory:
            worker, checkpoint, path, report = fixture(directory)
            previous = weights_digest(worker.learner.adapter)
            old_file = worker.directory / 'checkpoints/v000001/adapter.safetensors'
            old_bytes = old_file.read_bytes()
            result = worker.promote({'checkpoint': str(checkpoint), 'report': str(path)})
            self.assertTrue(result['promoted'])
            self.assertEqual(worker.status()['weights_sha256'], report['candidate']['weights_sha256'])
            self.assertNotEqual(worker.status()['weights_sha256'], previous)
            self.assertEqual(old_file.read_bytes(), old_bytes)
            self.assertEqual(worker.status()['role'], 'champion')
            self.assertEqual(worker.promote({'checkpoint': str(checkpoint), 'report': str(path)})['reason'], 'already_applied')
            root = worker.directory.parents[1] / 'arena/qwen/training/next'
            private = worker.begin_candidate(str(root))
            self.assertEqual(private['candidate_parent_sha256'], report['candidate']['weights_sha256'])
            self.assertEqual(worker.end_candidate()['weights_sha256'], report['candidate']['weights_sha256'])

    def test_missing_or_forged_qualification_never_moves_the_deployed_pointer(self):
        cases = ('partial', 'tied', 'wrong_parent', 'changed_score', 'trainable', 'leaked', 'wrong_alpha', 'unreserved', 'duplicate', 'resumed_match')
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                worker, checkpoint, path, report = fixture(directory, tied=case == 'tied')
                current = worker.directory / 'current.json'
                original = current.read_bytes()
                meta_path = checkpoint / 'metadata.json'
                metadata = json.loads(meta_path.read_text())
                if case == 'partial': report['complete'] = False
                if case == 'wrong_parent': metadata['candidate_parent_sha256'] = 'stale'
                if case == 'changed_score': report['games'][0]['result'] = 'win'
                if case == 'leaked': metadata['episodes'].append(report['games'][0]['directory'])
                if case == 'wrong_alpha': report['gate']['alpha'] = .05
                if case == 'unreserved': report['trialID'] = 'not-reserved'
                if case == 'duplicate': report['games'][1]['directory'] = report['games'][0]['directory']
                if case in ('trainable', 'resumed_match'):
                    event_file = Path(report['games'][0]['directory']) / 'events.jsonl'
                    rows = [json.loads(line) for line in event_file.read_text().splitlines()]
                    if case == 'trainable': rows[1]['behavior']['trainable'] = True
                    else: rows[0]['initialPhase'] = 'battle'
                    event_file.write_text('\n'.join(json.dumps(row) for row in rows))
                atomic_json(meta_path, metadata); atomic_json(path, report)
                with self.assertRaises(ValueError):
                    publish(worker.directory, checkpoint, path, metadata['weights_sha256'])
                self.assertEqual(current.read_bytes(), original)

    def test_direct_training_of_a_guarded_champion_rolls_back_and_a_private_candidate_can_train(self):
        with tempfile.TemporaryDirectory() as directory:
            worker, checkpoint, path, _ = fixture(directory)
            learner = worker.learner
            sample = {'features': mx.ones(12), 'base': mx.arange(8).astype(mx.float32), 'labels': [0, 1, 2],
                      'version': learner.metadata['version'], 'chosen': 1, 'remaining': 0}
            sample['old_log_probs'] = mx.stop_gradient(learner.log_probs(sample))
            original = weights_digest(learner.adapter)
            with self.assertRaisesRegex(ValueError, 'frozen'):
                learner.train([sample], 1, 'unqualified-update')
            self.assertEqual(weights_digest(learner.adapter), original)
            worker.begin_candidate(str(checkpoint.parents[1]))
            with self.assertRaisesRegex(ValueError, 'Restore'):
                worker.promote({'checkpoint': str(checkpoint), 'report': str(path)})
            self.assertEqual(worker.end_candidate()['weights_sha256'], original)


if __name__ == '__main__':
    unittest.main()
