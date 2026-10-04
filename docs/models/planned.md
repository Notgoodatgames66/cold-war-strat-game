# The planned economy (Phase 2C)

This paper explains how the Soviet economy is simulated. It uses the same seven industries and input–output machinery as the American economy (see `industry.md`), but a different engine on top: the **planned engine**. Every number mentioned lives in a data file:

- Model parameters: `data/economy/models/planned.json`
- The 1949 Soviet input–output table: `data/economy/industry/ussr-1949.json`
- The Five-Year Plans: `data/economy/plans/ussr-five-year-plans.json`
- Starting figures: `data/nations/ussr.json`

## The idea in one paragraph

In a market economy, demand sets output: if people want to buy more, firms hire and produce more, and if they cannot, prices rise. A planned economy works the other way round. The Plan sets output at what the country's workers and capital can produce, and pushes a little beyond (a "taut" plan). It divides that output between investment, defence, civil government and exports. Households get what is left. Everyone has a job and prices are fixed, so when households have more money than there are goods, the result is not inflation but **queues, empty shelves and savings that cannot be spent**. Economists call this *repressed inflation*; János Kornai called it the *shortage economy*.

## Capacity: what the country can produce

Potential output follows a Cobb–Douglas production function, as for the United States:

> potential = productivity × (capital)^0.3 × (labour)^0.7

- **Capital** is the sum of the seven industries' capital stocks, built up by investment (below).
- **Labour** grows 1.4% a year, a placeholder until pops and demography drive it in Phase 3.
- **Productivity** (total factor productivity) grew about 2.2% a year in 1949, but that growth **fades by 4.5% of itself each year**. By the late 1970s it is close to zero. This is the heart of the Western explanation of Soviet slowdown: the system could mobilise capital and labour, but became steadily worse at innovating and at using them well. Growth then came almost entirely from piling up more capital, which runs into diminishing returns.

## The Plan

The Plan file holds **keyframes**, one per Five-Year Plan (and the 1953 New Course and 1959 Seven-Year Plan). Each keyframe sets:

- the shares of output for **investment, defence, civil government and exports**;
- **investment priorities** by industry, relative to the 1949 allocation (1.0 means "as in 1949", 1.5 means half as much again);
- **what Moscow expected America to spend on defence**, as a share of US output.

Shares move smoothly from one keyframe to the next, so a new plan phases in. Priorities switch when a new plan starts.

| Plan | Investment | Defence | What changed |
| --- | --- | --- | --- |
| Fourth (1946–50) | 16% | 12% | Post-war reconstruction |
| Fifth (1951–55) | 17% | 14% | Stalin's Korean-era rearmament; technology and heavy industry favoured |
| New Course (1953) | 18% | 13% | Malenkov: more for farms and consumer goods |
| Sixth (1956–60) | 21% | 10% | Khrushchev: Virgin Lands, mass housing, troop cuts |
| Seven-Year (1959–65) | 24% | 10% | Chemicals, oil and gas, missiles |
| Eighth (1966–70) | 27% | 12% | Brezhnev's farm drive; the strategic build-up begins |
| Ninth (1971–75) | 28% | 13% | Consumer goods promised to grow faster; Siberian oil |
| Tenth (1976–80) | 30% | 14% | Energy and farming swallow investment |
| Eleventh (1981–85) | 30% | 15% | Stagnation; the Food Programme |
| Twelfth (1986–90) | 31% | 15% | Gorbachev's "acceleration" of machine-building |

These shares follow Western reconstructions (Bergson, the CIA), not official Soviet figures, and are estimates.

## A taut plan: output is set by the Plan, not by shoppers

Each quarter the planners aim at **potential × (1 + tension)**. Tension is 1% in 1949: the plan asks a little more than the economy can comfortably give. That figure is also the **ceiling**. Households cannot pull extra output out of the factories by wanting more, because nothing in the system rewards a factory for serving them. Their extra money is simply left over.

Within that ceiling, the same input–output model as the American economy works out what each industry must produce. Each industry can be pushed up to 12% above its normal capacity ("storming"). When an industry hits its limit, orders are rationed, and here the priorities are the reverse of a market economy's:

| Who is cut | Weight (higher = cut first) |
| --- | --- |
| Households | 2.0 |
| Stockbuilding | 1.0 |
| Plan investment | 0.5 |
| Exports (largely to the bloc) | 0.5 |
| Defence and state orders | 0.2 |

So bottlenecks show up as **empty shops**, not as a smaller army.

A small share of any shortage (10%) can be met by emergency imports: the USSR had little hard currency and preferred autarky.

## Households: the wage fund, shortages and the overhang

Households are paid a **wage fund** meant to buy the consumer goods the Plan provides. In 1949 the wage fund ran about 4% ahead of the goods on offer, which is how the model reproduces the estimated 5% of demand left unmet that year.

- **Income balancing.** The planners close about 30% of any gap between wages and goods each year, through compulsory state loans (which took several per cent of wages until 1957), price rises and wage controls. So the 1949 shortage fades through the 1950s.
- **Demand in the shops** is the wage fund plus a quarter of the savings overhang each year: when goods appear, people spend their savings.
- **The shortage rate** is the share of that demand that finds nothing to buy.
- **The savings overhang** grows by whatever households were paid but could not spend. It can only shrink when the shops have more goods than current wages can buy, which happens when a bottleneck elsewhere frees resources for consumer goods. Otherwise it just sits in savings banks and under mattresses. It is the stock of repressed inflation that exploded when prices were freed in 1991–92.

## Investment and capacity

Investment is split between the industries by:

1. the **1949 allocation** in the input–output table;
2. the **Plan's priorities**, relative to 1949;
3. **bottlenecks**: an industry running 10% more stretched than average gets 40% more than its planned share. This stands for the planners' "material balances", which moved resources to wherever supplies ran short.

Each industry's capital then grows by its investment less depreciation, and its capacity follows its share of the capital stock, exactly as in the American economy.

## The arms race

Until the rival AI arrives, the Plan reacts to one thing: **America's defence spending**. Each keyframe records what Moscow expected America to spend. Every quarter the Soviet defence share becomes:

> Soviet defence share = the Plan's defence share + 0.6 × (America's actual share − the expected share)

held between 5% and 30% of output. If America rearms beyond what Moscow expected, the Soviets add 0.6 points of their output to defence for every point America adds; if America demobilises, they ease off. The extra defence comes out of households, not out of Plan investment.

In a Korea-scale test (US defence $45 billion from 1951, about 12% of US output), the Soviet defence share rises from 12% to about 14.4%, then falls back as American spending falls.

## Dollars: valuing Soviet output

The Soviet economy is measured in **1949 US dollars**, as the CIA valued it, so the two superpowers can be compared directly. The 1949 figure is $90 billion, about a third of American output. Current-dollar figures (nominal GDP, defence spending) use the American price level, so the comparison stays like for like.

## Calibration to 1949

- Output: $90 billion (1949 US prices), growing about 8% a year in the last years of reconstruction.
- Industries: farming 28.5% of business value added, heavy industry 21.5%, consumer goods 14%, shipping and trade 15%, services 9.5%, energy 6%, technology 5.5%.
- Capital: 1.5 times output. The war destroyed about a quarter of the Soviet capital stock, so the ratio was low in 1949 and returns to new investment were high.
- Starting savings overhang: $3 billion. The confiscatory currency reform of December 1947 wiped out most wartime savings.
- Starting shortage: 5% of household demand.

The 1949 accounts close exactly: consumption + investment + defence + civil government + exports − imports = $90 billion. The table is a first estimate built from Western reconstructions, not from Soviet input–output tables (the first was published for 1959). It is marked `"verification": "unchecked"`.

## How it compares with history

With the United States indexing its budget and not rearming:

| | Model | History (Western estimates) |
| --- | --- | --- |
| Growth, 1950s | 5.1–5.3% | 5.5–6% (CIA) |
| Growth, 1960s | 4.9% falling to 4.0% | about 5% |
| Growth, 1970s | 2.8–3.3% | 3.7% then 2.6% |
| Growth, 1980s | 2.5–3.6% | about 2% |
| Soviet output ÷ American | 0.33 (1949), 0.36 (1955), 0.42 (1971), 0.38 (1985), 0.34 (1999) | 0.35 (1950), about 0.44 (1970), 0.40 (1980), 0.36 (1989) (Maddison) |
| Consumer shortages | 4% (1949), 3% (1955), 1% (1971), 6% (1985) | chronic; worsening from the 1970s |
| Savings overhang | $3bn (1949), $8bn (1957), $5bn (1971), $32bn (1987) | small after the 1947 reform; very large by the late 1980s |
| Steel | 33 Mt (1955), 49 Mt (1961), 80 Mt (1971), 111 Mt (1981) | 45 Mt (1955), 65 Mt (1960), 116 Mt (1970), 148 Mt (1980) |

The shape is right: fast post-war growth, the Soviet economy closing on America's through the 1960s, then the slowdown of the Brezhnev years as productivity growth runs out and ever more investment is needed for ever less growth, with shortages and the overhang building up.

## Known gaps

- **Industry grows too slowly relative to the whole economy.** Soviet industrial production grew roughly one and a half to two times as fast as GNP in the 1950s and 1960s, and steel output is about 30% below history by 1970. The model misses **structural transformation**: millions leaving the collective farms for factory jobs, and households switching from home-grown food to bought bread, clothes and consumer durables as incomes rise (Engel's law). In a fixed-coefficient input–output model the mix of what industries produce can only shift as much as the mix of spending does. Both effects arrive with pops in Phase 3, where each population group buys goods according to its needs and income, and moves between country and town. A shift of capacity towards industry was tried and rejected: Soviet heavy industry was limited by what the Plan ordered, not by capacity, so extra capacity just sat idle.
- **The 1949–55 reconstruction boom is understated.** Restored Ukrainian steelworks and Donbass mines added output far faster than new capital could.
- **America's steel output keeps rising for the same reason.** American industry never loses ground to services, so US steel reaches implausible tonnages by the 1980s. The Phase 2 gate covers only 1949–55.
- **No crisis in the late 1980s.** The collapse of 1989–91 came from policy choices (the 1987 enterprise law, budget deficits financed by printing money) and politics, which arrive as events in Phase 3. Without them the model's Soviet Union slows but does not break.
- **Defence in dollars is understated.** The CIA priced Soviet soldiers and weapons at what they would have cost in America, which made Soviet defence look larger than its share of a dollar-valued GDP. The model applies one price level to all output.

## Parameters

| Parameter | Value | Meaning |
| --- | --- | --- |
| `capital_share` | 0.3 | Capital's share in the production function |
| `tfp_growth` | 2.2% | Productivity growth in 1949 |
| `tfp_growth_decay` | 4.5% a year | How fast productivity growth fades |
| `labour_force_growth` | 1.4% | Yearly labour force growth; used only when the nation has no pops (the Soviet labour force now comes from its pops: see pops.md) |
| `sector_capacity_ceiling` | 12% | How far an industry can "storm" above normal capacity |
| `overhang_spend_rate` | 25% | Share of the overhang households try to spend each year |
| `income_balancing` | 30% | Share of the wage–goods gap planners close each year |
| `investment_allocation_sensitivity` | 4 | How strongly investment is steered to bottlenecks |
| `utilisation_smoothing` | 0.5 | Weight on the latest quarter when judging bottlenecks |
| `surge_import_share`, `surge_import_cap` | 10%, 10% | Emergency imports: share of a shortage met, and their cap |
| `ration_weight_*` | 2.0 / 0.5 / 1.0 / 0.2 / 0.5 | Who is cut first (households, investment, stocks, state orders, exports) |
| `arms_race_reaction` | 0.6 | Points of GDP added to defence per point of unexpected US spending |
| `max_defence_share`, `min_defence_share` | 30%, 5% | Limits on the defence share |

## What the player sees

The Soviet dossier and the **Balance of power** panel on the Situation tab show the Soviet Union's **true figures**, labelled as a developer view. From Phase 3, intelligence estimates with error ranges replace them, and how good those estimates are will depend on the player's intelligence services.
