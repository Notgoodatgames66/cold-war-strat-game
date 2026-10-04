"""Generates data/pops/ussr-1950.json: the Soviet Union's pops, by union republic.

Run from the project root: python3 tools/ussr_1950_pops.py data/pops/ussr-1950.json
The table below is the easiest place to check or correct a republic's figures; then rerun.

Every figure is an estimate. Soviet statistics for 1950 are partial: republic populations
come from official January 1950 estimates, nationality and urban shares are interpolated
between the 1939 and 1959 censuses, and class and religion are reconstructions.

Columns per republic:
  pop     population, January 1950 (thousands), official estimate
  urban   % urban (interpolated 1939-1959 censuses)
  then nationality shares (%): rus ukr bel ca (Central Asian peoples) cau (Caucasian peoples)
  bal (Baltic peoples) jew oth (Tatars, Moldovans, Poles, Germans, peoples of the RSFSR...)
  pris    % Gulag prisoners (camps and colonies) - estimate
"""
import json, sys

GROUP = {'RSFSR': 'Russia', 'UKR': 'Ukraine and Moldova', 'MOL': 'Ukraine and Moldova', 'BEL': 'Belarus',
         'LIT': 'Baltics', 'LAT': 'Baltics', 'EST': 'Baltics', 'GEO': 'Caucasus', 'ARM': 'Caucasus', 'AZE': 'Caucasus',
         'KAZ': 'Kazakhstan', 'UZB': 'Central Asia', 'KYR': 'Central Asia', 'TAJ': 'Central Asia', 'TKM': 'Central Asia'}
NAMES = {'RSFSR': 'Russian SFSR', 'UKR': 'Ukraine', 'BEL': 'Belarus', 'UZB': 'Uzbekistan', 'KAZ': 'Kazakhstan',
         'GEO': 'Georgia', 'AZE': 'Azerbaijan', 'LIT': 'Lithuania', 'MOL': 'Moldavia', 'LAT': 'Latvia',
         'KYR': 'Kirghizia', 'TAJ': 'Tajikistan', 'ARM': 'Armenia', 'TKM': 'Turkmenia', 'EST': 'Estonia'}

#          pop     urban  rus  ukr  bel   ca  cau  bal  jew  oth  pris
R = {
'RSFSR': (101438, 43,   83,  3.0, 0.7, 0.6, 0.6, 0.1, 0.8, 11.2, 2.0),
'UKR':   ( 36588, 36,   15, 78,   0.5, 0.0, 0.1, 0.0, 2.0,  4.4, 0.4),
'BEL':   (  7709, 22,    7,  1.5, 81,  0.0, 0.0, 0.1, 2.0,  8.4, 0.3),
'UZB':   (  6194, 29,   11,  1.0, 0.1, 75,  0.5, 0.0, 1.2, 11.2, 0.5),
'KAZ':   (  6522, 36,   38,  8.0, 1.0, 33,  0.5, 0.1, 0.5, 18.9, 2.5),
'GEO':   (  3494, 37,   10,  1.5, 0.1, 0.1, 76,  0.0, 1.5, 10.8, 0.3),
'AZE':   (  2859, 44,   14,  0.5, 0.1, 0.2, 80,  0.0, 1.2,  4.0, 0.3),
'LIT':   (  2573, 28,    8,  0.5, 1.0, 0.0, 0.0, 80,  1.0,  9.5, 0.6),
'MOL':   (  2290, 14,   10, 15,   0.2, 0.0, 0.0, 0.0, 3.3, 71.5, 0.3),
'LAT':   (  1944, 46,   25,  1.5, 3.0, 0.0, 0.0, 62,  1.8,  6.7, 0.6),
'KYR':   (  1716, 27,   28,  6.0, 0.3, 51,  0.2, 0.0, 0.3, 14.2, 0.3),
'TAJ':   (  1509, 26,   12,  1.0, 0.1, 76,  0.2, 0.0, 0.5, 10.2, 0.3),
'ARM':   (  1347, 41,    3,  0.3, 0.0, 0.0, 92,  0.0, 0.1,  4.6, 0.3),
'TKM':   (  1197, 44,   16,  1.5, 0.1, 70,  0.5, 0.0, 0.3, 11.6, 0.3),
'EST':   (  1097, 46,   20,  1.0, 0.5, 0.0, 0.0, 75,  0.4,  3.1, 0.6),
}
order = list(R)

