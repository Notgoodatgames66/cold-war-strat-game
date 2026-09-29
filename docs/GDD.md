# Cold War Grand Strategy Simulator — Game Design Document

Written 29 September 2026 by Ryan (creative director) with Claude. The living, editable copy is the Claude Doc this file was exported from; keep this file in step with it when decisions change.

## 🎯 Vision and design pillars

A deep, calculation-driven grand strategy sandbox of the Cold War. Economic and military power drive everything, and domestic politics constrains what you can do with them. The player guides a nation as its "spirit" from Q1 1949 to Q4 2000: 208 quarterly turns.

**Player fantasy:** steer a superpower through arms races, crises, booms, strikes and elections, briefed each quarter by a right-hand advisor who tells you what is happening and what your options are.

| Pillar | What it means in practice |
| --- | --- |
| Economic and military power first | GDP, production, resources and force strength are the core loop. Politics and society shape and limit them. |
| Real economic history | The Keynesian consensus, Bretton Woods, the Fed–Treasury fight and input–output production are modelled mechanics, not decoration. |
| Everything is calculated | Figures drive other figures. Dwarf Fortress-style depth, with a turn budget of up to 10 seconds. |
| Plausible, not predetermined | History is the likeliest path. Alt-history is always possible but costs effort, luck or both. |
| Fog and misperception | Domestic statistics are perfect. Foreign statistics and intentions arrive as ranges. Rival AI suffers the same fog. |
| Friction without tedium | Political capital, administrative capacity and policy lags create challenge. Delegation removes micromanagement. |
| Sandbox endings | The player sets their own goals. The only true defeat is your state ceasing to exist. |

**Non-goals:** no language AI in the game, no voice acting, no realistic 3D graphics. Simple, stylistic and fast beats realistic and slow.

## 📦 Alpha scope

The alpha is one scenario: the United States from Q1 1949, at the start of Truman's second term. The engine runs to Q4 2000, but historical content is written first for 1949–1960. Starting in Q1 lets the player shape NATO (April 1949), the Soviet bomb (August 1949) and the fall of China (October 1949).

**In the alpha**

- Full US simulation: pops, seven sectors, input–output production, fiscal and monetary policy, Congress factions, interest groups, states with key political decisions.
- The USSR as the full-depth main rival, including its own factions.
- Tier 2 and 3 nations at reduced depth; every nation takes part in the global commodity market.
- Keynesian post-war consensus as the only economic engine.
- Military units, nuclear programme, intelligence pillar, DEFCON, blocs and institutions.
- Events engine with the first 50–100 hand-authored events and reusable event pools.
- Dashboard, drill-down screens, charts, sortable tables and CSV export.

**Deliberately not in the alpha** (full list in the last section)

- Other playable nations and alternative economic engines.
- Interactive map, soundtrack, tutorial, accessibility options.
- Separatist regions, dynamic tier promotion, modding tools.

## ⚙️ Engine architecture

The engine is a deterministic, data-driven simulation. Code holds the rules, plain data files hold the content, and a seeded random number generator makes every run reproducible.

**Core principles**

1. **Simulation separate from interface.** The simulation core knows nothing about screens. It takes the world state plus the player's orders and returns the next quarter's state.
2. **Data-driven content.** Nations, sectors, pops, events, technologies and modifiers live in JSON or YAML files, never hard-coded.
3. **One universal nation schema at different resolutions.** Every nation uses the same data structure; minor states simply have fewer pops and coarser sectors. This is what makes later tier promotion possible.
4. **Data-oriented storage.** Pops and units are stored as packed arrays, and pops below a size threshold merge into a neighbour.
5. **Staggered updates.** Slow-moving systems update less often (table below).
6. **Seeded RNG.** Same seed plus same choices gives the same history. This underpins saves, shareable worlds, debugging and Monte Carlo testing.
7. **Full history.** Every stat is stored for every quarter.

**Resolution by tier** (design targets, to be tuned)

| Tier | Example | Pops | Economy | Politics |
| --- | --- | --- | --- | --- |
| Player | USA | 20,000–60,000 live pops | 7 sectors, full input–output | Factions, interest groups, states |
| Main rival | USSR | 2,000–5,000 (republic × nationality × class) | 7 sectors, input–output | Full bespoke factions |
| Major | UK, France, China | A few hundred | 7 sectors | Universal framework, some bespoke |
| Regional | Italy, India, Iran | 50–100 | 3 sectors | Universal framework |
| Minor | Portugal (mid), Luxembourg (aggregate) | 5–20 | Commodities + aggregate output | Template, mostly dormant |

