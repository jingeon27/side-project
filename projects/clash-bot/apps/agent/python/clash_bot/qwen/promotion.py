"""Recheck real-game evidence before atomically publishing a new champion."""
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import uuid

from clash_bot.qwen.learning_policy import atomic_json


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def parent_sha(metadata):
    return metadata.get('candidate_parent_sha256', metadata.get('study_parent'))


def qualification_scores(scores, alpha, method='hoeffding_score'):
    if (len(scores) < 16 or not 0 < alpha <= .05
            or any(not math.isfinite(value) or not 0 <= value <= 1 for value in scores)):
        raise ValueError('Insufficient or invalid heldout evaluation')
    mean = sum(scores) / len(scores)
    if method == 'paired_exact_wins_v1':
        if any(value not in (0, .5, 1) for value in scores):
            raise ValueError('Invalid win-rate pair scores')
        won, lost = sum(value > .5 for value in scores), sum(value < .5 for value in scores)
        decisive = won + lost
        probability = sum(math.comb(decisive, count) for count in range(won, decisive + 1)) / 2 ** decisive if decisive else 1.
        if mean < .55 or probability > alpha:
            raise ValueError('Candidate has not demonstrated a win-rate improvement')
        return {'pairs': len(scores), 'score': mean, 'deltaWinRate': 2*mean-1, 'oneSidedP': probability,
                'test': 'exact_paired_binomial', 'alpha': alpha}
    if method != 'hoeffding_score':
        raise ValueError('Unknown qualification method')
    lower = mean - math.sqrt(math.log(2 / alpha) / (2 * len(scores)))
    if mean < .55 or lower <= .5:
        raise ValueError('Candidate has not demonstrated improvement')
    return {'pairs': len(scores), 'score': mean, 'lowerBound': max(0, lower), 'alpha': alpha}


def verified_game(game, expected_sha, model_identity, runs, method, controller):
    directory = Path(game['directory']).resolve()
    if directory.parent != runs.resolve() or game.get('weightsSHA256') != expected_sha:
        raise ValueError('Evaluation game path or frozen policy differs')
    rows = [json.loads(line) for line in (directory / 'events.jsonl').read_text().splitlines() if line]
    if any(row.get('type')=='input_recovery' for row in rows):
        raise ValueError('Input recovery games cannot qualify a policy')
    starts = [row for row in rows if row.get('type') == 'match_start']
    if (len(starts) != 1 or starts[0].get('source') != 'counterpush_visible_browser'
            or starts[0].get('initialPhase') not in ('setup', 'result')):
        raise ValueError('Evaluation did not start a fresh observed match')
    results = [row for row in rows if row.get('type') == 'result']
    if not results:
        raise ValueError('Evaluation has no visible terminal result')
    result = results[-1]
    blue, red = result.get('blue'), result.get('red')
    readings = result.get('readings', [])
    if (result.get('source') != 'counterpush_result_dom_verified2' or len(readings) != 2 or readings[0] != readings[1]
            or type(blue) is not int or type(red) is not int or not 0 <= blue <= 3 or not 0 <= red <= 3):
        raise ValueError('Terminal crowns were not verified twice')
    label = re.fullmatch(r'Crowns: you ([0-3]), the opponent ([0-3])(?:, overtime)?', readings[0])
    if label is None or [int(label[1]), int(label[2])] != [blue, red]:
        raise ValueError('Visible crowns disagree with the recorded result')
    outcome = 'win' if blue > red else 'loss' if blue < red else 'draw'
    if outcome != game['result']:
        raise ValueError('Reported score disagrees with visible crowns')
    predictions = [row['behavior'] for row in rows if row.get('type') == 'prediction']
    if not predictions or any(row.get('adapter_sha256') != expected_sha or row.get('model_identity') != model_identity
                              or row.get('trainable') is not False or row.get('read_only_evaluation') is not True
                              or row.get('selection') != 'categorical_as_live' for row in predictions):
        raise ValueError('Evaluation used changing, trainable or unverified action weights')
    if starts[0].get('controllerVersion', 1) != controller or any(row.get('controller_version', 1) != controller for row in predictions):
        raise ValueError('Evaluation decision controller differs from the checkpoint')
    if controller>=3 and any(row.get('policy_input')!='public_text_v3' for row in predictions):
        raise ValueError('Fast evaluation did not use the frozen text input contract')
    return .5 if outcome == 'draw' and method == 'hoeffding_score' else float(outcome == 'win')