def r4(x): return round(x, 4)

state_pop = {k: R[k][0] * 1000 for k in order}
nat, settle, cls = {}, {}, {}
for k in order:
    pop, urban, rus, ukr, bel, ca, cau, bal, jew, oth, pris = R[k]
    t = rus + ukr + bel + ca + cau + bal + jew + oth
    nat[k] = {n: r4(v / t) for n, v in dict(russian=rus, ukrainian=ukr, belarusian=bel, central_asian=ca,
                                               caucasian=cau, baltic=bal, jewish=jew, other=oth).items()}
    settle[k] = {'city': r4(urban / 100), 'rural': r4(1 - urban / 100)}
    rural = 1 - urban / 100
    farm = 0.82 * rural
    sovkhoz = farm * (0.16 if k in ('KAZ', 'RSFSR') else 0.10)
    kolkhoz = farm - sovkhoz
    prisoners = pris / 100
    pension = 0.03 if GROUP[k] == 'Baltics' else 0.022
    nomenk = 0.008
    rest = 1 - farm - prisoners - pension - nomenk
    cls[k] = {'kolkhoz': kolkhoz, 'state_farm': sovkhoz, 'industrial': rest * 0.43, 'service': rest * 0.24,
              'white_collar': rest * 0.23, 'specialist': rest * 0.10, 'nomenklatura': nomenk,
              'prisoner': prisoners, 'pensioner': pension}
    cls[k] = {n: r4(v) for n, v in cls[k].items()}
for table in (nat, settle, cls):
    for k, row in table.items():
        diff = round(1 - sum(row.values()), 4)
        big = max(row, key=row.get)
        row[big] = round(row[big] + diff, 4)

# National religion (counts, matching the republic totals). Official atheism; estimates of
# self-identified believers in the early 1950s are about half the population.
total = sum(state_pop.values())
REL = {'orthodox': 0.33, 'muslim': 0.11, 'western': 0.035, 'jewish': 0.008, 'none': 0.517}
rel_counts = {k: round(v * total) for k, v in REL.items()}
rel_counts['none'] += total - sum(rel_counts.values())

AGE = ['0-14', '15-29', '30-44', '45-64', '65+']
# Shares of each nationality's total by age band, and the male share in each band. The war
# killed men born 1890-1925 in vast numbers: in 1950 women outnumbered men by about 21 million.
AGE_SHARE = {'default': (29.3, 27.4, 21.2, 16.4, 5.7), 'central_asian': (36.0, 27.0, 18.0, 14.0, 5.0)}
MALE = (0.505, 0.475, 0.405, 0.385, 0.34)
nat_age_sex = {}
for n in ['russian', 'ukrainian', 'belarusian', 'central_asian', 'caucasian', 'baltic', 'jewish', 'other']:
    shares = AGE_SHARE.get(n, AGE_SHARE['default'])
    t = sum(shares)
    male = MALE if n != 'central_asian' else (0.505, 0.49, 0.45, 0.43, 0.40)
    nat_age_sex[n] = {
        'male': {a: r4(s / t * m) for a, s, m in zip(AGE, shares, male)},
        'female': {a: r4(s / t * (1 - m)) for a, s, m in zip(AGE, shares, male)},
    }
    tot = sum(nat_age_sex[n]['male'].values()) + sum(nat_age_sex[n]['female'].values())
    nat_age_sex[n]['female']['15-29'] = r4(nat_age_sex[n]['female']['15-29'] + 1 - tot)

# People by single year of age, January 1949 (millions): the wartime birth collapse (born 1942-45,
# ages 3-6) and the 1933 famine (ages 15-16) are deep holes. Only the shape matters.
AGE_PROFILE = [4.0, 3.9, 3.8, 3.0, 2.0, 1.9, 2.4, 3.6, 4.0, 4.2, 4.1, 4.0, 3.9, 3.6, 3.4,
               2.6, 2.4, 3.0, 3.2, 3.3] + [3.4] * 10 + [2.8] * 5 + [2.5] * 5 + [2.2] * 5 + \
              [1.8] * 5 + [1.55] * 5 + [1.35] * 5 + [1.1] * 5 + [0.9] * 5 + [0.6] * 5 + [0.35] * 5 + [0.15] * 5 + [0.25]

NONRUSSIAN_HOMELANDS = {'central_asian': ['UZB', 'KAZ', 'KYR', 'TAJ', 'TKM'], 'baltic': ['LIT', 'LAT', 'EST'],
                        'caucasian': ['GEO', 'ARM', 'AZE']}