**Update frequency**

| Frequency | Systems |
| --- | --- |
| Instant | Threshold checks after drastic player actions (revolt, coup, market panic) |
| Every quarter | Economy, production, trade, opinion, military, AI decisions, events |
| Every year | Births, deaths, ageing, migration, technology diffusion |
| Every few years | Religious and ethnic composition shifts, faction ideology drift |

**Performance budget:** up to 10 seconds per turn. Early estimates put a full US pop model at a few million operations per quarter, which is well under one second. The budget leaves decades of headroom for added depth.

**Recommended stack:** TypeScript for all code. The simulation runs in a Web Worker so the interface never freezes during the calculation. React for the interface, a charting library such as Apache ECharts, and JSON save files. It runs in any browser, and can be wrapped as a desktop app later.

## ⏳ Turn structure

Each turn is one quarter, from Q1 1949 to Q4 2000: 208 turns, each in four phases. Quarterly turns may be revisited in later versions.

1. **Briefing.** The advisor's report, headline figures, and the quarter's opening events.
2. **Decision.** Set policy sliders, launch projects, take diplomatic, military and covert actions, and respond to events.
3. **Resolution.** The engine calculates the new world state (up to 10 seconds).
4. **Report.** Newspaper page, charts, and consequences.

**Interrupts.** Events can break into the Decision phase only when the player's own action caused them. Drastic actions carry an instant check: a cheap threshold test (for example unrest against stability) run without recalculating the world. If it trips, the consequence fires immediately.

**Action economy.** Two budgets limit what you can do each quarter:

- **Political capital** is spent on legislation, megaprojects and weathering scandals. It regenerates with approval and victories and drains with failures. Expanded in later versions.
- **Administrative capacity** represents government attention. It grows with bureaucracy and technology and is drained by micromanagement.

**Decision Sequences.** Pivotal moments play out as short event trees with mini-resolutions. Only the variables that matter to the moment update; the full economy is skipped. One system serves two uses:

- **Elections:** primaries, conventions and campaigns. Each choice shifts the odds without deciding the outcome, and the final roll uses the seeded RNG.
- **Crises:** Berlin, Korea, Cuba and the like. Only DEFCON, readiness, rival posture, public opinion and alliance cohesion update between stages.

## 💰 Economy

The economy is a full national-accounts model built up from seven sectors, running on a Keynesian post-war consensus engine. Output is the sum of household consumption, investment, government spending and net exports:

```latex
Y = C + I + G + (X - M)
```

**Sectors:** agriculture, heavy industry (steel, coal), energy, consumer goods, technology and R&D, services and finance, shipping and trade. Sectors grow or decline in response to policy, demand, technology and resources.

**Fiscal policy** works on two layers:

- **Standing sliders** for defence, welfare, infrastructure, R&D, education, health and foreign aid. Each slider adds or removes modifiers across the economy.
- **Megaprojects** such as the Interstate Highway System. They cost heavily up front and their benefit ramps up as construction proceeds. A project with a full effect of +10% trade over 8 quarters gives +5% at quarter 4.
- **Taxes** are split into income, corporate, tariffs and excise.

**Monetary policy and the dollar**

- The Fed pegs Treasury rates in 1949. Monetary independence is a political fight you can win or lose, as the real 1951 Accord was.
- Interest rates, money supply and inflation are tracked.
- Bretton Woods is a core mechanic: the $35 gold peg, gold reserves, the balance of payments, and the dollar's reserve role. The growing strain on the peg (the Triffin dilemma) should emerge from the model, not a script.
- Every money figure is tracked both in current dollars and in constant 1949 dollars, so inflation visibly erodes budgets.

**Economic statecraft:** aid packages, loans, embargoes and export controls (CoCom), tariffs, trade blocs (GATT), sanctions and currency pressure. Aid builds influence, but heavy dependence can breed resentment.

**Cycles and shocks:** moderate, realistic business cycles plus shocks delivered through events, spread across the full range from catastrophic to windfall.

**Labour:** wages, unemployment and union strength are tracked. Low wages or high inflation raise strike risk and radicalism.

