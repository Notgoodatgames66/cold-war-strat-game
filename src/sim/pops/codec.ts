/**
 * Each pop's categories packed into one number (mixed radix, attribute order):
 * key = Σ categoryIndex[a] × stride[a], with the last attribute varying fastest.
 */

import type { PopAttributeDef, PopModelData, PopRole } from './types';

export interface PopCodec {
  attributes: PopAttributeDef[];
  /** Number of categories per attribute. */
  sizes: number[];
  strides: number[];
  /** Total number of possible combinations. */
  cells: number;
  /** Attribute index by role (undefined when the nation does not track it). */
  role: Partial<Record<PopRole, number>>;
  /** Attribute index by id. */
  index: Record<string, number>;
  /** Category index by attribute id and category id. */
  category(attributeId: string, categoryId: string): number;
  /** Category index of a pop for one attribute. */
  get(key: number, attribute: number): number;
  /** The key with one attribute changed. */
  with(key: number, attribute: number, category: number): number;
}

const cache = new WeakMap<PopModelData, PopCodec>();

export function codecFor(model: PopModelData): PopCodec {
  const cached = cache.get(model);
  if (cached) return cached;
  const attributes = model.attributes;
  const sizes = attributes.map((a) => a.categories.length);
  const strides: number[] = new Array(sizes.length);
  let stride = 1;
  for (let a = sizes.length - 1; a >= 0; a--) {
    strides[a] = stride;
    stride *= sizes[a]!;
  }
  const role: PopCodec['role'] = {};
  const index: Record<string, number> = {};
  const catIndex: Record<string, Record<string, number>> = {};
  attributes.forEach((attr, a) => {
    role[attr.role] = a;
    index[attr.id] = a;
    catIndex[attr.id] = Object.fromEntries(attr.categories.map((c, i) => [c.id, i]));
  });
  const codec: PopCodec = {
    attributes,
    sizes,
    strides,
    cells: stride,
    role,
    index,
    category(attributeId, categoryId) {
      const i = catIndex[attributeId]?.[categoryId];
      if (i === undefined) throw new Error(`pop model ${model.id}: no category "${categoryId}" in "${attributeId}"`);
      return i;
    },
    get: (key, a) => Math.floor(key / strides[a]!) % sizes[a]!,
    with: (key, a, c) => key + (c - (Math.floor(key / strides[a]!) % sizes[a]!)) * strides[a]!,
  };
  cache.set(model, codec);
  return codec;
}
