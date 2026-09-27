export interface PairHistory {
  giverUid: string;
  receiverUid: string;
  count: number;
  lastRoundId: string;
}

export type Assignment = Map<string, string>;

const forbidden = 1_000_000_000;

export function pairKey(giverUid: string, receiverUid: string): string {
  return JSON.stringify([giverUid, receiverUid]);
}

function minimumCostAssignment(costs: number[][]): number[] | null {
  const size = costs.length;
  const potentialRows = Array(size + 1).fill(0);
  const potentialColumns = Array(size + 1).fill(0);
  const matchedRow = Array(size + 1).fill(0);
  const previousColumn = Array(size + 1).fill(0);
  for (let row = 1; row <= size; row += 1) {
    matchedRow[0] = row;
    let column = 0;
    const minimum = Array(size + 1).fill(forbidden);
    const visited = Array(size + 1).fill(false);
    do {
      visited[column] = true;
      const currentRow = matchedRow[column];
      let nextColumn = 0;
      let change = forbidden;
      for (let candidate = 1; candidate <= size; candidate += 1) {
        if (visited[candidate]) continue;
        const proposed = costs[currentRow - 1][candidate - 1]
          - potentialRows[currentRow] - potentialColumns[candidate];
        if (proposed < minimum[candidate]) {
          minimum[candidate] = proposed;
          previousColumn[candidate] = column;
        }
        if (minimum[candidate] < change) {
          change = minimum[candidate];
          nextColumn = candidate;
        }
      }
      if (change >= forbidden / 2) return null;
      for (let candidate = 0; candidate <= size; candidate += 1) {
        if (visited[candidate]) {
          potentialRows[matchedRow[candidate]] += change;
          potentialColumns[candidate] -= change;
        } else {
          minimum[candidate] -= change;
        }
      }
      column = nextColumn;
    } while (matchedRow[column] !== 0);
    do {
      const nextColumn = previousColumn[column];
      matchedRow[column] = matchedRow[nextColumn];
      column = nextColumn;
    } while (column !== 0);
  }
  const receivers = Array(size).fill(-1);
  for (let column = 1; column <= size; column += 1) {
    receivers[matchedRow[column] - 1] = column - 1;
  }
  return receivers.every((receiver, row) => costs[row][receiver] < forbidden / 2)
    ? receivers : null;
}

export function matchParticipants(
  participantIds: string[],
  excludedPairs: Array<[string, string]>,
  pairHistory: PairHistory[],
  previousRoundId: string | null,
  random: () => number = Math.random,
): Assignment | null {
  const size = participantIds.length;
  if (size < 4 || size > 40 || new Set(participantIds).size !== size) return null;
  const excluded = new Set(excludedPairs.flatMap(([a, b]) => [pairKey(a, b), pairKey(b, a)]));
  const history = new Map(pairHistory.map((record) => [pairKey(record.giverUid, record.receiverUid), record]));
  const costs = participantIds.map((giverUid) => participantIds.map((receiverUid) => {
    if (giverUid === receiverUid || excluded.has(pairKey(giverUid, receiverUid))) return forbidden;
    const prior = history.get(pairKey(giverUid, receiverUid));
    const reverse = history.get(pairKey(receiverUid, giverUid));
    return (prior?.lastRoundId === previousRoundId && previousRoundId !== null ? 10_000 : 0)
      + (prior?.count ?? 0) * 100
      + (reverse?.count ?? 0) * 20
      + Math.floor(random() * 10);
  }));
  const chosen = minimumCostAssignment(costs);
  if (!chosen) return null;

  const score = (assignment: number[]): number => {
    let total = assignment.reduce((sum, receiver, row) => sum + costs[row][receiver], 0);
    for (let row = 0; row < size; row += 1) {
      if (assignment[assignment[row]] === row && row < assignment[row]) total += 50;
    }
    return total;
  };
  // Receiver swaps preserve the one-to-one invariant while reducing avoidable
  // two-person exchanges. Hard exclusions are never relaxed.
  for (let pass = 0; pass < size; pass += 1) {
    const original = score(chosen);
    let best = original;
    let pair: [number, number] | null = null;
    for (let a = 0; a < size; a += 1) for (let b = a + 1; b < size; b += 1) {
      if (costs[a][chosen[b]] >= forbidden / 2 || costs[b][chosen[a]] >= forbidden / 2) continue;
      [chosen[a], chosen[b]] = [chosen[b], chosen[a]];
      const candidate = score(chosen);
      [chosen[a], chosen[b]] = [chosen[b], chosen[a]];
      if (candidate < best) { best = candidate; pair = [a, b]; }
    }
    if (!pair) break;
    [chosen[pair[0]], chosen[pair[1]]] = [chosen[pair[1]], chosen[pair[0]]];
  }
  return new Map(participantIds.map((giverUid, row) => [giverUid, participantIds[chosen[row]]]));
}
