/**
 * The full-screen announcement of a presidential election: who won, the
 * Electoral College and popular vote, the new Congress, and the map.
 */

import { content } from '../sim/loadContent';
import { electoralVotes } from '../sim/politics/elections';
import type { ElectionResult } from '../sim/politics/types';
import type { GameState } from '../sim/schema';
import { congressLine, electionHeadline, partyLabel, regionShares } from './elections';
import { ELECTION_PALETTE, StateMap, hasStateMap } from './StateMap';
import { SuperEvent } from './SuperEvent';

interface Props {
  game: GameState;
  result: ElectionResult;
  /** The head of government before the election. */
  previous: { name: string; party: string };
  onClose(): void;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function ElectionEvent({ game, result, previous, onClose }: Props) {
  const nation = game.nations[game.playerNation];
  const politics = nation?.politics;
  const model = politics ? content.politics[politics.model] : undefined;
  const popModel = nation?.pops ? content.pops[nation.pops.model] : undefined;
  if (!nation || !politics || !model || !popModel || !result.candidates || !result.winner) return null;

  const winner = result.candidates.find((c) => c.name === result.winner)!;
  const loser = result.candidates.find((c) => c.name !== result.winner)!;
  const shares = regionShares(result);
  const electors = electoralVotes(model, popModel, politics, result.year);
  const first = model.legislature.parties[0]!.id;
  const carried = shares.filter((s, i) => electors[i]! > 0 && Number.isFinite(s) && (winner.party === first ? s > 0.5 : s < 0.5)).length;
  const kept = winner.name === previous.name;
  const sameParty = winner.party === previous.party;

  const paragraphs = [
    `${winner.name} (${partyLabel(model, winner.party)}) carries ${carried} states and ${winner.electoral} electoral votes to ${loser.electoral} for ${loser.name}, with ${pct(winner.vote)} of the two-party vote.`,
    `In the new Congress: ${congressLine(model, result)}.`,
    kept
      ? `A second term brings a smaller honeymoon, and political capital is topped up to ${model.capital.newTerm}.`
      : `${sameParty ? 'The party keeps the White House, but a new President' : 'A new President, a new party in power'}: opinion turns around at once, the honeymoon starts, and political capital resets to ${model.capital.newTerm}.`,
  ];

  return (
    <SuperEvent
      event={{
        kicker: `Election day · November ${result.year}`,
        headline: electionHeadline(model, result, previous.name, previous.party),
        paragraphs,
        action: 'To the desk',
      }}
      onClose={onClose}
    >
      {hasStateMap(popModel) && shares.length > 0 && (
        <StateMap
          model={popModel}
          eyebrow="How the states voted"
          measures={[
            {
              id: 'vote',
              label: `${partyLabel(model, first)} share of the two-party vote`,
              values: shares,
              format: (v) => pct(v),
              diverging: true,
              center: 0.5,
              minSpan: 0.2,
              palette: ELECTION_PALETTE,
            },
          ]}
        />
      )}
    </SuperEvent>
  );
}