**Alternative systems:** nationalisation or planning will eventually switch the whole engine (planned targets, shortages, black markets). The alpha ships the Keynesian engine only, but the code is structured so an engine can be swapped.

## 🏭 Resources and production

Production follows a Leontief input–output model: every unit a sector produces consumes fixed amounts of other sectors' output and raw materials. Technology improves those amounts over time. Leontief built exactly this kind of table for the US economy in the 1940s, so the mechanic is historically grounded.

Gross output needed to meet final demand is:

```latex
x = (I - A)^{-1} d
```

Here A is the matrix of input coefficients (how much of each input one unit of output needs), d is final demand, and x is gross output by sector.

**Shortages bind.** When an input runs short, output falls to what the scarcest input allows. Steel with too little iron ore produces less steel, which starves tanks, cars and ships downstream.

```latex
\text{output} = \min_i \left( \frac{\text{available}_i}{a_i} \right)
```

**Technology moves the coefficients.** A new steelmaking process might cut ore per tonne, letting the same ore produce more steel.

**Military production draws on the same pool.** A large war such as Korea or Vietnam drains materials from the civilian economy. Mobilisation from peacetime to a war economy takes time and costs output.

**Global commodity market.** Every nation produces and consumes 10–15 key commodities, with 1949 production distributed as it really was: oil, coal, iron ore, grain, rubber, tin, copper, bauxite, uranium, cotton, and strategic metals such as chromium and tungsten. Prices respond to supply and demand, and strategic stockpiles can be built. This is what makes oil shocks and embargoes work.

**Depth by tier.** The USA and USSR run the full input–output model. Major powers run it at 7 sectors, regional powers at 3. Minor states trade commodities and report aggregate output.

## ⚔️ Military and nuclear

Military power is made of countable units with quality modifiers, built from the same resource chains as the civilian economy. Nuclear policy is a central pillar, modelled from a realist standpoint.

**Forces**

| Branch | Counted as |
| --- | --- |
| Army | Divisions |
| Navy | Carrier groups, surface fleet, submarines |
| Air Force | Bomber wings, fighter squadrons |
| Marines | Divisions |
| Strategic forces | Warheads and delivery systems |

Every unit carries quality modifiers: training, equipment generation, morale, doctrine, and the health of the population it recruits from.

**Nuclear programme**

- Warhead stockpile, delivery systems (bombers, then ICBMs, then SLBMs, each with its own technology path), the H-bomb decision, and second-strike capability as the basis of MAD.
- Nuclear weapons can be used. If your state is destroyed, the game ends. If a rival is destroyed without retaliation, the game continues in that new world.

**Manpower.** Draft or volunteer force, reserves, and post-1945 demobilisation. Casualties remove people from the matching pops, shrinking both workforce and population, and feed into public opinion.

**War.** Wars are split into theatres (Korea, Central Europe, and so on), each with a balance of forces and a progress bar. The player issues operational choices: offensive, hold, withdraw, escalate. Battles resolve through a combat system with seeded dice rolls, built simple first and expanded later.

**Global posture.** Overseas bases and deployments cost money and political capital, and give influence and faster response. Basing is a core tool of foreign policy.

**Escalation.** A global DEFCON level (5 to 1) raises everyone's alarm and drives worldwide remilitarisation. Each bilateral relationship also has its own tension score.

**Prestige and credibility.** Military strength and crisis behaviour generate credibility. Backing down costs it; standing firm builds it but raises tension.

**Technology.** Separate trees for military, civilian and intelligence work, with intelligence sharing the military tree. Related technologies discount each other:

```latex
\text{cost}_B = \text{base}_B \times (1 - \text{affinity}_{A,B}) \quad \text{if } A \text{ is researched}
```

Military jet engines might cut civilian jet engines by 90%. A distant pair, such as ARPANET and the civilian internet, gets a much smaller discount.

## 🕵️ Intelligence and covert operations

Intelligence is its own pillar with its own budget, agencies and capability ratings. It turns hidden pressures into visible estimates, and its quality decides how well you see the world.

**Agencies:** foreign intelligence, domestic security and counter-intelligence, and signals intelligence, each with capability ratings that grow with funding, technology and experience.

**Hidden variables.** Communist infiltration, fascist organising, military discontent and foreign money accumulate silently every turn. They shift the odds of elections, coups and revolutions. Police and intelligence work reveal them, usually as ranges.

