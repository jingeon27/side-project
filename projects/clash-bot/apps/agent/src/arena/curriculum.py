"""Counterfactual tactical supervision, not invented full-match win labels.

Compare legal moves against waiting from the SAME public field. No future enemy
deployments are supplied. Keep only large measured tower-HP improvements, and
record this limited horizon explicitly; real-game qualification is still needed.
"""
import hashlib
import json
from pathlib import Path

import numpy as np

from .engine import Action, Arena, BeliefSampler, FIELDS, TILE, canonical, digest, legal_actions, public_board, rules_identity
from .export import render
from .storage import atomic_json, seed_for
from qwen.decision_input import serialize_decision

ALIASES = ['barbarian_barrel', 'furnace', 'goblin_hut', 'graveyard', 'ice_wizard', 'knight', 'poison', 'skeletons']


def body(kind):
    name = kind.lower()
    return ('furnace' if 'firespirithut' in name else 'goblin_hut' if 'goblinhut' in name else
            'ice_wizard' if 'icewizard' in name else 'knight' if 'knight' in name else
            'fire_spirit' if 'firespirit' in name else 'spear_goblin' if 'speargoblin' in name else
            'skeleton' if 'skeleton' in name else 'barbarian' if 'barbarian' in name else '?')


def prompt(observation, actions, types):
    state, team = observation['state'], observation['team']
    own, enemy = state['players'][team], state['players'][1-team]
    units = [[] for _ in range(2)]
    for row in state['entities']:
        if row[FIELDS['card_id']] < 0:
            continue
        x, y = canonical(row[FIELDS['x']]/TILE, row[FIELDS['y']]/TILE, team)
        units[0 if row[FIELDS['team']] == team else 1].append([body(types[row[FIELDS['unit_type']]]), round(x,1), round(y,1), '?'])
    effects = []
    for row in state['spells']:
        if row[1] in (3,6):
            x,y = canonical(row[3]/TILE,row[4]/TILE,team)
            effects.append(['blue' if row[0] == team else 'red', ALIASES[row[1]], round(x,1),round(y,1), None])
    description = {'hand':[ALIASES[card] for card in own['hand']], 'elixir':round(own['elixir_milli']/1000,1),
                   'enemyElixir':{'min':enemy['elixir_range'][0],'max':enemy['elixir_range'][1]},
                   'next':[ALIASES[own['next_card']]],
                   'own':sorted(units[0],key=lambda row:-row[2])[:5], 'enemy':sorted(units[1],key=lambda row:row[2])[:8],
                   'effects':effects[:4], 'skill':'ready' if own['abilities'] and own['abilities'][0][0] else 'not_visible',
                   'actions':[[chr(65+i),'ability' if a.card == -2 else 'wait' if a.card == -1 else 'card',
                               None if a.card == -1 else 'ice_wizard' if a.card == -2 else ALIASES[a.card],
                               0 if a.card == -1 else 2 if a.card == -2 else [2,4,4,5,3,3,4,1][a.card],
                               *[round(v,1) for v in canonical(a.x/TILE,a.y/TILE,team)]] for i,a in enumerate(actions)]}
    return serialize_decision(description)


class Teacher:
    def __init__(self):
        self.root, self.scratch = Arena(1), Arena(2)
        self.types = json.loads(self.root.battle.unit_types_json())
        self.rules_id = rules_identity()['id']

    def label(self, observation, identity, family, horizon=240):
        root = BeliefSampler(observation, seed_for('tactical_root',identity)).sample(into=self.root)
        if public_board(root.state()) != public_board(observation['state']):
            return None
        team = observation['team']
        actions = legal_actions(root.battle, team)
        if Action(-1) not in actions:
            actions.append(Action(-1))
        order = np.random.default_rng(seed_for('tactical_action_order',identity)).permutation(len(actions))
        actions = [actions[index] for index in order]
        if len(actions) < 2:
            return None
        snapshot = root.battle.save()
        own_threat = any(row[0] != team and row[1] == 3 and canonical(row[3]/TILE,row[4]/TILE,team)[1] < 16 for row in root.state()['spells'])
        defensive = family in ('scenario-0','scenario-1','scenario-2') or own_threat
        def finish(action):
            self.scratch.battle.load(snapshot)
            self.scratch.history = root.history.copy()
            self.scratch.initial_hands, self.scratch.initial_next = root.initial_hands, root.initial_next
            commands = [Action(-1),Action(-1)]; commands[team] = action
            outcome = self.scratch.play(commands,horizon)
            if any(row[1] != 0 for row in outcome):
                raise ValueError('Counterfactual action was not legal')
            end = self.scratch.state()
            weights = np.array([2.,1.,1.])
            own = np.array(end['players'][team]['tower_hp'])@weights
            enemy = np.array(end['players'][1-team]['tower_hp'])@weights
            return float(own if defensive else own-enemy)
        baseline = finish(Action(-1))
        values = np.array([finish(action)-baseline for action in actions])
        best = float(values.max())
        if best < 80:
            return None
        viable = values >= best-35
        costs = np.array([0 if a.card == -1 else 2 if a.card == -2 else root.catalogue[a.card][2] for a in actions])
        target = np.where(viable,np.exp((values-best)/50 - .15*costs),0)
        target /= target.sum()
        return {'id':identity,'rulesID':self.rules_id,'observation':observation,
                'actions':[action.row() for action in actions], 'target':target.tolist(),
                'evidence':{'kind':'paired_passive_future_rollout','family':family,'horizonTicks':horizon,
                            'actionOrder':'seeded_permutation',
                            'objective':'own_tower_preservation' if defensive else 'tower_damage_difference',
                            'futureEnemyDeployments':0,'towerImprovement':values.tolist(),'bestImprovement':best,
                            'baselineTowerScore':baseline,'rootPublicHash':digest(public_board(observation['state']))},
                'prompt':prompt(observation,actions,self.types),'controllerVersion':3}


