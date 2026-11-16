import json
from pathlib import Path
import tempfile
import unittest

import mlx.core as mx

from clash_bot.qwen.learning_policy import weights_digest
from clash_bot.qwen.replay import remember, rehearse
from clash_bot.qwen import search_study_test as fixtures


class CachedReplayTest(unittest.TestCase):
    def test_rehearsal_is_private_and_does_not_count_old_labels_as_new_data(self):
        with tempfile.TemporaryDirectory() as directory:
            worker=fixtures.IsolatedSearchStudyTest().worker(directory)
            champion=weights_digest(worker.learner.adapter)
            worker.begin_candidate(worker.directory.parents[1]/'arena/qwen/training/replay')
            worker.configure_candidate(3)
            learner=worker.learner
            samples=[];rows=[]
            for index in range(4):
                feature=learner.directory/'features/train'/f'{index:03d}.npz';feature.parent.mkdir(parents=True,exist_ok=True)
                value={'features':mx.ones(12)*(index+1),'base':mx.arange(8).astype(mx.float32)}
                mx.savez(str(feature),**value)
                samples.append({**value,'labels':[0,1,2],'search_target':[0,1,0]})
                rows.append({'id':f'train-{index}','evidence':{'family':f'family-{index%2}'}})
            dataset={'split':'train','controllerVersion':3,'rulesID':'rules-a','samples':rows}
            remember(learner,dataset,'train',samples)
            result=worker.rehearse({'rounds':2})
            self.assertTrue(result['updated'])
            self.assertEqual(learner.metadata.get('search_datasets',[]),[])
            self.assertEqual(learner.metadata['tactical_rehearsals'],2)
            worker.end_candidate()
            self.assertEqual(weights_digest(worker.learner.adapter),champion)
            with self.assertRaisesRegex(ValueError,'private'):
                worker.rehearse({'rounds':1})
            remember(learner,{**dataset,'split':'holdout'},'forbidden',samples)
            self.assertFalse((learner.directory/'replay/forbidden.json').exists())
            path=learner.directory/'replay/train.json';body=json.loads(path.read_text());body['split']='holdout';path.write_text(json.dumps(body))
            with self.assertRaisesRegex(ValueError,'heldout'):
                rehearse(learner,1)


if __name__ == '__main__':
    unittest.main()
