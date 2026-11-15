import type { TProject, TVideoTask } from './story';

export function updateVideoTasks(projects: TProject[], tasks: TVideoTask[]) {
  const indexed = new Map(tasks.map((task) => [task.id, task]));
  const updated = projects.map((project) => {
    const scenes = project.scenes.map((scene) => {
      const task = scene.video && indexed.get(scene.video.id);
      if (
        !task ||
        (task.status === scene.video?.status &&
          task.asset === scene.video.asset &&
          task.error === scene.video.error &&
          task.progress === scene.video.progress)
      )
        return scene;
      return { ...scene, video: task };
    });
    return scenes.every((scene, index) => scene === project.scenes[index]) ? project : { ...project, scenes };
  });
  return updated.every((project, index) => project === projects[index]) ? projects : updated;
}