**What you can see**

| Subject | Allies | Rivals |
| --- | --- | --- |
| Economy (GDP, output) | Near-exact | Range, narrowing with intelligence effort |
| Military strength | Narrow range | Wide range |
| Espionage activity | Range with a stated margin | Unknown without active intelligence work |
| Intentions | Partly visible through diplomacy | Hidden; uncovered by intelligence, and rivals can bluff |

Your own domestic statistics are always perfectly accurate.

**Unexplained residuals.** Tooltips show an "unexplained" line only once a gap passes a threshold. It could be genuine noise (bad harvests, measurement error) or hidden sabotage. Investigating costs resources and sometimes finds nothing. The same applies to politics: you may need to commission reports or surveys to learn why a group is turning against you.

**Covert operations:** coups, proxy support, sabotage, propaganda, election meddling, and backing friendly factions abroad while suppressing hostile ones.

**Intelligence penetration.** Each pair of nations tracks how deeply they have infiltrated each other. High penetration sharpens your estimates and unlocks blackmail and defector events; a rival's penetration of you does the same in reverse.

## 🏛️ Domestic politics

US politics is modelled through congressional factions, interest groups and states. Presidents make some policies easier and others harder, but never impossible.

**Institutions.** House and Senate seats are split by faction, not just party: Southern Democrats, Northern liberals, the Conservative Coalition, Taft Republicans, and Eisenhower-style internationalists. The Supreme Court has its own leaning. Factions for other nations (Soviet, British and so on) follow later.

**Presidents.** Each president has traits that tilt the cost of policies. A Taft-style Republican does not forbid a Marshall Plan, but Congress resists harder and the White House gives no boost. You can influence primaries, conventions and elections through Decision Sequences, shifting odds without fixing results.

**Interest groups** (Victoria 3 style): organised labour, big business, farmers, the military-industrial complex, Southern segregationists, the civil rights movement, churches, anti-communists, and more. Each has approval, clout and demands, and clout changes over time and with your decisions.

**Clout** combines money, numbers and organisation. The poor have little money to lobby with but can gain influence through unions, churches, protest and mass voting.

```latex
\text{clout} = w_1 \cdot \text{wealth} + w_2 \cdot \text{numbers} + w_3 \cdot \text{organisation}
```

**Lock-in.** Spending creates constituencies. The military-industrial complex grows with defence spending and makes cuts politically harder later; farm subsidies and welfare behave the same way.

**States** are demographic and electoral units (needed for the Electoral College) and political actors with key decisions. Southern states act to preserve segregation, which affects their pops, industry and politics.

**Regime change is a state transition, not a game over.** Coups, revolutions, constitutional crises and gradual constitutional reform are all possible, including deliberately engineered ones. When the regime changes, its mechanics change, and play continues. The player decides whether it counts as failure. Implausible outcomes, such as a monarchist USA, remain possible but demand sustained political manoeuvring.

## 👥 Population and society

Population is simulated as pops: groups of people who share every tracked attribute, each with a size. A pop of one million costs the same to calculate as a pop of one, so group-level figures are exact, not sampled.

**US pop attributes (1949)**

| Attribute | Categories |
| --- | --- |
| State | 48 |
| Race and ethnicity | 5 |
| Sex | 2 |
| Occupation and class | 8 |
| Religion | 5 |
| Age band | 4 |
| Urban, suburban, rural | 3 |

That allows about 230,000 combinations. Sparse storage keeps only pops above a size threshold, leaving roughly 20,000–60,000 live pops. More attributes and viewpoints can be added as the game develops.

**Opinion is additive.** Policies define effects per attribute, not per pop. A pop's reaction is its base opinion plus the sum of its attributes' modifiers, plus a few hand-picked interaction terms where history demands them (race × Southern state in the 1950s, for example). Content effort therefore grows linearly as attributes are added, not exponentially.

```latex
\text{opinion}_{pop} = \text{base} + \sum_{a \in pop} m_a + \sum \text{interactions}
```

**Demography** uses the cohort-component method: age bands advance, fertility and mortality apply per band, and migration flows between states. The Great Migration, the baby boom and suburbanisation should emerge from the model.

**Societal conditions** tracked and fed back into the rest of the model:

