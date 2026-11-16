"""Prioritized supervised replay of native TRAIN labels, never game A/B data."""
import hashlib
import json
from pathlib import Path

import mlx.core as mx


def remember(learner, dataset, identity, samples):
    if dataset.get('split') != 'train' or dataset.get('controllerVersion') != 3:
        return
    from clash_bot.qwen.learning_policy import atomic_json
    atomic_json(learner.directory/'replay'/f'{identity}.json', {
        'model':learner.metadata['model_sha256'],'controller':3,'split':'train','rulesID':dataset['rulesID'],
        'dataset':identity,'samples':[
            {'path':str(learner.directory/'features'/identity/f'{index:03d}.npz'),
             'labels':sample['labels'],'target':sample['search_target'],'id':row['id'],
             'family':row['evidence']['family']} for index,(sample,row) in enumerate(zip(samples,dataset['samples']))]})


def rehearse(learner, rounds):
    if type(rounds) is not int or not 1 <= rounds <= 64:
        raise ValueError('Expected 1..64 bounded replay rounds')
    rows=[]
    for path in sorted((learner.directory/'replay').glob('*.json'),key=lambda p:p.stat().st_mtime)[-32:]:
        data=json.loads(path.read_text())
        if data['split'] != 'train' or data['controller'] != 3 or data['model'] != learner.metadata['model_sha256']:
            raise ValueError('Replay cannot use heldout data or another feature contract')
        for row in data['samples']:
            feature=Path(row['path']).resolve()
            if not feature.is_relative_to(learner.directory.resolve()/'features'):
                raise ValueError('Replay feature escaped the private candidate')
            rows.append({**row,**mx.load(str(feature)),'rulesID':data['rulesID']})
    if not rows:
        return {'updated':False,'reason':'no_cached_train_targets','rounds':0}
    if len({row['rulesID'] for row in rows}) != 1:
        raise ValueError('Cannot mix battle rules in replay')
    reports=[]
    for _ in range(rounds):
        families={}
        for row in rows:
            logp=mx.stop_gradient(learner.log_probs(row))
            loss=float(-mx.sum(mx.array(row['target'])*logp).item())
            families.setdefault(row['family'],[]).append((loss,{**row,'search_target':row['target'],'old_log_probs':logp,'version':learner.metadata['version']}))
        groups=[sorted(group,key=lambda item:-item[0]) for group in families.values()]
        selected=[group[index][1] for index in range(16) for group in groups if index<len(group)][:16]
        identity=hashlib.sha256(json.dumps([learner.metadata['weights_sha256'],[s['id'] for s in selected]]).encode()).hexdigest()
        report=learner.distill_search(selected,identity,rows[0]['rulesID'],epochs=4,rehearsal=True)
        reports.append(report)
        if not report.get('updated'):
            break
    return {'updated':any(row.get('updated') for row in reports),'algorithm':'prioritized_cached_tactical_rehearsal',
            'rounds':len(reports),'updated_rounds':sum(row.get('updated',False) for row in reports),'pool_samples':len(rows),
            'steps':sum(row.get('steps',0) for row in reports),'version':learner.metadata['version'],
            'first':reports[0],'last':reports[-1]}
