import { BoardDocument, boardDocumentMetadata, type IBoardDocumentProps } from '@/_app/index.server';

export function generateMetadata(props: IBoardDocumentProps) {
  return boardDocumentMetadata('friendly', props);
}

export default function Page(props: IBoardDocumentProps) {
  return <BoardDocument {...props} slug="friendly" />;
}

// Initial public HTML is complete; instant() verifies the prefetched navigation controls.
export const instant = false;