- Living standards, wages and housing
- Inequality (Gini) and racial inequality
- Education and literacy
- Health and life expectancy (an unhealthy population makes worse soldiers and workers)
- Crime, urbanisation and suburbanisation

**Social movements** (McCarthyism, civil rights, later the counterculture and anti-war movements) run as both pressure meters and event chains, and they cascade. An assassination deepens existing tensions and unrest; unrest makes further violence more likely.

**Tipping points.** Many systems are non-linear: calm until a threshold, then a cascade (unrest, bank panics, runaway inflation, regime collapse). Accumulated quantitative change flips into qualitative change.

## 🌍 Nations, diplomacy and blocs

The 1949 world is tracked in four tiers of decreasing depth, with the USSR as the single main rival. History is the likeliest path, but foreign elections, successions and crises resolve through probability tables shaped by hidden pressures.

| Tier | Depth | Nations |
| --- | --- | --- |
| Main rival | Full | USSR |
| Major powers | High | UK, France, China (ROC and PRC, civil war still live), West Germany (from May 1949), Japan (under occupation) |
| Regional powers | Medium | Italy, Canada, India, Yugoslavia, Turkey, Iran, Egypt, Poland, Brazil, Argentina, North and South Korea |
| Minor states | Light to mid | Everyone else; economically significant minors such as Portugal get mid resolution |

**Probability tables.** A French election with De Gaulle as favourite might run 75% De Gaulle, 20% main opponent, 4% dark horse, 1% coup or revolutionary seizure. Hidden variables (communist influence, fascist organising, military discontent, foreign money) shift those odds. The same applies to Soviet successions and Chinese civil war outcomes.

**Bilateral relationship variables:** opinion, trust, tension, trade dependency, military alignment, ideological distance, historical grievances, cultural and linguistic affinity, diaspora links, aid dependency and debt, arms supply dependency, territorial disputes, and intelligence penetration.

**Blocs as entities.** NATO, the Warsaw Pact, SEATO and others have cohesion, burden-sharing disputes, free-riders and possible defectors. Each bloc gets its own screen, such as a NATO summit screen.

**Diplomatic toolkit:** treaties, arms control, summits, recognition, ultimatums, guarantees, mediation, embargoes, basing deals and security pacts.

**International institutions** (UN with Security Council vetoes, IMF, World Bank, GATT) are real actors that function on their own. You meddle when you choose to, not every quarter.

**Decolonisation.** In the alpha, real states appear at roughly their historical dates. Later versions add separatist regions within existing states (Kurdistan, West Papua and others).

**Factions everywhere.** Every nation uses one universal faction framework: military, clergy, landowners, industrialists, labour, communists, nationalists, liberals and more. Key nations get bespoke factions (Iran: the Shah, the Tudeh Party, the ulama). Covert action can strengthen friendly factions abroad and weaken hostile ones. Later versions let faction ideologies drift, such as clergy moving towards civil rights or liberation theology.

**Future goal:** any nation can rise to great-power status, with the engine promoting its resolution as it becomes more important.

## 🧠 Rival AI and advisors

Rival nations use utility AI under the same fog as the player, so misperception emerges instead of being scripted. There is no language AI anywhere in the game: all advisor and event text is hand-authored.

**Utility AI.** Each nation scores its available actions against weighted desires (security, prestige, ideology, economy), then picks with seeded randomness so no two runs play identically.

```latex
\text{score}(a) = \sum_{k} w_k \cdot v_k(a)
```

**No cheating.** Rivals act on their own estimates of you, never the true figures. Overestimating your first-strike intent, or you imagining a missile gap, falls out of the model naturally.

**Personalities.** Aggression, risk tolerance, paranoia and ideological rigidity derive from the current leader and ruling factions, so Khrushchev's USSR plays differently from Brezhnev's.

**Hidden intentions.** Rivals hold secret goals that shift with leadership and conditions (a nationalist Indian government may covet war with Pakistan; a secular liberal one much less). Intelligence can uncover them, and rivals can bluff.

**Biased advisors.** Your advisor has a name and portrait and changes with each cabinet. A hawk may exaggerate the Soviet threat; a dove may downplay it. Advice is information to weigh, not truth to follow. Dialogue plays with a short babble sound, not a voice.

**Anti-exploit design.** Returns diminish across the board, and the world pushes back on repeated tricks:

- Heavy aid breeds dependency and then resentment.
- Repeated coups erode your global legitimacy.
- Arms build-ups provoke rivals to match you.

