# Pops: the population model

*Plain-English notes on how the game simulates its people. Code: `src/sim/pops/`. Data: `data/pops/usa-1950.json` and `data/pops/ussr-1950.json`, generated from the tables in `tools/`.*

## What a pop is

A **pop** is a group of people who share every attribute the game tracks, with a size. One US pop might be *Black Protestant women aged 15–29 in industrial-worker households in the cities of Illinois, 41,200 people*. Because everyone in a pop is alike, adding up pops gives exact figures, not samples.

The United States tracks seven attributes:

| Attribute | Categories |
| --- | --- |
| State | 48 states and the District of Columbia |
| Race and ethnicity | White, Black, Hispanic, Asian, Native American |
| Sex | 2 |
| Household class | Farm owners; tenants, sharecroppers and farmhands; industrial workers; labourers and service workers; clerks and salespeople; professionals; managers and proprietors; retired households |
| Religion | Protestant, Catholic, Jewish, other (Latter-day Saints, Orthodox, Buddhist…), none |
| Age | 0–14, 15–29, 30–44, 45–64, 65+ |
| Where they live | Cities and towns, suburbs, countryside |

That is 294,000 possible combinations; about 27,000 have enough people to keep (over 250 each at the start). Pops are **households**: children belong to their parents' class, religion and home.

Every nation uses the same structure. The engine finds attributes by their *role* (region, age, sex…), never by name, so the Soviet Union can track republics and nationalities instead of states and races.

## Building the 1949 population

The 1950 census does not publish a table of every combination, so the game builds one by **iterative proportional fitting** (IPF), the standard method for synthetic populations:

1. Start with a table of all 294,000 combinations, shaped by known **associations** written as odds: Black families were 3.5 times as likely as chance to be sharecroppers and a quarter as likely to live in a suburb; Jewish families were mostly urban and in business or the professions; farm households live in the countryside by definition (odds of zero).
2. Rescale the table, again and again, until it matches every **census table** at once: each state's population, and each state's mix of race, city/suburb/countryside, household class and religion; and the age and sex mix within each race.
3. Scale to the January 1949 population (147.9 million) and drop combinations under 250 people.
4. Refit on the combinations that are left, so dropped people are spread where the census says they belong rather than lost. Every census table still matches within about 5%.

IPF keeps the associations wherever the census tables do not pin them down, so the result honours both.

## Births, deaths and ageing (every quarter)

The **cohort-component method**, as demographers project populations:

- **Deaths:** an age-specific rate times multipliers (Black Americans about 1.4×, reflecting about eight years' shorter life expectancy in 1950; men 1.25×; professionals 0.85×), falling 1.2% a year as medicine improves.
- **Births:** women aged 15–44 have children at an age-specific rate times multipliers (Catholic, Hispanic, rural and farm families higher). Children are born into their mother's household.
- **Ageing:** each quarter some of each age band moves up. How many is set by a **single-year age profile** that tracks every birth cohort's size, so a big generation leaves childhood as a wave. Without it, the 15-year bands would leak baby boomers into adulthood from 1949 instead of 1961.

The base rates are rescaled at game start so 1949 has exactly its historical 24.5 births and 9.7 deaths per 1,000.

### Why fertility rises and falls

Three forces multiply the base birth rate:

1. **Easterlin's income effect.** Young adults compare their living standard with what they grew up expecting. The 1949 generation was raised in the Depression and expects about 80% of what it has, so prosperity lifts fertility. Expectations catch up at 6% a year.
2. **Relative cohort size** (also Easterlin). A big generation reaching adulthood competes for jobs and has fewer children. The small Depression cohorts had the boom; the boomers themselves had the bust, and their children the 1980s echo.
3. **Women's work.** Fertility falls as women's labour force participation rises (about half a point a year from 34% in 1950).

Elasticities: income 1.6, cohort size −2.0, women's work −0.8 (calibration choices).

## Mobility (once a year)

- **Jobs follow demand.** Each sector needs workers in proportion to its output divided by its labour productivity. Farms gain productivity fastest (6.2% a year: USDA farm output per hour rose about 3.4-fold from 1950 to 1970), so they need ever fewer hands. Farm classes get exactly the people farming needs. The other working classes share everyone else in proportion to their sectors' demand, so surplus labour ends up in the towns (the Lewis model of development). Classes with too many households send 60% of the gap each year along allowed paths (farm → factory or service work, factory → office…) to classes with too few. Families leaving farming also leave the farm: 55% to a city, 20% to a suburb, 25% to a non-farm home in the countryside.
- **Retirement:** 8% of working households aged 65+ retire each year.
- **Suburbs:** 1.2% of city households a year move to the suburbs at 1949 living standards, rising in proportion to income. Professionals and managers are more likely to move; Black families far less (0.12×), because restrictive covenants and redlining kept them out.
- **Migration between states.** Young adults are the most mobile: up to 7% a year consider a move. Movers weigh every state by its size times a utility, with sensitivity 1.5 per log point. Utility is the state's regional income level, plus a **climate-and-land pull** (the Sun Belt: Florida, Arizona, California, Nevada), minus a **farm-surplus push** where many families still farm (too few town jobs for those leaving the land), minus **Jim Crow**, an explicit penalty of 0.35 log points on Black families in the former Confederacy and the border South. Civil rights events can later lower it. Movers can always join a group that already exists in their destination; founding a brand-new group takes at least 25 of them.
- **Immigration:** 0.16% of the population a year (about 250,000 in the 1950s under the 1924 quota system), mostly European with Mexican and Canadian arrivals. They settle among existing pops of their race and age, preferring cities. Later policy, such as the 1965 Hart–Celler Act, can change it.

## The economy link

- **Labour force:** people aged 15+ times participation rates by sex and age (men 30–44: 96%; women 30–44: 36% in 1949, rising), with retired households mostly out. This replaces the placeholder growth rate in both economies: potential output grows with the people who can work.
- **Income:** each pop's living standard is the national one (real consumption per head) times its relative income. Relative income is built additively in log points from class, race, place and region, averaged so the national mean is exact. Black family income comes out at about 54% of white, as in the 1950 census.
- **Engel's law:** each pop splits its spending between the seven sectors according to its income. Richer households spend a smaller share on food and clothing and a larger share on services and technology. Income elasticities: agriculture 0.3, consumer goods 0.6, services 1.4, technology 1.8. Calibrated so 1949 reproduces the input–output table's household spending exactly. The resulting mix is handed to the industries each quarter, so output shifts from goods to services as incomes rise.

## How it compares with history (hands-off play)

| | Model | History |
| --- | --- | --- |
| Population 1960 / 1970 | 175m / 198m | 178.5m / 202.1m (48 states + DC) |
| Population 1990 / 2000 | 248m / 283m | ≈247m / ≈280m |
| Labour force 1970 | 85.9m | 85.9m |
| Farm population 1960 / 1970 | 17.0m / 12.6m | 15.6m / 9.7m |
| Birth rate 1960 / 1965 / 1970 | 21.4 / 19.0 / 17.5 | 23.7 / 19.4 / 18.4 |
| Black Americans in the 13 Southern states 1949 → 1970 | 63% → 47% | ≈63% → ≈50% |
| State growth 1949–60 | CA +53%, AZ +53%, OH +18%, MS +9%, WV +2% | CA +48%, AZ +74%, OH +22%, MS 0%, WV −7% |

## Known gaps

- **Births run 2–4 per 1,000 too high after 1975.** The Pill (1960), *Roe v. Wade* (1973) and rising education will arrive as events and policies.
- **The Great Migration never reverses.** After 1970 Black Americans moved back South as Jim Crow ended. Until civil rights events lower the barrier, the model keeps moving them north (29% left in the South by 2000, against about 52% in reality).
- **Florida and Nevada grow too slowly.** Retirees moving for climate and Las Vegas's boom are not modelled.
- **Farms empty about a decade late** in the 1970s.
- **Alaska and Hawaii** (states from 1959) are not modelled.
- **Hispanic Americans** are an estimate: the 1950 census counted most as white.
- **Steel:** spending has shifted to services, but investment and defence still buy steel at 1949 proportions, so US steel output grows too far.

## Parameters (data/pops/usa-1950.json)

| Parameter | Value | Meaning |
| --- | --- | --- |
| `threshold` | 250 | Smallest group kept when building the starting population |
| `crudeBirthRate`, `crudeDeathRate` | 24.5, 9.7 | 1949 births and deaths per 1,000 (calibration targets) |
| `mortalityImprovement` | 1.2% a year | Fall in death rates |
| `fertilityIncomeElasticity` | 1.6 | Easterlin income effect |
| `initialExpectation` | 0.80 | Living standard the 1949 generation expects, as a share of the actual one |
| `expectationAdjustment` | 6% a year | How fast expectations catch up |
| `cohortSizeElasticity` | 2.0 | Fewer children when a big generation comes of age |
| `womenWorkElasticity` | 0.8 | Fewer children as women's participation rises |
| `femaleTrend` | 0.5 points a year | Rise in women's labour force participation |
| `productivityGrowth.agriculture` | 6.2% a year | Farm labour productivity growth |
| `mobility.rate` | 60% | Share of the jobs gap closed each year |
| `suburbanisation.rate` | 1.2% a year | City households moving out, at 1949 incomes |
| `migration.sensitivity` | 1.5 | Pull per log point of utility |
| `migration.farmSurplusPenalty` | 1.2 | Push per unit of farm-household share |
| `migration.barriers` | −0.35 | Jim Crow, for Black families in the South |
| `immigration.rate` | 0.16% a year | Arrivals from abroad |

## The Soviet Union

The same engine runs the Soviet Union from `data/pops/ussr-1950.json` (generated by `tools/ussr_1950_pops.py`), about 12,000 pops:

| Attribute | Categories |
| --- | --- |
| Republic | The 15 union republics |
| Nationality | Russians, Ukrainians, Belarusians, Central Asian peoples, Caucasian peoples, Baltic peoples, Jews, other peoples |
| Sex | 2 |
| Social group | Collective farmers (kolkhozniki), state farm workers, industrial workers, service and transport workers, office staff (sluzhashchie), specialists and intelligentsia, party and state officials, Gulag prisoners, pensioners |
| Religion | Orthodox (and Armenian Apostolic), Muslim, Catholic and Lutheran, Jewish, none |
| Age | The same five bands |
| Where they live | Cities and towns, countryside (no suburbs in the American sense) |

Every figure is an estimate: republic populations from official January 1950 estimates, nationality and urban shares interpolated between the 1939 and 1959 censuses, class and religion reconstructed. What makes the Soviet model different is all in the data:

- **The war's scar.** Women outnumber men by about 21 million, mostly over 30, and the single-year age profile has deep holes for the 1933 famine and the cohorts born 1941–45. When those small cohorts reach their twenties in the 1960s, births fall.
- **Kolkhozniki** held no internal passports until 1974, so farm households cannot move between republics. They leave the land only through recruitment into industry and services, following the jobs the Plan creates. Farm productivity grows about 5% a year as the farms mechanise, so the kolkhozy shed people even as output rises.
- **Gulag prisoners** (about 2.5 million in 1950): adults, mostly young men, working in mining, timber and construction. They have no children, die at three times the normal rate, and have no path out through the jobs market: only policy (the 1953 amnesty, the post-1956 releases) can free them.
- **Nationality and migration.** Non-Russian peoples rarely left their homelands, so they face a barrier everywhere else. Russians were recruited into Kazakhstan and the Baltic republics, so they get a pull there.
- **Mortality** fell fast in the 1950s as infant deaths dropped, then stalled after the mid-1960s: the yearly improvement fades.
- **Women's work.** Labour force participation was among the world's highest: about 70% of women aged 15–44.

| | Model | History |
| --- | --- | --- |
| Population 1960 / 1970 | 211.6m / 241.4m | 212m / 241.7m (censuses 1959 and 1970, adjusted) |
| Population 1980 / 1990 | 271m / 299m | 264.5m / 288.6m |
| Birth rate 1960 / 1970 / 1980 | 23.1 / 20.9 / 19.7 | 24.9 / 17.4 / 18.3 |
| Death rate 1970 / 1980 | 8.6 / 9.1 | 8.2 / 10.3 |
| Urban share 1970 / 1980 | 51% / 55% | 56% / 63% |

Soviet births run too high in the 1970s and towns grow too slowly. The Soviet output comparison with America (0.33 → 0.41 → 0.33 of US output) stays close to Maddison's (0.35 → 0.44 → 0.36).

## What the player sees

The **Population** tab:

- headline figures and their change since 1949;
- an age pyramid by single year of age, with marked generations (the American baby boom; the Soviet famine and war births);
- a state map (the future electoral map) coloured by population change, Black share, urbanisation, suburbs, farm households or Catholic share; for the Soviet Union, the republics as bars;
- breakdowns by race, class, religion, place and age against 1949;
- trend charts;
- a sortable table of the states.

The labour force, farm population, urban share and birth and death rates also appear in the nation's dossier.
