# Politics: opinion, interest groups, Congress and elections

*Plain-English notes on how the game simulates American politics. Code: `src/sim/politics/` (opinion, groups, bills, elections) and `src/sim/orders.ts`. Data: `data/politics/usa-1949.json`, generated from the readable tables in `tools/usa_1949_politics.py`.*

Politics is built on the pops (see `pops.md`). Every pop has an opinion of the President, belongs in part to interest groups and casts votes. Congress is made of factions that answer to those groups. As with pops, one structure serves every nation; what differs is data. Only the United States has a politics model so far.

## Opinion of the President

Each pop's approval of the President is a logistic curve of a sum of effects, measured in log-odds:

- **A national intercept**, calibrated so that approval among people who may vote starts at **Truman's 69%** (Gallup, January 1949).
- **Party leaning**, the New Deal coalition written as effects by attribute. Catholics, Jews, Black voters, union households and city dwellers lean Democratic. Protestants outside the South, business owners, farm owners and suburbanites lean Republican. An interaction makes white Southerners solidly Democratic (+1.6). Leaning counts for the President's party and against the other one, at a weight of 0.7.
- **The economy**, smoothed with a memory of half a quarter:
  - each point of unemployment above 4.5% costs 0.12 log-odds (about three points of approval) among exposed groups, most of all industrial workers;
  - inflation above 3% hurts, and so does deflation below −1%;
  - growth in living standards helps.
