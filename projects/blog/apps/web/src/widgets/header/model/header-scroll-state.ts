export interface IHeaderScrollState {
  hidden: boolean;
  edgeY: number;
}

export function nextHeaderScrollState(state: IHeaderScrollState, y: number): IHeaderScrollState {
  if (y <= 8) return { hidden: false, edgeY: y };
  if (state.hidden) {
    const edgeY = Math.max(state.edgeY, y);
    if (edgeY - y >= 8) return { hidden: false, edgeY: y };
    return edgeY === state.edgeY ? state : { hidden: true, edgeY };
  }
  const edgeY = Math.min(state.edgeY, y);
  if (y - edgeY >= 12) return { hidden: true, edgeY: y };
  return edgeY === state.edgeY ? state : { hidden: false, edgeY };
}
