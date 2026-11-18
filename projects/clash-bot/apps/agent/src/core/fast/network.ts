import { range, sum } from 'es-toolkit';

import { ACTION_SIZE, FAST_POLICY, STATE_SIZE } from './features.ts';

const { hidden, attention } = FAST_POLICY;
export const WEIGHT_SHAPES = {
  'action.bias': [attention],
  'action.weight': [attention, ACTION_SIZE],
  'encoder.bias': [hidden],
  'encoder.weight': [hidden, STATE_SIZE],
  'query.bias': [attention],
  'query.weight': [attention, hidden],
  'value.bias': [1],
  'value.weight': [1, hidden],
} satisfies Record<string, number[]>;
type WeightName = keyof typeof WEIGHT_SHAPES;
export type FastWeights = Record<WeightName, Float64Array>;

const hiddenRows = range(hidden);
const attentionRows = range(attention);
const scoreScale = Math.sqrt(attention);

function nonzeroColumns(input: Float64Array) {
  const indices: number[] = [];
  input.forEach((value, index) => {
    if (value !== 0) indices.push(index);
  });
  return indices;
}

function dot(matrix: Float64Array, offset: number, columns: number[], input: ArrayLike<number>) {
  return columns.reduce((total, index) => total + matrix[offset + index]! * input[index]!, 0);
}

// The simulator and the trophy actor apply different priors to the same raw scores.
export function networkScores(weights: FastWeights, state: Float64Array, actions: Float64Array[]) {
  const activeState = nonzeroColumns(state);
  const encoded = hiddenRows.map((row) =>
    Math.max(
      0,
      dot(weights['encoder.weight'], row * STATE_SIZE, activeState, state) + weights['encoder.bias'][row]!,
    ),
  );
  const query = attentionRows.map(
    (row) => dot(weights['query.weight'], row * hidden, hiddenRows, encoded) + weights['query.bias'][row]!,
  );
  const logits = actions.map((action) => {
    const activeAction = nonzeroColumns(action);
    return (
      query.reduce((score, queryValue, row) => {
        const projected =
          dot(weights['action.weight'], row * ACTION_SIZE, activeAction, action) +
          weights['action.bias'][row]!;
        return score + queryValue * Math.max(0, projected);
      }, 0) / scoreScale
    );
  });
  const value = Math.tanh(dot(weights['value.weight'], 0, hiddenRows, encoded) + weights['value.bias'][0]!);
  return { logits, value, activeState };
}

export function forward(weights: FastWeights, state: Float64Array, actions: Float64Array[], bias?: number[]) {
  const raw = networkScores(weights, state, actions);
  const logits = bias ? raw.logits.map((score, index) => score + (bias[index] ?? 0)) : raw.logits;
  const top = Math.max(...logits);
  const exponents = logits.map((logit) => Math.exp(logit - top));
  const total = sum(exponents);
  return { logits, value: raw.value, probabilities: exponents.map((item) => item / total) };
}