def validate_report(report_path, candidate, champion, data_dir):
    report_path, data_dir = Path(report_path).resolve(), Path(data_dir).resolve()
    if report_path.parent != data_dir / 'counterpush/control/evaluations':
        raise ValueError('Qualification must use an owned real-game report')
    report = json.loads(report_path.read_text())
    count = report.get('requestedPairs')
    if (report.get('format') != 'counterpush-frozen-ab-evaluation-v1' or report.get('complete') is not True
            or report.get('trainingDuringEvaluation') is not False or report.get('selection') != 'categorical_as_live'
            or report.get('baselineUnchanged') is not True or report.get('order') != 'AB_BA_blocks'
            or type(count) is not int or count < 16 or len(report['games']) != count * 2
            or report.get('gate', {}).get('passed') is not True):
        raise ValueError('Report is incomplete, exploratory or did not qualify')
    if (report['baseline']['weights_sha256'] != champion['weights_sha256']
            or report['baseline']['version'] != champion['version']
            or parent_sha(candidate) != champion['weights_sha256']
            or report['candidate']['weights_sha256'] != candidate['weights_sha256']
            or report['candidate']['model_sha256'] != champion['model_sha256']
            or candidate['weights_sha256'] == champion['weights_sha256']):
        raise ValueError('Candidate/evaluation was made against a different champion')
    if report['candidate'].get('controller_version', 1) != candidate.get('controller_version', 1):
        raise ValueError('Candidate controller changed after evaluation')
    attempts = json.loads((data_dir / 'counterpush/control/evaluation-attempts.json').read_text())
    reserved = attempts.get('trials', {}).get(report.get('trialID'))
    index = report.get('alphaSpendingAttempt')
    if (not reserved or type(index) is not int or index < 0 or reserved['index'] != index
            or Path(reserved['file']).resolve() != report_path
            or reserved['baselineSHA256'] != champion['weights_sha256']
            or reserved['candidateSHA256'] != candidate['weights_sha256']):
        raise ValueError('Unreserved or mismatched qualification trial')
    method = report.get('method', 'hoeffding_score')
    if method != reserved.get('method', 'hoeffding_score'):
        raise ValueError('Qualification method changed after registration')
    if (method == 'paired_exact_wins_v1' and (reserved.get('requestedPairs') != count
            or reserved.get('minimumPairs') != report.get('minimumPairs') or reserved.get('minimumPairs', 0) < 16)):
        raise ValueError('Qualification sample count changed after registration')
    alpha = .05 / ((index + 1) * (index + 2))
    if not math.isclose(report['gate']['alpha'], alpha, rel_tol=1e-12):
        raise ValueError('Repeated evaluation confidence budget differs')
    directories, scores = set(), []
    for pair in range(count):
        block = report['games'][pair*2:pair*2+2]
        order = ['baseline', 'candidate'] if pair % 2 == 0 else ['candidate', 'baseline']
        values = {}
        for game, variant in zip(block, order):
            directory = str(Path(game['directory']).resolve())
            if game['pair'] != pair or game['variant'] != variant or directory in directories:
                raise ValueError('Duplicated games or unbalanced A/B order')
            directories.add(directory)
            expected = candidate['weights_sha256'] if variant == 'candidate' else champion['weights_sha256']
            controller = (candidate if variant == 'candidate' else champion).get('controller_version', 1)
            values[variant] = verified_game(game, expected, champion['model_sha256'], data_dir / 'counterpush/runs', method, controller)
        scores.append(.5 + (values['candidate']-values['baseline']) / 2)
    trained = {str(Path(path).resolve()) for meta in (candidate, champion) for path in meta.get('episodes', [])}
    if trained & directories:
        raise ValueError('Evaluation games leaked into training')
    if len(report['pairs']) != count or any(abs(a-b) > 1e-9 for a, b in zip(scores, report['pairs'])):
        raise ValueError('Pair scores disagree with raw results')
    gate = qualification_scores(scores, alpha, method)
    if abs(report['gate']['score'] - gate['score']) > 1e-9:
        raise ValueError('Qualification score changed')
    return {**gate, 'report': str(report_path), 'report_sha256': sha(report_path),
            'baseline_sha256': champion['weights_sha256'], 'candidate_sha256': candidate['weights_sha256']}


def publish(champion_dir, candidate_checkpoint, report_path, actual_candidate_sha):
    champion_dir, candidate_checkpoint = Path(champion_dir).resolve(), Path(candidate_checkpoint).resolve()
    data_dir = champion_dir.parents[1]
    if not (champion_dir / 'promotion-policy.json').exists():
        raise ValueError('Enable the qualified-champion policy first')
    pointer = json.loads((champion_dir / 'current.json').read_text())
    previous = champion_dir / 'checkpoints' / f'v{pointer["version"]:06d}'
    champion = json.loads((previous / 'metadata.json').read_text())
    candidate = json.loads((candidate_checkpoint / 'metadata.json').read_text())
    if candidate['weights_sha256'] != actual_candidate_sha:
        raise ValueError('Candidate checkpoint checksum differs')
    if champion.get('qualification', {}).get('report_sha256') == sha(report_path) and champion['weights_sha256'] == actual_candidate_sha:
        return {'promoted': False, 'reason': 'already_applied', **pointer}
    qualification = validate_report(report_path, candidate, champion, data_dir)
    versions = [int(path.name[1:]) for path in (champion_dir / 'checkpoints').glob('v*') if path.name[1:].isdigit()]
    version = max(versions) + 1
    destination = champion_dir / 'checkpoints' / f'v{version:06d}'
    temporary = champion_dir / 'checkpoints' / f'.qualified-{uuid.uuid4().hex}'
    temporary.mkdir()
    try:
        for name in ('adapter.safetensors', 'optimizer.safetensors'):
            shutil.copyfile(candidate_checkpoint / name, temporary / name)
            if sha(candidate_checkpoint / name) != sha(temporary / name):
                raise ValueError('Checkpoint changed during publication')
        metadata = {**{key: value for key, value in candidate.items() if key not in ('candidate_parent_sha256', 'study_parent')},
                    'version': version, 'deployment_role': 'champion', 'qualification': qualification,
                    'promoted_from': {'checkpoint': str(candidate_checkpoint), 'version': candidate['version']}}
        atomic_json(temporary / 'metadata.json', metadata)
        if json.loads((champion_dir / 'current.json').read_text()) != pointer:
            raise ValueError('Champion changed while publishing')
        temporary.rename(destination)
        atomic_json(champion_dir / 'current.json', {'version': version, 'weights_sha256': actual_candidate_sha})
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return {'promoted': True, 'version': version, 'weights_sha256': actual_candidate_sha,
            'previous_version': champion['version'], 'qualification': qualification}
