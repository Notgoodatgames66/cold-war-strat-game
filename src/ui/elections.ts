/**
 * Words for election results. Formatting only; the results come from the
 * engine (sim/politics/elections.ts).
 */

import type { ElectionResult, PoliticsModelData } from '../sim/politics/types';

export const partyLabel = (model: PoliticsModelData, id: string): string => model.legislature.parties.find((p) => p.id === id)?.label ?? id;
export const partyMembers = (model: PoliticsModelData, id: string): string => model.legislature.parties.find((p) => p.id === id)?.members ?? id;

/** Seats a party holds in a chamber after the election, and the change. */
export function partySeats(model: PoliticsModelData, r: ElectionResult, chamber: string, party: string): { seats: number; change: number } {
  let seats = 0;
  let change = 0;
  for (const f of model.legislature.factions) {
    if (f.party !== party) continue;
    seats += r.seats[chamber]?.[f.id] ?? 0;
    change += r.change[chamber]?.[f.id] ?? 0;
  }
  return { seats, change };
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

/** "Democrats 235 (−28) in the House and 49 (−5) in the Senate." */
export function congressLine(model: PoliticsModelData, r: ElectionResult): string {
  const first = model.legislature.parties[0]!;
  const parts = model.legislature.chambers.map((ch) => {
    const s = partySeats(model, r, ch.id, first.id);
    return `${s.seats} (${signed(s.change)}) in the ${ch.label}`;
  });
  return `${first.members} ${parts.join(' and ')}`;
}

/** Last name of a candidate, for headlines. */
export const surname = (name: string): string => name.replace(/,? (Jr\.|Sr\.|III)$/, '').split(' ').pop() ?? name;

/** A one-sentence summary of an election for the wire. */
export function electionStatus(model: PoliticsModelData, r: ElectionResult, previousLeader: string): string {
  if (r.kind === 'executive' && r.candidates && r.winner) {
    const w = r.candidates.find((c) => c.name === r.winner)!;
    const l = r.candidates.find((c) => c.name !== r.winner)!;
    const verb = r.winner === previousLeader ? 'is re-elected' : `defeats ${l.name}`;
    return `Election day: ${w.name} ${verb}, ${w.electoral}–${l.electoral} in the Electoral College. ${congressLine(model, r)}.`;
  }
  return `Midterms: ${congressLine(model, r)}.`;
}

/** Headline for a presidential election. */
export function electionHeadline(model: PoliticsModelData, r: ElectionResult, previousLeader: string, previousParty: string): string {
  const w = r.candidates?.find((c) => c.name === r.winner);
  if (!w) return `The election of ${r.year}`;
  if (w.name === previousLeader) return `${surname(w.name)} wins a second term`;
  if (w.party === previousParty) return `${surname(w.name)} holds the White House for the ${partyMembers(model, w.party)}`;
  return `${surname(w.name)} takes the White House`;
}

/** The region share (pop-model order) as a map measure value, NaN where nobody voted. */
export const regionShares = (r: ElectionResult): number[] => (r.regionVote ?? []).map((v) => (v < 0 ? NaN : v));
