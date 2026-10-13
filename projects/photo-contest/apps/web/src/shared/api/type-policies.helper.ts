import type { TypePolicies, TypePolicy } from '@apollo/client/cache';

/**
 * 도메인별 typePolicies를 타입 → fields 단계까지 합친다(Query.fields도 도메인마다 나눠 둘 수 있다).
 * 두 도메인이 같은 타입 옵션이나 같은 필드를 정의하면 어느 쪽이 이기는지 숨기지 않도록 바로 실패한다.
 */
export function mergeTypePolicies(...sources: TypePolicies[]): TypePolicies {
  const merged: TypePolicies = {};
  for (const source of sources) {
    for (const [typename, policy] of Object.entries(source)) {
      const existing = merged[typename];
      if (!existing) {
        merged[typename] = { ...policy, ...(policy.fields ? { fields: { ...policy.fields } } : {}) };
        continue;
      }
      merged[typename] = mergeTypePolicy(typename, existing, policy);
    }
  }
  return merged;
}

function mergeTypePolicy(typename: string, existing: TypePolicy, incoming: TypePolicy): TypePolicy {
  const { fields: existingFields = {}, ...existingOptions } = existing;
  const { fields: incomingFields = {}, ...incomingOptions } = incoming;
  for (const option of Object.keys(incomingOptions))
    if (option in existingOptions)
      throw new Error(`typePolicies.${typename}.${option}가 두 번 정의됐습니다.`);
  for (const field of Object.keys(incomingFields))
    if (field in existingFields)
      throw new Error(`typePolicies.${typename}.fields.${field}가 두 번 정의됐습니다.`);
  return { ...existingOptions, ...incomingOptions, fields: { ...existingFields, ...incomingFields } };
}
