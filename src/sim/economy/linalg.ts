/**
 * Small dense linear algebra for the input–output model (7×7 matrices).
 */

export type Matrix = number[][];
export type Vector = number[];

export const zeros = (n: number): Vector => new Array<number>(n).fill(0);

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

export function matVec(M: Matrix, v: Vector): Vector {
  return M.map((row) => row.reduce((sum, m, j) => sum + m * v[j]!, 0));
}

/** Row vector times matrix: (v · M)_j = Σ_i v_i M_ij. */
export function vecMat(v: Vector, M: Matrix): Vector {
  const n = M[0]?.length ?? 0;
  const out = zeros(n);
  for (let i = 0; i < M.length; i++) {
    for (let j = 0; j < n; j++) out[j]! += v[i]! * M[i]![j]!;
  }
  return out;
}

export const dot = (a: Vector, b: Vector): number => a.reduce((sum, x, i) => sum + x * b[i]!, 0);
export const sum = (v: Vector): number => v.reduce((s, x) => s + x, 0);

/** Inverse by Gauss–Jordan elimination with partial pivoting. Throws if the matrix is singular. */
export function invert(M: Matrix): Matrix {
  const n = M.length;
  const a = M.map((row, i) => [...row, ...identity(n)[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) throw new Error('Matrix is singular and cannot be inverted');
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const p = a[col]![col]!;
    for (let c = 0; c < 2 * n; c++) a[col]![c]! /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) a[r]![c]! -= f * a[col]![c]!;
    }
  }
  return a.map((row) => row.slice(n));
}

/** The domestic Leontief inverse (I − diag(d)·A)⁻¹, where d is each product's domestic share. */
export function leontiefInverse(A: Matrix, domesticShare: Vector): Matrix {
  const n = A.length;
  const M = identity(n).map((row, i) => row.map((v, j) => v - domesticShare[i]! * A[i]![j]!));
  return invert(M);
}