**Determinism.** AI decisions use only the seeded RNG, so a shared seed replays the same world.

## 🃏 Events

Events are hand-authored data files with triggers, state-dependent odds and effects, sorted into four presentation tiers. Ryan designs the ideas; Claude writes the files, triggers and balancing.

**Event fields**

| Field | Purpose |
| --- | --- |
| Triggers | Conditions that make the event eligible |
| Weight | Base odds, shifted by game state and hidden variables |
| Fire window | For historical anchors: the range of quarters in which it can happen |
| Chain links | Events this one sets up or blocks |
| Cooldown and exclusivity | Stops repeats and contradictions |
| Tier | Super, major, minor or newspaper |
| Options | Choices, each with effects and, for AI nations, a selection chance |

**Example event file** (illustrative, not balanced):

```yaml
id: soviet_atomic_test
tier: super
fire_window: { from: 1949-Q3, to: 1951-Q2 }
triggers:
  - ussr.nuclear_research >= 0.8
weight:
  base: 10
  modifiers:
    - if: ussr.espionage_penetration.usa > 0.5
      multiply: 1.5
effects:
  - ussr.warheads: +1
  - world.defcon_pressure: +1
  - usa.public_fear: +8
options:
  - id: crash_hbomb_programme
    label: Authorise a crash programme for the hydrogen bomb
    effects:
      - usa.research.thermonuclear: +0.3
      - usa.political_capital: -10
  - id: seek_arms_talks
    label: Propose international control talks
    effects:
      - usa.prestige: +2
      - congress.conservative_coalition.approval: -8
```

**Odds respond to the world.** Strikes grow likelier when inflation outpaces wages; defector windfalls grow likelier when intelligence spending is high. Randomness should feel earned.

**Spread of outcomes.** Events run the full range from catastrophic (an accidental nuclear detonation at an allied base) to windfall (a giant oil discovery, blackmail material on a rival leader), with most in between.

**Density per quarter:** about 1 major event, 2–4 minor events and a newspaper page of flavour. Super events are rare, roughly 1–3 per decade.

**Reusable pools.** Generic events (strikes, harvests, scandals, accidents) are drawn from pools and can recur. Only historical anchors are one-off, so the 208-turn length does not require 208 turns of unique content.

**Presentation by tier**

| Tier | Presentation |
| --- | --- |
| Super | Full-screen, heavily illustrated, multi-stage (in the style of TNO super events) |
| Major | Illustrated card with options (Paradox style) |
| Minor | Telegram, intel cable, or advisor dialogue by type |
| Newspaper | Headline plus smaller clickable articles on one front page |

## 📊 Stats, modifiers and information

About 30 headline stats sit on a front page, with nested drill-down screens beneath for each pillar (Economy, then its sectors, then deeper views in later versions). Every figure explains itself through a tooltip breakdown.

**Front page**

| Pillar | Headline stats |
| --- | --- |
| Economy | GDP, real growth, inflation, unemployment, budget balance, debt/GDP, trade balance, gold reserves |
| Military | Active manpower, nuclear warheads, delivery systems, readiness, defence % of GDP |
| Politics | Presidential approval, political capital, congressional support, stability, legitimacy |
| Society | Living standards, Gini, life expectancy, education, unrest |
| World | Prestige, global DEFCON, bloc cohesion, main rival tension |
| Intelligence | Agency capability, counter-intelligence strength, known foreign penetration |

**Tooltip breakdowns** show where every number comes from, for example: *Inflation 4.2% = base 2.0% + deficit spending 1.1% + war demand 1.4% − Fed policy 0.3%*. They double as the main debugging tool and half the tutorial.

**Universal modifiers.** Every buff and debuff has a source, target, value, duration and curve (instant, linear ramp, decay, or permanent). Megaproject ramps and event aftermaths are just modifiers.

**Power index.** A modified version of the CINC (Composite Index of National Capability, from the Correlates of War project). Standard CINC overweights population, so economic output and technology get more weight here. Sub-rankings (manufacturing, naval tonnage, warheads) sit beneath it, so the US can remain top overall while losing manufacturing leadership.

**Lags and inertia.** Fiscal stimulus peaks after several quarters, R&D pays off over years, and opinion has memory and momentum.

**Foreign estimates** are always shown as ranges, for example Soviet GDP $120–160bn, narrowing as intelligence improves.