def scenario(seed, family):
    rng = np.random.default_rng(seed)
    left = bool(rng.integers(2))
    x = 3.5 if left else 14.5
    hands = ([6,4,3,7] if family == 0 else [4,0,3,5] if family == 1 else [2,7,5,4] if family == 2 else [5,3,6,1])
    if (seed//4)%2:
        hands = [6,0,3,7] if family == 0 else [2,6,3,0] if family == 2 else [5,1,4,2] if family == 3 else hands
    own = hands + [card for card in range(8) if card not in hands]
    enemy = [3,5,4,6,0,1,2,7]
    arena = Arena(seed,[own,enemy])
    arena.play([Action(-1)]*2,int(rng.integers(220,361)))
    if family in (0,1):
        arena.play([Action(-1),Action(3,round(x*TILE),round(6.5*TILE))],1)
        if seed % 3 == 0:
            arena.play([Action(-1),Action(6,round(x*TILE),round(6.5*TILE))],1)
        arena.play([Action(-1)]*2,int(rng.integers(12,90)))
    elif family == 2:
        arena.play([Action(-1),Action(5,round(x*TILE),18*TILE)],int(rng.integers(25,150)))
    else:
        arena.play([Action(5,round(x*TILE),14*TILE),Action(-1)],int(rng.integers(130,211)))
        if seed % 3 == 0:
            arena.play([Action(-1),Action(4,round(x*TILE),round(25.5*TILE))],20)
    return arena.observe(0)


def write_batches(data_dir, labels, rules_id, batch_size=8, split='train'):
    outputs=[]
    for begin in range(0,len(labels),batch_size):
        group=labels[begin:begin+batch_size]
        identity=digest({'format':3,'ids':[row['id'] for row in group],'proof':[row['evidence'] for row in group],
                         'prompts':[row['prompt'] for row in group]})
        root=Path(data_dir)/('arena/exports' if split == 'train' else 'arena/tactical-holdout')/identity
        path=root/'dataset.json'
        if path.exists():
            outputs.append(str(path));continue
        root.mkdir(parents=True,exist_ok=True)
        rows=[]
        for index,label in enumerate(group):
            name=f'{index:03d}.png';render(label['observation'],root/name)
            rows.append({key:value for key,value in label.items() if key not in ('observation','actions')})
            rows[-1].update({'image':name,'imageSHA256':hashlib.sha256((root/name).read_bytes()).hexdigest(),
                             'choices':list(range(len(label['actions'])))})
        atomic_json(path,{'format':'counterpush-tactical-targets-v3','source':'local_native_counterfactual_v2',
                         'controllerVersion':3,'rulesID':rules_id,'teacherQualifiedForRealGame':False,
                         'trainingEpochs':3,'split':split,'samples':rows})
        outputs.append(str(path))
    return outputs


def build(data_dir, count=64, seed=0, split='train'):
    teacher=Teacher();labels=[]
    for index in range(count):
        family=index%4; obs=scenario(seed+index,family)
        row=teacher.label(obs,f'curriculum-{seed}-{index}',f'scenario-{family}')
        if row: labels.append(row)
    files=write_batches(data_dir,labels,rules_identity()['id'],split=split)
    return {'files':files,'positions':len(labels),'attempted':count,
            'targetCards':{name:sum(ALIASES[row['actions'][int(np.argmax(row['target']))][0]]==name for row in labels) for name in ALIASES}}


def from_selfplay(data_dir, episodes, count=8):
    teacher=Teacher();labels=[]
    for episode in episodes:
        for sample in episode['samples'][::3]:
            obs=sample['observation']
            if len(obs['state']['entities']) < 8:
                continue
            row=teacher.label(obs,f"{sample['gameID']}-s{sample['team']}-t{obs['state']['tick']}",'selfplay-hard-position')
            if row: labels.append(row)
            if len(labels)>=count: break
        if len(labels)>=count: break
    return write_batches(data_dir,labels,episodes[0]['rulesID']) if labels else []
