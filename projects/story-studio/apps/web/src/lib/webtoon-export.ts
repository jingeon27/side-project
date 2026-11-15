import { type TProject } from './story';
import { wrapCaption } from './video-export';

export async function exportWebtoon(project: TProject, signal: AbortSignal) {
  if (project.scenes.some((scene) => !scene.image))
    throw new Error('모든 컷의 이미지를 생성한 뒤 웹툰을 저장할 수 있습니다.');
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('웹툰 캔버스를 열지 못했습니다.');
  context.font = '26px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const panels: {
    bitmap: ImageBitmap;
    narration: string[];
    dialogue: string[];
    imageHeight: number;
    height: number;
  }[] = [];
  const total = { height: 180 };
  try {
    for (const scene of project.scenes) {
      signal.throwIfAborted();
      const response = await fetch(scene.image!, { signal });
      if (!response.ok) throw new Error('컷 이미지를 열 수 없습니다. 원본 저장 폴더를 확인해 주세요.');
      const bitmap = await createImageBitmap(await response.blob()).catch(() => {
        throw new Error('이미지 파일을 읽지 못했습니다. 원본 PNG를 확인해 주세요.');
      });
      const narration = wrapCaption(context, scene.narration, 820);
      const dialogue = scene.dialogue ? wrapCaption(context, scene.dialogue, 760) : [];
      const imageHeight = Math.round((bitmap.height * 880) / bitmap.width);
      const panel = {
        bitmap,
        narration,
        dialogue,
        imageHeight,
        height: imageHeight + narration.length * 42 + (dialogue.length ? dialogue.length * 42 + 65 : 0) + 130,
      };
      total.height += panel.height;
      if (total.height > 32000) {
        bitmap.close();
        throw new Error(
          '웹툰이 한 장의 PNG에 담기에는 너무 깁니다. PDF로 저장하거나 작품을 회차별로 나누어 주세요.',
        );
      }
      panels.push(panel);
    }
    const height = total.height;
    canvas.height = height;
    context.fillStyle = '#faf7f0';
    context.fillRect(0, 0, 960, height);
    context.fillStyle = '#252525';
    context.font = 'bold 36px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    context.textAlign = 'center';
    context.fillText(project.title, 480, 88, 860);
    context.textAlign = 'left';
    context.font = '26px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    panels.reduce((top, panel) => {
      context.drawImage(panel.bitmap, 40, top, 880, panel.imageHeight);
      const textTop = top + panel.imageHeight + 52;
      context.fillStyle = '#292827';
      panel.narration.forEach((line, index) => context.fillText(line, 70, textTop + index * 42));
      if (panel.dialogue.length) {
        const bubbleTop = textTop + panel.narration.length * 42 + 12;
        context.beginPath();
        context.roundRect(70, bubbleTop, 820, panel.dialogue.length * 42 + 40, 30);
        context.fillStyle = '#fff';
        context.fill();
        context.strokeStyle = '#292827';
        context.lineWidth = 3;
        context.stroke();
        context.fillStyle = '#292827';
        panel.dialogue.forEach((line, index) => context.fillText(line, 100, bubbleTop + 43 + index * 42));
      }
      return top + panel.height;
    }, 150);
    signal.throwIfAborted();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('웹툰 PNG를 저장하지 못했습니다.'))),
        'image/png',
      ),
    );
  } finally {
    panels.forEach((panel) => panel.bitmap.close());
  }
}