**History and export.** Every stat is stored for every quarter, graphable across the whole game and exportable to CSV.

## 🎨 Visuals, UI and audio

The interface is in-world government paperwork combined with pixel art, and it ages with the era. Simple, stylistic and fast is the rule.

| Era | Interface style |
| --- | --- |
| 1949–1959 | Manila folders, typewriter fonts, TOP SECRET stamps, telegrams |
| 1960s–1970s | Early computer terminals and CRT war-room screens |
| 1980s–2000 | 1980s and 1990s computer UI |

**Icons.** A custom pixel icon set, not emoji, because emoji render differently on every operating system.

**Charts:** line charts for time series, stacked areas for sector shares, bar comparisons across nations, heatmaps of pop opinion by state and group, Sankey diagrams for resource flows through the input–output chain, and network graphs for alliances and relationships.

**Tables** are sortable, filterable and exportable to CSV.

**Real historical figures** appear by name with real photographs. Use public-domain images (most US federal government photos are), check each licence on Wikimedia Commons, and run them through a pixel or posterise filter for a consistent look. Famous press photos are often still copyrighted. Speeches can be too (Martin Luther King Jr.'s are held by his estate), so paraphrase or write original dialogue instead of quoting.

**Map.** No map in early builds, but all data is structured map-ready from day one. A later interactive map can use CShapes 2.0 (ETH Zürich), a dataset of historical country borders from 1886 onward.

**Advisor.** A named advisor with a portrait who changes with each cabinet, speaking in text with a short babble sound.

**Sound.** Atmospheric sound effects now (typewriter clacks, teletype chatter). Soundtrack later.

**Accessibility** (colour-blind palettes, dark mode) is deferred.

## 🏁 Endings, difficulty, saves and delegation

The player defines success. The only true defeat is total annexation: your state ceasing to exist, which also covers nuclear annihilation. Everything else, including regime change, is a continuation.

**Goals.** Players can set their own goals (contain communism, build a welfare state, become a monarchy). A running score and an end-of-game summary are open questions.

**Difficulty** follows the Hearts of Iron IV model: a set of buffs and debuffs applied to the player and AI nations. Candidate knobs: AI aggression, event harshness, economic volatility, fog thickness, and how strongly history pulls the world back to its real course.

**Saves.** Free save and reload, plus an ironman mode where choices stick. Seeds are shareable, so two players can start the identical world.

**Delegation.** Areas of government can be handed to cabinet members: Treasury runs fiscal policy within your limits, the State Department handles minor diplomacy, and so on. Each delegate has competence and biases. They escalate to you only when a threshold is crossed, such as a crisis with a minor state. This prevents late-game micromanagement fatigue.

## 🎯 Calibration and fidelity testing

Starting values come from real 1949 data. The model passes when the median outcome of historically played runs, across 200 seeds, lands within ±10% of reality for most nations, while the spread still allows plausible divergences.

**Monte Carlo test**

1. Script the historical choices for the player.
2. Run the game to a benchmark year across 200 different seeds.
3. Compare the median of each benchmark indicator with real figures. A median outside ±10% means the model is wrong.
4. Check the spread. Too narrow means the world is too deterministic. Rare takeoffs (a Cuban economic miracle in a few percent of runs) are welcome, but most nations must stay close to their real path.

**Benchmark indicators** (targets to be filled from sources): US and Soviet GDP, industrial output and steel production, warhead stockpiles, population, inflation and unemployment, at benchmark years such as 1955, 1960, 1970 and 1980.

**Data sources to consult**

- Maddison Project database (historical GDP and population)
- B. R. Mitchell, *International Historical Statistics* (production and trade by country)
- *Historical Statistics of the United States*
- UN Statistical Yearbooks
- Correlates of War project (CINC components)
- SIPRI military expenditure data
- Published estimates of historical nuclear stockpiles
- CShapes 2.0 (historical borders)

Where real data is missing, reasoned estimates anchored in real data are acceptable. Every estimate is marked as such in the data files so it can be replaced later.

## 🗺️ Development roadmap

Development runs in five phases, each ending in a playable build. Most of the time goes on data, balancing and content rather than code.

| Phase | Contents | Gate to pass | Rough time (cumulative, part-time) |
| --- | --- | --- | --- |
| 1. Foundations | Project setup, seeded RNG, turn loop, save and load, nation schema | One turn saves and reloads | Weeks (playable core) |
| 2. Playable core | US macroeconomy, seven sectors, input–output, fiscal sliders, simple USSR | 1949–55 is playable | Weeks (playable core) |
| 3. Alpha systems | Pops and opinion, factions and interest groups, events engine, military units, intelligence fog, commodity market | All alpha systems in | Months |
| 4. Depth | Elections and crises, theatres and combat, blocs and diplomacy, delegation, all nation tiers, Monte Carlo tests | Monte Carlo test passes | 1–3 years (full vision) |
| 5. Content and polish | Events to 2000, era-based UI, icons and sound, interactive map, tutorial | — | 1–3 years (full vision) |

The gate is what the build must pass before the next phase begins.

**Status:** Phase 1 and Phase 2A complete (see CLAUDE.md for the live status).

## 🛠️ Build guide for a first-time developer

You are the creative director and tester; Claude writes the code. Your jobs are design decisions, playing each build, reporting what feels wrong, and keeping the project organised.

**Tools**

| Tool | Why you need it |
| --- | --- |
| Claude Code | Anthropic's agentic coding tool (web, desktop and terminal). It works directly in a multi-file project, which chat cannot do well. Setup: docs.claude.com |
| Git and a GitHub account | Saves every working version, so any mistake can be undone |
| Node.js (LTS version) | Runs the TypeScript tooling |
| VS Code | For looking through files yourself |
| A modern browser | Where the game runs |

**Project layout**

```
coldwar-sim/
  data/          nations, sectors, pops, events, tech, modifiers (JSON/YAML)
  src/sim/       the engine: rng, economy, production, pops, politics,
                 military, intelligence, diplomacy, ai, events
  src/ui/        screens, charts, tables
  tests/         automated checks for every formula
  docs/GDD.md    this document, kept in the project
  CLAUDE.md      standing instructions for Claude Code
```

**Working rules**

1. **One system at a time, smallest version first.** A toy economy that runs beats a perfect one on paper.
2. **Always playable.** Every session ends with the game running.
3. **Save a version after every working change** (a Git commit). Claude does this when asked.
4. **Tests for formulas.** Automated checks stop a change elsewhere from silently breaking GDP. Claude writes them.
5. **Keep this document in the project.** Claude reads it at the start of each session, so decisions persist.
6. **Describe behaviour, not code.** "When inflation beats wage growth for two quarters, strike odds rise" is a perfect instruction.
7. **Report bugs with evidence:** the exact error text, a screenshot, the save file and the seed.
8. **Balance with data.** Use the history log and CSV export to see what went wrong, not just how it felt.

**First steps, in order**

1. Set up the project, the seeded RNG, an empty turn loop, and save/load.
2. Define the universal nation schema; load the USA and USSR from data files.
3. Build a toy economy: GDP from C + I + G + NX, a few fiscal sliders, one chart.
4. Add the seven sectors and the input–output model.
5. Add approval and political capital, then the first ten events.
6. Play 1949–1955 repeatedly and tune. Then follow the roadmap.

**What to learn along the way:** files and folders, opening a terminal, what a Git commit is, and how to read an error message. Ask Claude to explain anything unfamiliar the moment it comes up.

**Putting it online.** The whole simulation runs in the player's browser, so no server is needed. The game can be hosted as a static website for free on services such as GitHub Pages, Netlify or Vercel, with saves kept in the browser or downloaded as files.

## 🗂️ Deferred features and open questions

**Deferred to later versions**

- Other playable nations, each with unique mechanics and starting conditions
- Alternative economic engines (command economy, planned targets, black markets)
- Faction ideology drift; bespoke factions for more nations
- Separatist regions within states (Kurdistan, West Papua and others)
- Dynamic tier promotion, so any nation can become a great power
- Full sectoral economies for minor states
- Deeper political capital and combat systems
- Revisiting the quarterly time scale
- Interactive map, soundtrack, tutorial, accessibility options, modding tools

**Open questions**

- [ ] Is the Space Race in the alpha, or a later addition?
- [ ] Should the game keep a running score, and should it end with a written summary of your era (template-based, since there is no language AI)?
- [ ] Which minor states get mid resolution beyond Portugal?
- [ ] Exact benchmark years and tolerances for the Monte Carlo test
- [ ] A name for the game