barriers = {}
for n, home in NONRUSSIAN_HOMELANDS.items():
    barriers[n] = {k: -0.8 for k in order if k not in home}
barriers['russian'] = {'KAZ': 0.25, 'LAT': 0.25, 'EST': 0.25, 'UKR': 0.05}

model = {
  "id": "ussr-1950",
  "nation": "ussr",
  "label": "Soviet Union, 1950 estimates",
  "censusYear": 1950,
  "scaleToStat": "population",
  "threshold": 250,
  "verification": "unchecked",
  "cohorts": [{"label": "War births · born 1941–45", "from": 1941, "to": 1945}, {"label": "Famine · born 1932–33", "from": 1932, "to": 1933}],
  "sources": [
    {"label": "Narodnoe khozyaistvo SSSR (statistical yearbooks), population estimates by republic, 1950"},
    {"label": "Itogi vsesoyuznoi perepisi naseleniya 1959 goda (1959 census results), nationality and urban shares"},
    {"label": "Vsesoyuznaya perepis' naseleniya 1939 goda (1939 census), social groups"},
    {"label": "Andreev, Darsky and Kharkova, Naselenie Sovetskogo Soyuza 1922–1991 (1993): age and sex reconstruction"},
    {"label": "Applebaum, Gulag: A History (2003); Getty, Rittersporn and Zemskov (1993): camp populations"}
  ],
  "attributes": [
    {"id": "republic", "label": "Republic", "role": "region",
     "categories": [{"id": k, "label": NAMES[k], "group": GROUP[k]} for k in order]},
    {"id": "nationality", "label": "Nationality", "role": "ethnicity", "categories": [
      {"id": "russian", "label": "Russians"}, {"id": "ukrainian", "label": "Ukrainians"},
      {"id": "belarusian", "label": "Belarusians"}, {"id": "central_asian", "label": "Central Asian peoples"},
      {"id": "caucasian", "label": "Caucasian peoples"}, {"id": "baltic", "label": "Baltic peoples"},
      {"id": "jewish", "label": "Jews"}, {"id": "other", "label": "Other peoples"}]},
    {"id": "sex", "label": "Sex", "role": "sex", "categories": [
      {"id": "male", "label": "Men and boys"}, {"id": "female", "label": "Women and girls", "female": True}]},
    {"id": "class", "label": "Social group", "role": "class", "categories": [
      {"id": "kolkhoz", "label": "Collective farmers (kolkhozniki)", "farm": True},
      {"id": "state_farm", "label": "State farm workers", "farm": True},
      {"id": "industrial", "label": "Industrial workers"},
      {"id": "service", "label": "Service and transport workers"},
      {"id": "white_collar", "label": "Office staff (sluzhashchie)"},
      {"id": "specialist", "label": "Specialists and intelligentsia"},
      {"id": "nomenklatura", "label": "Party and state officials"},
      {"id": "prisoner", "label": "Gulag prisoners"},
      {"id": "pensioner", "label": "Pensioners", "retired": True}]},
    {"id": "religion", "label": "Religion", "role": "religion", "categories": [
      {"id": "orthodox", "label": "Orthodox (and Armenian Apostolic)"}, {"id": "muslim", "label": "Muslim"},
      {"id": "western", "label": "Catholic and Lutheran"}, {"id": "jewish", "label": "Jewish"},
      {"id": "none", "label": "No religion"}]},
    {"id": "age", "label": "Age", "role": "age", "categories": [
      {"id": "0-14", "label": "0–14", "ageFrom": 0, "ageWidth": 15},
      {"id": "15-29", "label": "15–29", "ageFrom": 15, "ageWidth": 15},
      {"id": "30-44", "label": "30–44", "ageFrom": 30, "ageWidth": 15},
      {"id": "45-64", "label": "45–64", "ageFrom": 45, "ageWidth": 20},
      {"id": "65+", "label": "65 and over", "ageFrom": 65}]},
    {"id": "settlement", "label": "Where they live", "role": "settlement", "categories": [
      {"id": "city", "label": "Cities and towns"}, {"id": "rural", "label": "Countryside"}]}
  ],
  "margins": [
    {"id": "republic-population", "label": "Population by republic", "dims": ["republic"], "given": [],
     "values": state_pop, "provenance": "estimate",
     "note": "Official Soviet estimates for 1 January 1950. The game scales the total to its January 1949 population."},
    {"id": "religion", "label": "Religion", "dims": ["religion"], "given": [], "values": rel_counts, "provenance": "estimate",
     "note": "Self-identification under official atheism is hard to measure; about half the population is taken to be believers, mostly Orthodox and Muslim. A reconstruction, not a census figure."},
    {"id": "republic-nationality", "label": "Nationality by republic", "dims": ["republic", "nationality"], "given": ["republic"],
     "values": nat, "provenance": "estimate",
     "note": "Interpolated between the 1939 and 1959 censuses. Russians were moving into the Baltic republics and Kazakhstan; Kazakhstan's 'other' includes deported Germans, Chechens and Tatars."},
    {"id": "republic-settlement", "label": "City and countryside by republic", "dims": ["republic", "settlement"], "given": ["republic"],
     "values": settle, "provenance": "estimate",
     "note": "Urban shares interpolated between the 1939 and 1959 censuses (39% urban nationally in 1950). The Soviet Union had no suburbs in the American sense."},
    {"id": "republic-class", "label": "Social group by republic", "dims": ["republic", "class"], "given": ["republic"],
     "values": cls, "provenance": "estimate",
     "note": "Farm households are 82% of each republic's rural population, mostly kolkhozniki, with more state farms in Russia and Kazakhstan. Gulag prisoners (about 2.5 million in camps and colonies in 1950) are concentrated in the Russian north and Siberia and in Kazakhstan. The rest follow the official split of workers and office staff (1939 and 1959 censuses interpolated). Pensions were thin before the 1956 pension law and kolkhozniki had none until 1964, so pensioners are few."},
    {"id": "nationality-sex-age", "label": "Age and sex within each nationality", "dims": ["nationality", "sex", "age"], "given": ["nationality"],
     "values": nat_age_sex, "provenance": "estimate",
     "note": "Reconstructed age and sex structure for 1950: the war left about 21 million more women than men, concentrated among those over 30. Central Asian peoples were younger and lost fewer men."}
  ],
  "associations": [
    {"id": "farms-in-countryside", "dims": ["class", "settlement"],
     "odds": {"kolkhoz": {"city": 0}, "state_farm": {"city": 0}, "prisoner": {"rural": 3.0},
              "specialist": {"city": 2.5}, "nomenklatura": {"city": 3.0}, "white_collar": {"city": 1.8}, "industrial": {"city": 1.6}},
     "provenance": "estimate", "note": "Farm households live in the countryside; most camps were remote; officials and the intelligentsia lived in cities."},
    {"id": "nationality-settlement", "dims": ["nationality", "settlement"],
     "odds": {"russian": {"city": 1.6}, "jewish": {"city": 12}, "central_asian": {"rural": 2.0}, "baltic": {"rural": 1.3}},
     "provenance": "estimate", "note": "Russians outside Russia and Jews everywhere were overwhelmingly urban."},
    {"id": "nationality-class", "dims": ["nationality", "class"],
     "odds": {"jewish": {"kolkhoz": 0.05, "state_farm": 0.1, "white_collar": 3.0, "specialist": 5.0, "industrial": 0.8, "prisoner": 1.5},
              "russian": {"specialist": 1.4, "nomenklatura": 1.6, "industrial": 1.2},
              "baltic": {"prisoner": 2.5, "nomenklatura": 0.5},
              "ukrainian": {"prisoner": 1.4},
              "central_asian": {"specialist": 0.4, "industrial": 0.5, "kolkhoz": 1.4},
              "other": {"prisoner": 1.3}},
     "provenance": "estimate", "note": "Jews were concentrated in white-collar and specialist work (and among the victims of the 1949 'anti-cosmopolitan' campaign); Baltic and western Ukrainian resisters filled the camps after 1945."},
    {"id": "nationality-religion", "dims": ["nationality", "religion"],
     "odds": {"russian": {"orthodox": 1.0, "muslim": 0.01, "western": 0.01, "jewish": 0.001},
              "ukrainian": {"orthodox": 1.4, "muslim": 0.01, "western": 0.15, "jewish": 0.001},
              "belarusian": {"orthodox": 1.2, "muslim": 0.01, "western": 0.4, "jewish": 0.001},
              "central_asian": {"orthodox": 0.005, "muslim": 60, "western": 0.005, "jewish": 0.001},
              "caucasian": {"orthodox": 1.3, "muslim": 6, "western": 0.01, "jewish": 0.005},
              "baltic": {"orthodox": 0.05, "muslim": 0.005, "western": 40, "jewish": 0.001},
              "jewish": {"orthodox": 0.01, "muslim": 0.01, "western": 0.01, "jewish": 300},
              "other": {"muslim": 4, "western": 3, "orthodox": 1.0}},
     "provenance": "estimate", "note": "Religion follows nationality: Russians, Ukrainians and Belarusians Orthodox, Central Asians and Azeris Muslim, Lithuanians Catholic, Latvians and Estonians Lutheran."},
    {"id": "religion-age", "dims": ["religion", "age"],
     "odds": {"none": {"0-14": 1.6, "15-29": 1.5, "30-44": 1.0, "45-64": 0.6, "65+": 0.35}},
     "provenance": "estimate", "note": "The young, schooled under Soviet power, were far less religious than the old."},
    {"id": "religion-class", "dims": ["religion", "class"],
     "odds": {"none": {"nomenklatura": 20, "specialist": 2.5, "white_collar": 1.8, "kolkhoz": 0.6, "pensioner": 0.5}},
     "provenance": "estimate", "note": "Party membership required atheism; believers were most common among collective farmers and the old."},
    {"id": "age-class", "dims": ["age", "class"],
     "odds": {"0-14": {"prisoner": 0, "pensioner": 0.02}, "15-29": {"prisoner": 3.0, "pensioner": 0.05},
              "30-44": {"prisoner": 2.5, "pensioner": 0.05}, "45-64": {"prisoner": 1.0, "pensioner": 2.0}, "65+": {"prisoner": 0.3, "pensioner": 25}},
     "provenance": "estimate", "note": "Prisoners were adults, mostly young; pensioners old."},
    {"id": "sex-class", "dims": ["sex", "class"],
     "odds": {"male": {"prisoner": 5.0, "nomenklatura": 3.0}},
     "provenance": "estimate", "note": "About 85% of Gulag prisoners were men; the nomenklatura was overwhelmingly male."}
  ],
  "demography": {
    "fertility": {"15-29": 0.16, "30-44": 0.07},
    "mortality": {"0-14": 0.0060, "15-29": 0.0030, "30-44": 0.0050, "45-64": 0.0140, "65+": 0.0700},
    "fertilityMultipliers": {
      "nationality": {"central_asian": 1.7, "caucasian": 1.25, "baltic": 0.7, "jewish": 0.6, "russian": 0.95},
      "settlement": {"city": 0.65, "rural": 1.3},
      "class": {"prisoner": 0, "kolkhoz": 1.15, "specialist": 0.8, "nomenklatura": 0.8}
    },
    "mortalityMultipliers": {
      "class": {"prisoner": 3.0, "kolkhoz": 1.15, "nomenklatura": 0.7, "specialist": 0.85},
      "nationality": {"central_asian": 1.25},
      "sex": {"male": 1.4, "female": 0.75},
      "settlement": {"rural": 1.1}
    },
    "ageProfile": AGE_PROFILE,
    "crudeBirthRate": 26.7,
    "crudeDeathRate": 9.7,
    "maleBirthShare": 0.512,
    "mortalityImprovement": 0.045,
    "mortalityImprovementDecay": 0.15,
    "fertilityIncomeElasticity": 0.2,
    "initialExpectation": 0.85,
    "expectationAdjustment": 0.06,
    "cohortSizeElasticity": 0.5,
    "womenWorkElasticity": 0.8,
    "provenance": "estimate",
    "note": "Official 1950 vital rates (26.7 births and 9.7 deaths per 1,000); infant mortality was still high and fell fast in the 1950s, hence the steep early improvement, which fades by the late 1960s as Soviet health gains stalled. Central Asian families had many more children, Baltic and Jewish families far fewer. Prisoners have no children and die at about three times the normal rate. The single-year age profile carries the holes left by the 1933 famine and the wartime birth collapse; when those small cohorts reach their twenties in the 1960s, births fall. The Easterlin effects are weaker than in America: Soviet young adults had fewer choices about housing and work."
  },
  "economy": {
    "income": {
      "class": {"kolkhoz": -0.6, "state_farm": -0.3, "industrial": 0.0, "service": -0.15, "white_collar": 0.05,
                "specialist": 0.35, "nomenklatura": 1.0, "prisoner": -1.5, "pensioner": -0.5},
      "settlement": {"rural": -0.1}
    },
    "regionIncome": {"Russia": 0.0, "Ukraine and Moldova": -0.08, "Belarus": -0.1, "Baltics": 0.15, "Caucasus": -0.05,
                     "Kazakhstan": -0.05, "Central Asia": -0.3},
    "participation": {
      "rates": {"male": {"15-29": 0.82, "30-44": 0.96, "45-64": 0.88, "65+": 0.30},
                "female": {"15-29": 0.68, "30-44": 0.72, "45-64": 0.55, "65+": 0.15}},
      "multipliers": {"class": {"prisoner": 1.2, "pensioner": 0.15}},
      "femaleMultipliers": {"nationality": {"central_asian": 0.7}},
      "femaleTrend": 0.003
    },
    "employment": {
      "kolkhoz": {"agriculture": 1.0},
      "state_farm": {"agriculture": 0.9, "consumer_goods": 0.1},
      "industrial": {"heavy_industry": 0.45, "energy": 0.10, "consumer_goods": 0.25, "technology": 0.04, "services": 0.06, "shipping_trade": 0.10},
      "service": {"consumer_goods": 0.10, "services": 0.50, "shipping_trade": 0.40},
      "white_collar": {"heavy_industry": 0.15, "technology": 0.10, "services": 0.55, "shipping_trade": 0.20},
      "specialist": {"heavy_industry": 0.20, "energy": 0.10, "technology": 0.30, "services": 0.40},
      "nomenklatura": {"services": 1.0},
      "prisoner": {"agriculture": 0.15, "heavy_industry": 0.45, "energy": 0.25, "shipping_trade": 0.15}
    },
    "productivityGrowth": {"agriculture": 0.050, "heavy_industry": 0.030, "energy": 0.030, "consumer_goods": 0.025,
                           "technology": 0.030, "services": 0.010, "shipping_trade": 0.015},
    "mobility": {
      "rate": 0.4,
      "paths": {
        "kolkhoz": {"industrial": 0.8, "service": 0.6, "state_farm": 0.3, "white_collar": 0.1},
        "state_farm": {"industrial": 0.5, "service": 0.4},
        "industrial": {"white_collar": 0.4, "specialist": 0.3, "service": 0.2},
        "service": {"industrial": 0.6, "white_collar": 0.4},
        "white_collar": {"specialist": 0.5, "nomenklatura": 0.05},
        "specialist": {"nomenklatura": 0.1, "white_collar": 0.2},
        "nomenklatura": {"specialist": 0.2}
      },
      "leavingFarms": {"city": 0.75, "rural": 0.25},
      "oldAgeMobility": 0.2
    },
    "retirement": {"rate": 0.05},
    "suburbanisation": {"rate": 0, "incomeElasticity": 0, "odds": {}},
    "migration": {
      "rate": {"0-14": 0.010, "15-29": 0.030, "30-44": 0.015, "45-64": 0.008, "65+": 0.005},
      "sensitivity": 1.0,
      "barriers": {"nationality": barriers},
      "amenity": {"KAZ": 0.1},
      "sizeExponent": 1.0,
      "farmSurplusPenalty": 0.5
    },
    "engel": {"agriculture": 0.3, "heavy_industry": 0.9, "energy": 0.9, "consumer_goods": 0.7,
              "technology": 1.8, "services": 1.4, "shipping_trade": 1.0},
    "provenance": "estimate",
    "note": "Farm labour productivity grew about 5% a year as the farms mechanised (so the kolkhozy shed people even as output rose), industry's about 3%. Collective farmers were paid largely in kind and earned far less than workers; officials far more. Soviet women's labour force participation was among the highest in the world. Kolkhozniki held no internal passports until 1974, so farm households cannot move between republics: they leave the land only through recruitment into industry and services, which follows the jobs the Plan creates. Prisoners have no path out through the jobs market: only policy (the 1953 amnesty, the post-1956 releases) can free them. Non-Russian peoples rarely left their homelands, while Russians were recruited to Kazakhstan and the Baltic republics. No immigration."
  }
}

json.dump(model, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
tot = sum(state_pop.values())
print('total', tot)
for table, name in ((nat, 'nationality'), (settle, 'settlement'), (cls, 'class')):
    keys = next(iter(table.values())).keys()
    print(name, {kk: round(sum(table[k][kk] * state_pop[k] for k in order) / tot * 100, 1) for kk in keys})
