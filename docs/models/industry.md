# The industry model (Phase 2B)

This paper explains how the seven industries are simulated, and how they connect to the economy model in `economy.md`. Every number mentioned lives in a data file:

- The sectors: `data/economy/sectors.json`
- The 1949 input–output table, capital and "bridges": `data/economy/industry/usa-1949.json`
- Model parameters: `data/economy/models/keynesian.json`

## The idea in one paragraph

Spending (by households, firms, government and foreigners) is split into purchases of seven products. A Leontief input–output model works out how much each industry must produce, including what industries buy from each other: steel for cars, coal for power, freight for everything. Each industry's capacity comes from its capital stock. When an industry, or the economy as a whole, cannot meet demand, some of the gap is filled by emergency imports and the rest is rationed. What goes unfilled pushes up prices. New investment is added to each industry's capital, and more of it goes to the industries running hottest, so capacity follows demand over the years.

## The seven sectors

| Sector | Covers |
| --- | --- |
| Agriculture | Farms, forestry, fishing |
| Heavy industry | Coal and metal mining, steel and metals, machinery, ships, railway equipment, arms, construction |
| Energy | Oil and gas, refining, electric and gas utilities |
| Consumer goods | Food processing, textiles and clothing, lumber, paper, cars, household goods |
| Technology and R&D | Chemicals and drugs, electrical equipment and electronics, aircraft, instruments, telephones, research laboratories |
| Services and finance | Housing, banking, insurance, medicine, law, entertainment, personal services |
| Shipping and trade | Railways, trucking, shipping, airlines, wholesale and retail trade |

Two classification choices worth knowing:

- **Cars are consumer goods**, so a steel shortage cuts car output. That is what the Controlled Materials Plan did in 1951–52.
- **Aircraft and electronics are technology**, so rearmament strains technology first. That was the real bottleneck of 1950–51.

## Government's own workforce

Pay for soldiers, civil servants, teachers and police is value added produced by government itself, not bought from an industry. Each government spending stream therefore splits into a **workforce** share (40% of 1949 defence, half of state and local spending) and purchases from the seven sectors. A large army does not need services-sector capacity. In Phase 3 it will instead draw on manpower through the draft.

## The input–output table

For each sector the table gives:

- its share of business value added (1949 GDP by industry);
- **value added per dollar of output**: the rest is inputs bought from other sectors;
- **where its inputs come from**: shares across the seven sectors;
- imports of its product, its share of private capital, and its share of 1949 investment.

The input coefficient A[i][j] is how much of product i sector j uses per dollar of its output. Gross output x solves the Leontief system:

```
x = domestic share × (A·x + home final demand) + exports − emergency imports
```

That is, x = L · (home-made final demand), with L = (I − D·A)⁻¹ the domestic Leontief inverse. D holds each product's home-made share.

**Imports compete with home production.** Each product has an import share of its home use. It rises with the import trend (foreign recovery) and falls with tariffs. A tariff therefore shifts production home instead of just cutting imports.

## Calibration: how 1949 closes exactly

1. Government's workforce is taken out of GDP; the rest is business value added, split by sector.
2. Gross output = value added ÷ value added per dollar.
3. Final demand for each product = output + imports − what other industries use.
4. Investment, stockbuilding, government and exports are split across products using the **bridges** in the data file.
5. **Household spending by product is the residual**, just as consumption is the residual in the national accounts. It must come out non-negative and sum to the macro model's 1949 consumption, or the game refuses to load the table.

The derived 1949 household basket (at producer prices, before shop and transport margins): consumer goods 41%, shopping and transport 27%, services 22%, energy 4%, heavy industry 3% (home coal and repairs), farm produce 2%, technology 1% (radios, television sets, drugs).

## Capacity

**Potential output** (the whole economy) now comes from a Cobb–Douglas production function:

```
potential = productivity × capital^0.3 × labour^0.7 × (public capital effect)
```

Productivity grows 1.5% a year and the labour force 1.2% a year (until pops arrive in Phase 3). Capital is the sum of the seven sectors' capital. This closes the gap noted in `economy.md`: **investment now builds capacity**. In 1949 the capital stock grows faster than output (net investment was high), so potential grows about 3.7% a year at first. It slows towards about 3.3% as capital deepening ends. That is the post-war golden age, and why it faded.

**Each sector's normal capacity** is its share of capital times potential output, scaled so that in 1949 every sector was working at the same rate. Two limits apply:

- **Sector limit**: a sector can run up to 12% above normal capacity with overtime and extra shifts.
- **Economy-wide limit**: total output cannot exceed potential by more than 6%. This is labour: the whole workforce is employed.