- **The cost of governing**: 0.04 log-odds a quarter in office (Mueller's "coalition of minorities"). A new President starts with a **honeymoon** of 0.5 that fades by a fifth each quarter.
- **Pocketbook effects of policy.** A welfare rise pleases the retired and costs among managers.

**Who may vote** follows the 1949 rules:

- The voting age is 21, so 60% of the 15–29 band may vote.
- Poll taxes, literacy tests and white primaries kept most Black Southerners off the rolls. Registration ran from about 2% in Mississippi to 25% in Tennessee.
- First-generation Asian immigrants could not naturalise until 1952.

Turnout is 58% of those enrolled. It is lower in the one-party South, among tenants and among the young, and higher among professionals and managers. National approval is the average over people who may vote.

## Interest groups

Thirteen groups, Victoria 3 style:

1. Organised labour
2. Big business
3. Small business
4. Farmers
5. The military-industrial complex
6. Southern segregationists
7. The civil rights movement
8. The churches
9. Anti-communists
10. Veterans
11. Isolationists
12. Intellectuals
13. The radical left (the Old Left in 1949; later the New Left, SDS and the Black Panthers)

- **Members.** Each pop belongs in part, by a base rate times factors by attribute, capped at one.
  - Labour draws on industrial workers.
  - The churches draw on the devout of each faith.
  - Segregationists draw on white Southerners.
  - The radical left is 0.2% of eligible adults in the cities.
- **Lock-in.** Some groups grow with the money spent on them, raised to an elasticity. The military-industrial complex grows with defence spending (0.8), and veterans with welfare (0.3). Spending creates its own constituency.
- **Clout** combines three things:

  ```
  clout = 0.45 × wealth share + 0.25 × numbers share + 0.30 × organisation × √numbers share
  ```

  It is normalised so that all groups sum to one. Wealth is weighted by income squared, because wealth is far more concentrated than income. Organisation counts in proportion to the square root of size, so a tiny, disciplined cell is still tiny.
- **Approval** is a calibrated intercept (each group's 1949 mood) plus three terms: what the group wants times how each lever has moved since 1949; its reaction to conditions (unemployment, inflation, growth); and a party term, positive when its party holds the White House.

Clout at the start:

| Group | Clout | Group | Clout |
| --- | --- | --- | --- |
| Organised labour | 17% | Farmers | 7.3% |
| Veterans | 12% | Big business | 6.6% |
| The churches | 11% | Isolationists | 6.1% |
| Small business | 10% | Intellectuals | 5% |
| Anti-communists | 9.5% | Military-industrial complex | 4.2% |
| Segregationists | 8.7% | Civil rights | 1.9% |
| | | Radical left | 0.8% |

## Political capital

Capital starts at 30 and is capped at 100. Each quarter it regenerates by 3 + 12 × (approval − 50%) ÷ 100: about +5 at 69% approval and −1 at 30%.

Capital is spent on bills. A defeat costs 3 more. A passed bill pays 4 × the chance it had of failing, so long shots that come off pay best and sure things pay nothing. Trying bills never pays on average, so capital cannot be farmed. A new President starts with 40.

## Congress and bills

The 81st Congress (1949–51) is split into four factions:

| Faction | House | Senate | Listens to |
| --- | --- | --- | --- |
| Southern Democrats | 103 | 22 | Segregationists, farmers, anti-communists, the military-industrial complex, churches |
| Northern Democrats | 161 | 32 | Labour, civil rights, intellectuals, churches, veterans, farmers, the radical left |
| Taft Republicans | 100 | 24 | Small business, isolationists, big business, farmers, anti-communists |
| Internationalist Republicans | 71 | 18 | Big business, anti-communists, small business, farmers, veterans |

**Every change the player orders on the Treasury desk is a bill.** A faction's members vote yes with probability logistic(*u*):

```
u = salience × Δ × (Σ group weight × group preference + faction stance) − statusQuo × |Δ|
  + loyalty (the President's party) or − opposition (the other party)
  + ownFaction (the President's own faction)
  + approvalPull × (approval − 50)
  + groupPull × Σ group weight × (group approval − 50)
  + capitalPerPoint × capital spent
```

Δ is the size of the change in a comparable unit:

- budgets are measured in log points (+0.1 is about +10%);
- taxes are measured per 10 points of rate;
- switching budget indexation on counts as 0.5, about what indexation adds to every line over seven or eight years of growth and inflation.

A faction weighs what its groups and its own tradition want, resists change of any kind, and follows or opposes its party's leader. It is swayed by how popular he is with the public and with its own groups.

A chamber's expected yes share is the seat-weighted average of its factions. The count on the day adds normal noise (6% of seats: absences, cross-voting, last-minute deals), and the bill needs a strict majority in both chambers:

```
odds = Π over chambers Φ((expected yes − majority needed) ÷ 0.06)
```

At turn end the roll draws exactly that noise from the `orders:congress` stream, so the odds the player saw are the odds that were rolled. The vote counts are recorded.

**Calibration.** The parameters were tuned to the 81st Congress, the Conservative Coalition of Southern Democrats and Republicans. Odds at the start of 1949, with no capital spent:

| Bill | Odds | With 20 capital | With 40 capital |
| --- | --- | --- | --- |
| Welfare +5% | 93% | 100% | 100% |
| Welfare +20% | 60% | 94% | 98% |
| Welfare +50% | 6% | 27% | 46% |
| Double health and education (national health insurance) | 5% | 21% | 37% |
| Defence +25% (the 70-group Air Force) | 99% | | |
| Defence −25% | 2% | 32% | 63% |
| Foreign aid +20% | 71% | 97% | 99% |
| Income tax −2 points | 100% | | |
| Income tax +2 points | 7% | 52% | 78% |
| Corporate tax +5 points | 0% | 7% | 17% |
| Index the budget | 1% | 21% | 47% |

Bills turn against an unpopular President. At 30% approval, welfare +20% falls by more than 20 points.

## Elections

Congressional elections fall every other November from 1950; presidential elections every four years from 1952. They resolve in the fourth quarter.

1. **Reapportionment.** After each census, the House is shared out again from the pops by the method of equal proportions (Huntington–Hill). The new seats take effect at the next election. From the 1950 pops it reproduces the actual 1950 apportionment within one seat in every large state.
2. **The vote.** Every pop who may vote votes by its party leaning, plus a national tide towards the President's party:
   - 0.009 log-odds per point of approval above 50%, about 0.22 points of vote (Tufte; Abramowitz);
   - −0.07 in midterms;
   - +0.15 when the incumbent runs;
   - plus the nominees' personal appeal (Eisenhower +0.25, Goldwater −0.2, McGovern −0.25…).

   The seeded swings come from the `elections:<nation>` stream: nationally about 2.5 points of vote, and in each state about 2 points more.
3. **Seats.** Within each bloc (the eleven states of the former Confederacy, and the rest), the Democratic seat share follows the seats–votes curve logit(seats) = 2 × logit(votes) + bias. The swing ratio of 2 is Tufte's. The bias is calibrated per chamber and bloc so that the starting vote gives the 81st Congress. The whole House is elected each time. The Senate moves a third of the way towards its target. Each party's seats in a bloc go to its factions based there, in proportion to the seats they held.
4. **The President.** States vote winner-take-all through an Electoral College of House seats plus two per state: 531 votes, and 534 once DC votes from 1964. Alaska and Hawaii are not modelled.
   - An incumbent with terms left (two elected terms at most) and at least 40% approval runs again.
   - Otherwise the party runs the first historical nominee for that year who may still serve.
   - A new President takes office at once, with a honeymoon and 40 capital. Opinion and the interest groups turn around because the party in power has changed.
   - A re-elected President gets half a honeymoon and capital topped up to 40.

With hands-off play, results vary by seed but look like the period: landslides and squeakers, divided government, and occasional Republican Houses. The Solid South stays Democratic throughout.

## What the player sees

- **Treasury desk.** Each drafted change shows a bill strip: the odds of passing, a capital stepper and a whip count by faction. Last quarter's results appear at the top, with the votes in each chamber.
- **Politics tab.**
  - Approval, capital and seats.
  - Approval by group, and a state map of approval and of the vote if held today.
  - Interest group cards: clout, approval, members and demands.
  - Congress as hemicycles with a faction table and last quarter's bills.
  - The record of elections.
  - Trend charts.
- **Wire.** Bill results and midterm results.
- **Presidential elections** get a full-screen announcement with the electoral map.

## Known gaps

- **No realignment yet.** Party leanings are fixed at 1949 values, so the Solid South never breaks and Black voters do not move further towards the Democrats. Civil rights, the Southern Strategy and the culture wars need the events engine.
- **The franchise is fixed.** The Voting Rights Act (1965) and votes at 18 (1971) will arrive as events that change the franchise table.
- **Apportionment inherits the pops' migration bias.** Internal migration in the pops keeps the Northeast too large and the Sun Belt too small by 1980, because the model has no regional industry to push people out of the Rust Belt. The House seated from 1972 after the 1970 census, game against history:

  | State | Game | History |
  | --- | --- | --- |
  | California | 53 | 43 |
  | New York | 45 | 39 |
  | Pennsylvania | 32 | 25 |
  | Texas | 22 | 24 |
  | Florida | 13 | 15 |

  Regional industry is the fix.
- **Two parties only.** There are no Dixiecrat or Wallace candidacies and no primaries; nominees come from historical lists.
- **No filibuster.** The Senate passes bills by simple majority. Cloture (two-thirds until 1975) matters for civil rights, which arrives with events.
- **Bills change one lever each.** There is no logrolling or omnibus bill, and no override of Congress, since the player is the President.
- **Fixed faction balance inside parties.** Seats are shared in proportion to what factions held, so the Taft–internationalist balance and the Southern Democrats' weight change only through elections. They cannot change through ideological drift.
- **Presidents never die or resign.** There is no succession yet.
- **Swings may run large.** Approval moves a lot (honeymoons, the cost of governing), so some midterms swing harder than the historical record (60–75 seats against a post-war maximum of about 55).

## Parameters (data/politics/usa-1949.json)

| Block | What it holds |
| --- | --- |
| `voting` | Age shares, franchise by race and state, turnout factors |
| `opinion` | Starting approval, party leaning and interactions, economy effects, term decay, honeymoon, policy effects |
| `interestGroups` | Membership, organisation, lock-in, party, starting approval, preferences, conditions |
| `legislature` | Parties, chambers, factions (seats, base, groups, stances), core regions, 1940 apportionment, bill parameters |
| `capital` | Start, cap, regeneration, failure penalty, victory bonus, new-term capital |
| `clout` | Weights of wealth, numbers and organisation |
| `elections` | Calendar, approval effect, midterm penalty, incumbency, swing ratio, national and regional noise, retirement threshold, normal vote, electors, census years, historical nominees |
| `leader` | Truman, Democratic, Northern Democrat, one elected term |

Every figure is an estimate with its reasoning in the `note` fields. The file stays `"verification": "unchecked"` until Ryan has checked it against the sources listed in it.
