import { describe, expect, it } from 'vitest';

import { sampleProject } from '../../story/model/sample';
import { updateVideoTasks } from './video-tasks';

describe('영상 상태 조회의 불필요한 화면 갱신 방지', () => {
  it('같은 상태면 작품과 장면 참조를 그대로 유지한다', () => {
    const original = sampleProject();
    const task = { id: 'owned-video-task', status: 'RUNNING' as const, progress: '생성 중' };
    const project = { ...original, scenes: original.scenes.map((scene) => ({ ...scene, video: task })) };
    const projects = [project];
    expect(updateVideoTasks(projects, [{ ...task }])).toBe(projects);
    expect(updateVideoTasks(projects, [])).toBe(projects);
  });

  it('실제로 바뀐 작업만 반영하고 다른 작품과 장면을 보존한다', () => {
    const original = sampleProject();
    const project = {
      ...original,
      scenes: original.scenes.map((scene, index) => ({
        ...scene,
        video: { id: `owned-task-${index}`, status: 'RUNNING' as const },
      })),
    };
    const unrelated = sampleProject();
    const asset = '/api/assets/12345678-1234-1234-1234-123456789abc.mp4';
    const next = updateVideoTasks([project, unrelated], [{ id: 'owned-task-0', status: 'SUCCEEDED', asset }]);
    expect(next[0]?.scenes[0]?.video).toMatchObject({ status: 'SUCCEEDED', asset });
    expect(next[0]?.scenes[1]).toBe(project.scenes[1]);
    expect(next[1]).toBe(unrelated);
    expect(project.scenes[0]?.video.status).toBe('RUNNING');
  });
});