## Shortages and rationing

When demand exceeds a limit:

1. **Emergency imports** cover 35% of a sector's excess, up to a quarter of its normal home use. Services cannot be imported. Emergency imports worsen the balance of payments and drain gold.
2. **Rationing** cuts final demand for the rest. Cuts fall hardest:
   - on the purchases that use the scarce product most intensively: a steel shortage cuts cars far more than haircuts;
   - on the least-protected buyers. Weights: stockbuilding 1.5, households 1, investment 1, exports 0.75, government 0.25. Defence contracts carried priority ratings under the Defense Production Act of 1950.

Limits are dealt with one at a time, tightest first. A final restoration step hands back any demand that was cut more than necessary, so orders only go unfilled when some limit is genuinely binding.

What was rationed feeds back into the economy:

- Household purchases that went unfilled become forced saving. The demand comes back next quarter.
- Investment projects that were delayed do not add to capital.
- Unfilled demand adds to inflation (the **shortages** term).
- Sectors running more than 3% above normal capacity add **bottleneck** inflation, weighted by their size.

## Where investment goes

Each quarter's real fixed investment is split between sectors in proportion to their usual 1949 shares, tilted towards sectors running hot. An industry 10% busier than average gets 40% more than its usual share. Each sector's capital then depreciates at its own rate, derived so that all sectors' capital grew at the same pace in 1949. That gives housing about 2% a year and consumer-goods plant about 10%.

After a sustained rearmament, technology and heavy industry end up with more capacity: the military-industrial base. If defence spending later falls, that capacity sits idle.

## Physical indicators

Steel tonnage moves with heavy industry's real output. The industrial production index (1949 = 100) is the value-added-weighted output of heavy industry, energy, consumer goods and technology.

## A historical check: Korea

With the budget left un-indexed (as Truman's appropriations were), defence raised to $22bn in 1950 and $45bn in 1951, and Truman's 1950–51 tax rises, the model gives:

| | Model | History |
| --- | --- | --- |
| Unemployment 1951–53 | 3.0% → 2.5% | 3.3% → 2.9% |
| Growth in 1951 | 11–12% | 8% |
| The post-Korea recession | −0.5% growth, mid-1954 | −0.6%, 1954 |
| Unemployment 1954–55 | rising to about 5% | peaked at 5.5% |
| Gold reserves, 1949–55 | $24.4bn → $21.3bn | $24.6bn → $21.8bn |
| Inflation, 1952 | about 11% | about 2% |

Technology hits its capacity limit within a year, and investment then flows into it. The big miss is inflation. The real economy had **price controls** (the 1951 general price freeze) and the **Treasury–Fed Accord** (March 1951), which ended the peg. Both are policy tools that arrive with Phase 3 politics. Without them the model's answer is the honest one.

## What the tests check

`tests/industry.test.ts` checks, among other things, that:

- The table is consistent (inputs plus value added = 1 per dollar), 1949 GDP is reproduced exactly, and the Leontief inverse reproduces 1949 output.
- Without shortages, output is plain Leontief. With shortages, output never exceeds a limit and rationing stops at the limit, including when two limits bind at once.
- Tradable goods draw emergency imports and services cannot. Defence orders are protected, and steel-heavy purchases are cut before services.
- The national accounts close every quarter, rationing or not, and orders only go unfilled when a limit binds.
- Rearmament strains technology first, raises steel output and industrial production, and pulls investment into technology.
- A corporate tax cut raises investment and potential output, and tariffs shift production home.
- Broken tables (shares not summing to 1, unknown sectors, missing bridges) are rejected with clear messages.

## Known gaps

- **The table is an estimate.** It is reconciled to 1949 GDP by industry and consumer spending, but not yet built from the 1947 benchmark input–output table. Aggregating that table to seven sectors is the obvious data task. The file is marked `unchecked`.
- **Coefficients are fixed.** Technology will change input needs (less coal per kilowatt, more electronics per aircraft) when the tech trees arrive in Phase 3.
- **One price level.** Sectors do not have their own prices yet, so a steel shortage raises all prices, not steel's in particular. Relative prices come with the commodity market.
- **Defence has one fixed mix.** A war buys the same shares of hardware and pay as peacetime; the military phase splits defence into personnel, procurement and R&D.
- **After Bretton Woods.** Over decades the rising import share drains gold. The model reaches roughly the real 1971 gold stock on its own, but nothing yet floats the dollar when the gold runs out. That is a later Bretton Woods mechanic.
