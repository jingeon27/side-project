import type { ReactNode } from 'react';
import Image from 'next/image';

import { match } from 'ts-pattern';

import type { TRichTextAttributes, TRichTextDocument, TRichTextEmbed } from '@game-feedback/contracts';

interface ISegment {
  text?: string;
  media?: TRichTextEmbed;
  attributes?: TRichTextAttributes;
}
interface ILine {
  segments: ISegment[];
  attributes?: TRichTextAttributes;
}
function lines(document: TRichTextDocument) {
  return document.ops.reduce<{ lines: ILine[]; current: ISegment[] }>(
    (state, op) => {
      if (typeof op.insert !== 'string')
        return { ...state, current: [...state.current, { media: op.insert }] };
      const parts = op.insert.split('\n');
      return parts.reduce((current, text, index) => {
        const segments = text ? [...current.current, { text, attributes: op.attributes }] : current.current;
        if (index < parts.length - 1)
          return { lines: [...current.lines, { segments, attributes: op.attributes }], current: [] };
        return { lines: current.lines, current: segments };
      }, state);
    },
    { lines: [], current: [] },
  ).lines;
}
function segmentNode(segment: ISegment, key: number) {
  if (segment.media && 'image' in segment.media)
    return (
      <Image
        key={key}
        src={segment.media.image}
        alt="게시글 사진"
        width={1200}
        height={900}
        unoptimized
        className="post-body-media"
      />
    );
  if (segment.media && 'video' in segment.media)
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption -- 게시글 본문에 올린 동영상이라 함께 제공할 자막 파일이 없다.
      <video
        key={key}
        src={segment.media.video}
        controls
        playsInline
        preload="metadata"
        aria-label="게시글 동영상"
        className="post-body-media"
      />
    );
  const attributes = segment.attributes ?? {};
  const marked = [
    { active: attributes.bold, tag: 'strong' },
    { active: attributes.italic, tag: 'em' },
    { active: attributes.underline, tag: 'u' },
    { active: attributes.strike, tag: 's' },
  ] as const;
  const content = marked.reduce<ReactNode>((node, mark) => {
    const Tag = mark.tag;
    return mark.active ? <Tag>{node}</Tag> : node;
  }, segment.text);
  if (attributes.link)
    return (
      <a key={key} href={attributes.link} target="_blank" rel="nofollow ugc noopener noreferrer">
        {content}
      </a>
    );
  return <span key={key}>{content}</span>;
}
export function RichTextBody({ body, document }: { body: string; document?: TRichTextDocument | null }) {
  if (!document) return <div className="prose-body">{body}</div>;
  const groups = lines(document).reduce<{ list?: 'ordered' | 'bullet'; lines: ILine[] }[]>((result, line) => {
    const list = line.attributes?.list;
    const last = result.at(-1);
    if (list && last?.list === list) return [...result.slice(0, -1), { list, lines: [...last.lines, line] }];
    return [...result, { list, lines: [line] }];
  }, []);
  return (
    <div className="prose-body rich-text-body">
      {groups.map((group, index) => {
        if (group.list) {
          const List = group.list === 'ordered' ? 'ol' : 'ul';
          return (
            <List key={index}>
              {group.lines.map((line, lineIndex) => (
                <li key={lineIndex}>{line.segments.map(segmentNode)}</li>
              ))}
            </List>
          );
        }
        const line = group.lines[0];
        // 블록 속성은 선택 플래그 묶음이라 지정이 없으면 문단으로 둔다.
        const Tag = match(line?.attributes)
          .with({ header: 2 }, () => 'h2' as const)
          .with({ header: 3 }, () => 'h3' as const)
          .with({ blockquote: true }, () => 'blockquote' as const)
          .otherwise(() => 'p' as const);
        return <Tag key={index}>{line?.segments.length ? line.segments.map(segmentNode) : <br />}</Tag>;
      })}
    </div>
  );
}
