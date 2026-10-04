"""Generates data/pops/usa-1950.json from 1950 census figures by state.

Run from the project root: python3 tools/usa_1950_pops.py data/pops/usa-1950.json
The table below is the easiest place to check or correct a state's figures; then rerun.

Columns per state:
  pop      1950 census population (April 1950)
  black    % Negro (census race)
  hisp     % of Spanish surname / Puerto Rican origin (estimate; census counted them as white)
  asian    % Chinese, Japanese, Filipino and other Asian
  native   % American Indian (enumerated)
  urban    % urban, 1950 (new) definition
  sub      % living in the urban fringe of urbanised areas (suburbs) - estimate
  farm     % rural-farm population
  cath     % Roman Catholic (1952 NCC church membership, adjusted to the whole population) - estimate
  jew      % Jewish (American Jewish Year Book estimates) - estimate
  oth      % other religions (Latter-day Saints, Eastern Orthodox, Buddhist...) - estimate
  none     % no religion - estimate
"""
import json, sys

DIV = {
 'NE': ['ME','NH','VT','MA','RI','CT'], 'MA': ['NY','NJ','PA'], 'ENC': ['OH','IN','IL','MI','WI'],
 'WNC': ['MN','IA','MO','ND','SD','NE','KS'], 'SA': ['DE','MD','DC','VA','WV','NC','SC','GA','FL'],
 'ESC': ['KY','TN','AL','MS'], 'WSC': ['AR','LA','OK','TX'], 'MTN': ['MT','ID','WY','CO','NM','AZ','UT','NV'],
 'PAC': ['WA','OR','CA'],
}
DIV_LABEL = {'NE':'New England','MA':'Middle Atlantic','ENC':'East North Central','WNC':'West North Central',
 'SA':'South Atlantic','ESC':'East South Central','WSC':'West South Central','MTN':'Mountain','PAC':'Pacific'}
NAMES = dict(AL='Alabama',AZ='Arizona',AR='Arkansas',CA='California',CO='Colorado',CT='Connecticut',DE='Delaware',
 DC='District of Columbia',FL='Florida',GA='Georgia',ID='Idaho',IL='Illinois',IN='Indiana',IA='Iowa',KS='Kansas',
 KY='Kentucky',LA='Louisiana',ME='Maine',MD='Maryland',MA='Massachusetts',MI='Michigan',MN='Minnesota',MS='Mississippi',
 MO='Missouri',MT='Montana',NE='Nebraska',NV='Nevada',NH='New Hampshire',NJ='New Jersey',NM='New Mexico',NY='New York',
 NC='North Carolina',ND='North Dakota',OH='Ohio',OK='Oklahoma',OR='Oregon',PA='Pennsylvania',RI='Rhode Island',
 SC='South Carolina',SD='South Dakota',TN='Tennessee',TX='Texas',UT='Utah',VT='Vermont',VA='Virginia',WA='Washington',
 WV='West Virginia',WI='Wisconsin',WY='Wyoming')

#      pop        black hisp  asian native urban sub  farm  cath jew  oth  none
S = {
'AL': (3061743,  32.0, 0.1, 0.0, 0.0, 43.8,  6, 33.0,  3.0, 0.3, 0.3, 1.5),
'AZ': ( 749587,   3.5,17.1, 0.6, 8.8, 55.5,  6,  9.0, 22.0, 0.6, 5.0, 4.0),
'AR': (1909511,  22.3, 0.1, 0.0, 0.0, 33.0,  2, 40.0,  3.0, 0.2, 0.3, 2.0),
'CA': (10586223,  4.4, 7.2, 1.7, 0.2, 80.7, 22,  6.0, 20.0, 2.8, 1.5, 6.0),
'CO': (1325089,   1.5, 8.9, 0.4, 0.1, 62.7,  9, 14.0, 17.0, 1.5, 2.0, 4.5),
'CT': (2007280,   2.7, 0.3, 0.1, 0.0, 77.6, 15,  2.5, 42.0, 3.6, 1.5, 2.5),
'DE': ( 318085,  13.7, 0.2, 0.0, 0.0, 62.6, 10, 11.0, 18.0, 1.5, 0.8, 2.5),
'DC': ( 802178,  35.0, 0.5, 0.4, 0.0,100.0,  0,  0.0, 22.0, 5.0, 1.5, 3.0),
'FL': (2771305,  21.8, 1.0, 0.0, 0.0, 65.5,  6,  9.0,  7.0, 1.9, 0.5, 3.0),
'GA': (3444578,  30.9, 0.1, 0.0, 0.0, 45.3,  7, 25.0,  2.0, 0.6, 0.3, 1.5),
'ID': ( 588637,   0.2, 1.0, 0.2, 0.6, 42.9,  2, 30.0,  7.0, 0.1,25.0, 5.0),
'IL': (8712176,   7.4, 0.4, 0.2, 0.0, 77.6, 14, 10.0, 27.0, 3.6, 1.5, 3.0),
'IN': (3934224,   4.4, 0.3, 0.0, 0.0, 59.9,  6, 17.0, 13.0, 0.6, 0.6, 3.0),
'IA': (2621073,   0.8, 0.2, 0.0, 0.1, 47.7,  4, 33.0, 14.0, 0.4, 0.8, 2.5),
'KS': (1905299,   3.0, 0.5, 0.0, 0.1, 52.1,  5, 22.0, 11.0, 0.3, 1.0, 3.0),
'KY': (2944806,   6.9, 0.1, 0.0, 0.0, 36.8,  5, 35.0,  8.0, 0.4, 0.3, 2.0),
'LA': (2683516,  32.9, 0.3, 0.0, 0.1, 54.8,  7, 22.0, 33.0, 0.6, 0.3, 1.5),
'ME': ( 913774,   0.1, 0.1, 0.0, 0.2, 51.7,  3, 11.0, 25.0, 0.8, 0.8, 3.0),
'MD': (2343001,  16.5, 0.2, 0.1, 0.0, 69.0, 18,  8.0, 20.0, 3.2, 1.0, 2.5),
'MA': (4690514,   1.6, 0.2, 0.1, 0.0, 84.4, 24,  1.4, 47.0, 4.8, 1.5, 2.5),
'MI': (6371766,   6.9, 0.3, 0.1, 0.1, 70.7, 17,  9.0, 24.0, 1.5, 1.5, 3.0),
'MN': (2982483,   0.5, 0.2, 0.0, 0.4, 54.5,  9, 26.0, 25.0, 1.0, 1.0, 2.5),
'MS': (2178914,  45.3, 0.0, 0.0, 0.1, 27.9,  1, 48.0,  3.0, 0.2, 0.2, 1.5),
'MO': (3954653,   7.5, 0.2, 0.0, 0.0, 61.5, 10, 23.0, 17.0, 1.9, 1.0, 3.0),
'MT': ( 591024,   0.2, 0.5, 0.1, 2.8, 43.7,  2, 25.0, 18.0, 0.2, 1.5, 5.0),
'NE': (1325510,   1.5, 0.3, 0.0, 0.3, 46.9,  5, 30.0, 17.0, 0.6, 1.0, 3.0),
'NV': ( 160083,   2.7, 2.0, 0.5, 3.1, 57.2,  3,  6.0, 20.0, 0.8,12.0, 7.0),
'NH': ( 533242,   0.1, 0.1, 0.0, 0.0, 57.5,  3,  6.0, 35.0, 0.8, 1.0, 3.0),
'NJ': (4835329,   6.6, 0.4, 0.1, 0.0, 86.6, 32,  2.0, 34.0, 5.7, 1.5, 2.5),
'NM': ( 681187,   1.2,36.5, 0.1, 6.2, 50.2,  4, 16.0, 50.0, 0.3, 2.0, 3.0),
'NY': (14830192,  6.2, 1.8, 0.2, 0.1, 85.5, 18,  4.0, 34.0,16.3, 1.5, 3.0),
'NC': (4061929,  25.8, 0.0, 0.0, 0.1, 33.7,  3, 34.0,  1.0, 0.2, 0.2, 1.5),
'ND': ( 619636,   0.0, 0.1, 0.0, 1.7, 26.6,  1, 41.0, 23.0, 0.2, 1.0, 2.0),
'OH': (7946627,   6.5, 0.3, 0.0, 0.0, 70.2, 14, 10.0, 20.0, 2.2, 1.5, 3.0),
'OK': (2233351,   6.5, 0.2, 0.0, 2.4, 51.0,  6, 23.0,  4.0, 0.3, 0.5, 3.0),
'OR': (1521341,   0.8, 0.5, 0.4, 0.4, 53.9,  8, 13.0,  9.0, 0.6, 1.5, 7.0),
'PA': (10498012,  6.1, 0.2, 0.0, 0.0, 70.5, 15,  6.0, 27.0, 4.3, 2.0, 2.5),
'RI': ( 791896,   1.8, 0.2, 0.0, 0.0, 84.3, 20,  1.0, 58.0, 3.2, 1.0, 2.0),
'SC': (2117027,  38.8, 0.0, 0.0, 0.0, 36.7,  4, 30.0,  2.0, 0.4, 0.2, 1.5),
'SD': ( 652740,   0.1, 0.1, 0.0, 3.6, 33.2,  1, 37.0, 17.0, 0.2, 1.0, 2.5),
'TN': (3291718,  16.1, 0.0, 0.0, 0.0, 44.1,  6, 30.0,  2.0, 0.6, 0.3, 1.5),
'TX': (7711194,  12.7,13.4, 0.0, 0.0, 62.7,  10, 15.0, 17.0, 0.7, 0.5, 2.5),
'UT': ( 688862,   0.4, 1.0, 0.4, 0.6, 65.3,  4, 10.0,  4.0, 0.2,68.0, 3.0),
'VT': ( 377747,   0.1, 0.0, 0.0, 0.0, 36.4,  1, 24.0, 30.0, 0.5, 0.8, 3.0),
'VA': (3318680,  22.1, 0.1, 0.0, 0.0, 47.0,  9, 21.0,  4.0, 0.9, 0.5, 2.0),
'WA': (2378963,   1.3, 0.5, 0.7, 0.6, 63.2, 12, 11.0, 12.0, 0.9, 2.0, 7.0),
'WV': (2005552,   5.7, 0.0, 0.0, 0.0, 34.6,  4, 17.0,  5.0, 0.4, 0.5, 2.5),
'WI': (3434575,   0.8, 0.2, 0.0, 0.4, 57.9,  9, 22.0, 31.0, 1.0, 1.0, 2.5),
'WY': ( 290529,   0.9, 3.0, 0.2, 1.1, 49.8,  2, 18.0, 15.0, 0.2, 9.0, 5.0),
}

# Share of the farm population in tenant, sharecropper and hired-labour households, by division (estimate).
TENANCY = {'NE':0.18,'MA':0.22,'ENC':0.28,'WNC':0.33,'SA':0.45,'ESC':0.48,'WSC':0.45,'MTN':0.32,'PAC':0.40}
TENANCY_STATE = {'MS':0.62,'SC':0.54,'GA':0.50,'AL':0.52,'LA':0.55,'AR':0.52,'NC':0.48,'TN':0.42,'KY':0.36,'TX':0.45,'OK':0.42}
# Share of people in retired households (head out of the labour force), by division (estimate).
RETIRED = {'NE':0.072,'MA':0.064,'ENC':0.060,'WNC':0.070,'SA':0.050,'ESC':0.048,'WSC':0.050,'MTN':0.058,'PAC':0.068}
RETIRED_STATE = {'FL':0.085}
# Non-farm working households by the head's occupation, by division: industrial, labour & service, clerical & sales, professional, business.
PROFILE = {
 'NE':(0.42,0.14,0.19,0.10,0.15),'MA':(0.38,0.14,0.22,0.10,0.16),'ENC':(0.44,0.14,0.18,0.09,0.15),
 'WNC':(0.32,0.17,0.21,0.10,0.20),'SA':(0.33,0.24,0.18,0.09,0.16),'ESC':(0.36,0.25,0.16,0.08,0.15),
 'WSC':(0.30,0.23,0.19,0.09,0.19),'MTN':(0.31,0.19,0.19,0.11,0.20),'PAC':(0.33,0.17,0.21,0.11,0.18),
}
PROFILE_STATE = {'DC':(0.12,0.22,0.40,0.14,0.12),'MI':(0.52,0.12,0.16,0.08,0.12),'NY':(0.34,0.14,0.25,0.11,0.16)}

# Church membership undercounts people who call themselves Catholic; scale to the 1957 CPS (25.7% of adults).
CATHOLIC_ID = 1.24

div_of = {s: d for d, ss in DIV.items() for s in ss}
assert sorted(div_of) == sorted(S), set(S) ^ set(div_of)
order = sorted(S, key=lambda s: NAMES[s])

def r4(x): return round(x, 4)

state_pop = {s: S[s][0] for s in order}
state_race, state_settle, state_class, state_rel = {}, {}, {}, {}
for s in order:
    pop, black, hisp, asian, native, urban, sub, farm, cath, jew, oth, none = S[s]
    white = 100 - black - hisp - asian - native
    state_race[s] = {k: r4(v/100) for k, v in dict(white=white, black=black, hispanic=hisp, asian=asian, native=native).items()}
    city = urban - sub
    rural = 100 - urban
    assert farm <= rural + 1e-9, (s, farm, rural)
    state_settle[s] = {'city': r4(city/100), 'suburb': r4(sub/100), 'rural': r4(rural/100)}
    d = div_of[s]
    ten = TENANCY_STATE.get(s, TENANCY[d])
    ret = RETIRED_STATE.get(s, RETIRED[d])
    prof = PROFILE_STATE.get(s, PROFILE[d])
    f = farm/100
    rest = 1 - f - ret
    cls = {'farm_owner': f*(1-ten), 'farm_tenant': f*ten,
           'industrial': rest*prof[0], 'labour_service': rest*prof[1], 'clerical_sales': rest*prof[2],
           'professional': rest*prof[3], 'business': rest*prof[4], 'retired': ret}
    state_class[s] = {k: r4(v) for k, v in cls.items()}
    cath = min(cath * CATHOLIC_ID, 70)
    prot = 100 - cath - jew - oth - none
    state_rel[s] = {k: r4(v/100) for k, v in dict(protestant=prot, catholic=cath, jewish=jew, other=oth, none=none).items()}

# Fix rounding so each row sums to exactly 1 (put the residual in the largest cell).
for table in (state_race, state_settle, state_class, state_rel):
    for s, row in table.items():
        diff = round(1 - sum(row.values()), 4)
        k = max(row, key=row.get)
        row[k] = round(row[k] + diff, 4)

# Age and sex within each race, 1950 (shares of the race's total; male, female per band).
AGE = ['0-14','15-29','30-44','45-64','65+']
AGE_SHARE = {
 'white':   (26.4, 22.3, 21.9, 20.9, 8.5),
 'black':   (30.5, 24.8, 21.0, 17.3, 6.4),
 'hispanic':(36.0, 26.0, 18.0, 15.0, 5.0),
 'asian':   (24.0, 25.0, 20.0, 21.0,10.0),
 'native':  (37.0, 25.0, 17.0, 15.0, 6.0),
}
MALE_SHARE = {  # share male within each age band
 'white':   (0.510, 0.494, 0.493, 0.502, 0.465),
 'black':   (0.502, 0.475, 0.474, 0.495, 0.470),
 'hispanic':(0.509, 0.500, 0.500, 0.505, 0.480),
 'asian':   (0.515, 0.560, 0.600, 0.640, 0.700),
 'native':  (0.508, 0.500, 0.505, 0.515, 0.520),
}
race_age_sex = {}
for race, shares in AGE_SHARE.items():
    tot = sum(shares)
    race_age_sex[race] = {
        'male': {a: r4(sh/tot*m) for a, sh, m in zip(AGE, shares, MALE_SHARE[race])},
        'female': {a: r4(sh/tot*(1-m)) for a, sh, m in zip(AGE, shares, MALE_SHARE[race])},
    }
    total = sum(race_age_sex[race]['male'].values()) + sum(race_age_sex[race]['female'].values())
    race_age_sex[race]['female']['15-29'] = r4(race_age_sex[race]['female']['15-29'] + 1 - total)

# People by single year of age, January 1949 (millions). Ages 0-9 from births by year (1939-48) less infant and child
# deaths: the baby boom (born 1946-48) sits on top of the small Depression and wartime cohorts. Ages 10 and over are
# the 1950 census five-year groups divided evenly. Only the shape matters: the game rescales it to the pops.
AGE_PROFILE = [3.53, 3.69, 3.29, 2.76, 2.84, 3.00, 2.89, 2.61, 2.48, 2.39]
for avg in (2.22, 2.12, 2.30, 2.45, 2.30, 2.25, 2.04, 1.81, 1.65, 1.45, 1.21, 1.00, 0.68, 0.43, 0.225):
    AGE_PROFILE += [avg] * 5
AGE_PROFILE.append(0.58)  # 85 and over

model = {
  "id": "usa-1950",
  "nation": "usa",
  "label": "United States, 1950 census",
  "censusYear": 1950,
  "scaleToStat": "population",
  "threshold": 250,
  "verification": "unchecked",
  "cohorts": [{"label": "Baby boom · born 1946–64", "from": 1946, "to": 1964}],
  "sources": [
    {"label": "US Census Bureau, Census of Population: 1950, Vol. II, Characteristics of the Population (state parts)", "url": "https://www.census.gov/library/publications/1953/dec/population-vol-02.html"},
    {"label": "US Census Bureau, Statistical Abstract of the United States 1952", "url": "https://www.census.gov/library/publications/1952/compendia/statab/73ed.html"},
    {"label": "National Council of Churches, Churches and Church Membership in the United States (1956, data for 1952)"},
    {"label": "American Jewish Year Book (1950–52), Jewish population estimates by state"},
    {"label": "Current Population Survey, March 1957: religion reported by persons 14 and over"}
  ],
  "attributes": [
    {"id": "state", "label": "State", "role": "region", "categories":
       [{"id": s, "label": NAMES[s], "group": DIV_LABEL[div_of[s]]} for s in order]},
    {"id": "race", "label": "Race and ethnicity", "role": "ethnicity", "categories": [
       {"id": "white", "label": "White"}, {"id": "black", "label": "Black"},
       {"id": "hispanic", "label": "Hispanic"}, {"id": "asian", "label": "Asian"},
       {"id": "native", "label": "Native American"}]},
    {"id": "sex", "label": "Sex", "role": "sex", "categories": [
       {"id": "male", "label": "Men and boys"}, {"id": "female", "label": "Women and girls", "female": True}]},
    {"id": "class", "label": "Household class", "role": "class", "categories": [
       {"id": "farm_owner", "label": "Farm owners", "farm": True},
       {"id": "farm_tenant", "label": "Tenants, sharecroppers and farmhands", "farm": True},
       {"id": "industrial", "label": "Industrial workers"},
       {"id": "labour_service", "label": "Labourers and service workers"},
       {"id": "clerical_sales", "label": "Clerks and salespeople"},
       {"id": "professional", "label": "Professionals"},
       {"id": "business", "label": "Managers and proprietors"},
       {"id": "retired", "label": "Retired households", "retired": True}]},
    {"id": "religion", "label": "Religion", "role": "religion", "categories": [
       {"id": "protestant", "label": "Protestant"}, {"id": "catholic", "label": "Catholic"},
       {"id": "jewish", "label": "Jewish"}, {"id": "other", "label": "Other (Latter-day Saints, Orthodox, Buddhist…)"},
       {"id": "none", "label": "No religion"}]},
    {"id": "age", "label": "Age", "role": "age", "categories": [
       {"id": "0-14", "label": "0–14", "ageFrom": 0, "ageWidth": 15},
       {"id": "15-29", "label": "15–29", "ageFrom": 15, "ageWidth": 15},
       {"id": "30-44", "label": "30–44", "ageFrom": 30, "ageWidth": 15},
       {"id": "45-64", "label": "45–64", "ageFrom": 45, "ageWidth": 20},
       {"id": "65+", "label": "65 and over", "ageFrom": 65}]},
    {"id": "settlement", "label": "Where they live", "role": "settlement", "categories": [
       {"id": "city", "label": "Cities and towns"}, {"id": "suburb", "label": "Suburbs"}, {"id": "rural", "label": "Countryside"}]}
  ],
  "margins": [
    {"id": "state-population", "label": "Population by state", "dims": ["state"], "given": [],
     "values": state_pop, "provenance": "measured",
     "note": "1950 census population by state (1 April 1950), including the District of Columbia. The game scales the total to its January 1949 population."},
    {"id": "state-race", "label": "Race and ethnicity by state", "dims": ["state", "race"], "given": ["state"],
     "values": state_race, "provenance": "estimate",
     "note": "Black, Asian and Native American shares from the 1950 census race tables (rounded). Hispanic is an estimate: the 1950 census counted most Hispanic Americans as white, so the share uses the census count of white persons of Spanish surname in the five south-western states and Puerto Rican origin in New York, with small allowances elsewhere. White is the remainder."},
    {"id": "state-settlement", "label": "City, suburb and countryside by state", "dims": ["state", "settlement"], "given": ["state"],
     "values": state_settle, "provenance": "estimate",
     "note": "Countryside is the 1950 census rural share. Suburbs are an estimate of the urban fringe of each state's urbanised areas (13.8% nationally); cities and towns are the rest of the urban population."},
    {"id": "state-class", "label": "Household class by state", "dims": ["state", "class"], "given": ["state"],
     "values": state_class, "provenance": "estimate",
     "note": "Farm households are the 1950 rural-farm share, split between owners and tenant, sharecropper or hired-labour households by each division's tenancy (higher in the Cotton South). Retired households are an estimate by division. The rest are split by each division's occupational mix of household heads, from the 1950 census occupation tables (estimate)."},
    {"id": "state-religion", "label": "Religion by state", "dims": ["state", "religion"], "given": ["state"],
     "values": state_rel, "provenance": "estimate",
     "note": "Catholic shares from 1952 church membership by state, scaled up by a quarter so the national share matches self-identification in the 1957 CPS (25.7%); Jewish shares from the American Jewish Year Book; Latter-day Saints counted under Other; no religion near the 1957 CPS figure (2.7%), higher in the West. Protestant is the remainder. The census asked no religion question, so every figure is an estimate."},
    {"id": "race-sex-age", "label": "Age and sex within each race", "dims": ["race", "sex", "age"], "given": ["race"],
     "values": race_age_sex, "provenance": "estimate",
     "note": "1950 census age distribution by race (white and nonwhite), rounded; Hispanic and Native American populations were younger, Asian Americans older and mostly male after decades of exclusion laws."}
  ],
  "associations": [
    {"id": "farms-in-countryside", "dims": ["class", "settlement"],
     "odds": {"farm_owner": {"city": 0, "suburb": 0}, "farm_tenant": {"city": 0, "suburb": 0},
              "professional": {"suburb": 2.0, "rural": 0.6}, "business": {"suburb": 1.7, "rural": 0.8},
              "industrial": {"city": 1.2}, "clerical_sales": {"city": 1.2, "suburb": 1.3, "rural": 0.6},
              "retired": {"rural": 1.2}},
     "provenance": "estimate", "note": "Farm households live in the countryside by definition. White-collar households were overrepresented in the suburbs."},
    {"id": "race-class", "dims": ["race", "class"],
     "odds": {"black": {"farm_owner": 0.5, "farm_tenant": 3.5, "industrial": 0.8, "labour_service": 3.0, "clerical_sales": 0.25, "professional": 0.25, "business": 0.2, "retired": 0.8},
              "hispanic": {"farm_owner": 0.5, "farm_tenant": 3.0, "industrial": 1.1, "labour_service": 2.2, "clerical_sales": 0.5, "professional": 0.35, "business": 0.5},
              "asian": {"farm_owner": 1.5, "farm_tenant": 1.5, "labour_service": 1.8, "business": 1.8, "professional": 0.8},
              "native": {"farm_owner": 1.0, "farm_tenant": 2.5, "labour_service": 2.5, "clerical_sales": 0.3, "professional": 0.3, "business": 0.3}},
     "provenance": "estimate", "note": "1950 census occupations by race: Black and Hispanic workers were concentrated in farm labour, sharecropping, labouring and domestic service and largely shut out of white-collar jobs."},
    {"id": "race-settlement", "dims": ["race", "settlement"],
     "odds": {"black": {"city": 1.5, "suburb": 0.25}, "hispanic": {"city": 1.2, "suburb": 0.5},
              "asian": {"city": 2.0, "suburb": 0.6}, "native": {"city": 0.3, "suburb": 0.2, "rural": 3.0}},
     "provenance": "estimate", "note": "Restrictive covenants and redlining kept Black families out of most suburbs; most Native Americans lived on or near reservations."},
    {"id": "race-religion", "dims": ["race", "religion"],
     "odds": {"black": {"catholic": 0.15, "jewish": 0.01, "other": 0.3},
              "hispanic": {"catholic": 15, "jewish": 0.05},
              "asian": {"other": 12, "catholic": 1.5, "jewish": 0.05},
              "native": {"other": 4, "catholic": 1.5, "jewish": 0.02}},
     "provenance": "estimate", "note": "Black Americans were overwhelmingly Protestant, Hispanic Americans overwhelmingly Catholic; many Asian Americans were Buddhist."},
    {"id": "religion-settlement", "dims": ["religion", "settlement"],
     "odds": {"jewish": {"city": 4.0, "suburb": 2.5, "rural": 0.08}, "catholic": {"city": 1.5, "suburb": 1.2, "rural": 0.6}},
     "provenance": "estimate", "note": "Jewish and Catholic Americans lived mostly in cities; the countryside was heavily Protestant."},
    {"id": "religion-class", "dims": ["religion", "class"],
     "odds": {"jewish": {"farm_owner": 0.03, "farm_tenant": 0.02, "industrial": 0.7, "labour_service": 0.4, "clerical_sales": 1.6, "professional": 2.2, "business": 2.8},
              "catholic": {"farm_owner": 0.6, "farm_tenant": 0.6, "industrial": 1.3}},
     "provenance": "estimate", "note": "Jewish households were concentrated in business, the professions and clerical work; Catholics in industrial work."},
    {"id": "age-class", "dims": ["age", "class"],
     "odds": {"0-14": {"retired": 0.03}, "15-29": {"retired": 0.08}, "30-44": {"retired": 0.08}, "45-64": {"retired": 2.0}, "65+": {"retired": 30}},
     "provenance": "estimate", "note": "Retired households are headed by older people; few children live in them."}
  ],
  "demography": {
    "fertility": {"15-29": 0.155, "30-44": 0.060},
    "mortality": {"0-14": 0.0025, "15-29": 0.0016, "30-44": 0.0035, "45-64": 0.0130, "65+": 0.0620},
    "fertilityMultipliers": {
      "race": {"black": 1.25, "hispanic": 1.5, "native": 1.6, "asian": 0.9},
      "religion": {"catholic": 1.15, "jewish": 0.75, "other": 1.2},
      "settlement": {"rural": 1.2, "suburb": 1.05, "city": 0.9},
      "class": {"farm_owner": 1.15, "farm_tenant": 1.3, "professional": 0.85, "business": 0.9}
    },
    "mortalityMultipliers": {
      "race": {"black": 1.4, "hispanic": 1.1, "native": 1.6, "asian": 0.9},
      "class": {"farm_tenant": 1.15, "labour_service": 1.1, "professional": 0.85, "business": 0.9},
      "sex": {"male": 1.25, "female": 0.8}
    },
    "ageProfile": AGE_PROFILE,
    "crudeBirthRate": 24.5,
    "crudeDeathRate": 9.7,
    "maleBirthShare": 0.512,
    "mortalityImprovement": 0.012,
    "fertilityIncomeElasticity": 1.6,
    "initialExpectation": 0.80,
    "expectationAdjustment": 0.06,
    "cohortSizeElasticity": 2.0,
    "womenWorkElasticity": 0.8,
    "provenance": "estimate",
    "note": "1949 vital statistics: 3.65 million births (24.5 per 1,000) and 1.44 million deaths (9.7 per 1,000). The single-year age profile (January 1949) comes from births by year for ages 0–9 and the 1950 census five-year groups above that; it carries the baby boom's cohorts through the age bands as a wave. Age-specific rates are round estimates, rescaled at game start to hit those totals exactly. Multipliers by race, religion, place and class follow 1950 differentials (nonwhite life expectancy about eight years shorter; higher fertility among farm, Catholic and Hispanic families). The Easterlin parameters are calibration choices: young adults in 1949 grew up in the Depression and expect about 80% of the living standard they actually have, which lifts fertility while incomes outrun expectations. Two further Easterlin-style forces bring the boom to an end: a big generation reaching adulthood has fewer children (relative cohort size), and fertility falls as women's labour force participation rises. Both elasticities are calibration choices, tuned to the fall in the birth rate from about 24 per 1,000 in 1960 to about 16 in 1980."
  }
}


SOUTH = [s for d in ('SA','ESC','WSC') for s in DIV[d] if s not in ('DE','MD','DC','WV')]
model["economy"] = {
  "income": {
    "class": {"farm_owner": -0.30, "farm_tenant": -0.95, "industrial": 0.05, "labour_service": -0.35,
              "clerical_sales": 0.10, "professional": 0.55, "business": 0.60, "retired": -0.45},
    "race": {"black": -0.35, "hispanic": -0.25, "native": -0.50, "asian": -0.05},
    "settlement": {"suburb": 0.15, "rural": -0.10}
  },
  "regionIncome": {"New England": 0.05, "Middle Atlantic": 0.12, "East North Central": 0.08, "West North Central": -0.05,
                   "South Atlantic": -0.10, "East South Central": -0.22, "West South Central": -0.10, "Mountain": 0.0, "Pacific": 0.12},
  "participation": {
    "rates": {"male": {"15-29": 0.80, "30-44": 0.96, "45-64": 0.90, "65+": 0.45},
              "female": {"15-29": 0.40, "30-44": 0.36, "45-64": 0.33, "65+": 0.10}},
    "multipliers": {"race": {"black": 1.0}, "class": {"retired": 0.15}},
    "femaleMultipliers": {"race": {"black": 1.4}, "class": {"farm_owner": 0.7, "farm_tenant": 0.9}},
    "femaleTrend": 0.005
  },
  "employment": {
    "farm_owner": {"agriculture": 1.0},
    "farm_tenant": {"agriculture": 1.0},
    "industrial": {"heavy_industry": 0.38, "energy": 0.08, "consumer_goods": 0.32, "technology": 0.04, "services": 0.06, "shipping_trade": 0.12},
    "labour_service": {"heavy_industry": 0.08, "energy": 0.04, "consumer_goods": 0.08, "services": 0.55, "shipping_trade": 0.25},
    "clerical_sales": {"heavy_industry": 0.08, "consumer_goods": 0.08, "technology": 0.04, "services": 0.40, "shipping_trade": 0.40},
    "professional": {"heavy_industry": 0.06, "energy": 0.02, "consumer_goods": 0.04, "technology": 0.20, "services": 0.65, "shipping_trade": 0.03},
    "business": {"heavy_industry": 0.08, "energy": 0.03, "consumer_goods": 0.12, "technology": 0.07, "services": 0.30, "shipping_trade": 0.40}
  },
  "productivityGrowth": {"agriculture": 0.062, "heavy_industry": 0.028, "energy": 0.030, "consumer_goods": 0.028,
                         "technology": 0.030, "services": 0.012, "shipping_trade": 0.020},
  "mobility": {
    "rate": 0.60,
    "paths": {
      "farm_owner": {"industrial": 0.6, "business": 0.5, "clerical_sales": 0.3, "labour_service": 0.3},
      "farm_tenant": {"labour_service": 1.0, "industrial": 0.8},
      "industrial": {"clerical_sales": 0.5, "professional": 0.2, "labour_service": 0.3, "business": 0.2},
      "labour_service": {"industrial": 1.0, "clerical_sales": 0.4},
      "clerical_sales": {"professional": 0.5, "business": 0.5, "industrial": 0.2},
      "professional": {"business": 0.4, "clerical_sales": 0.2},
      "business": {"professional": 0.3, "clerical_sales": 0.3}
    },
    "leavingFarms": {"city": 0.55, "suburb": 0.20, "rural": 0.25},
    "oldAgeMobility": 0.3
  },
  "retirement": {"rate": 0.08},
  "suburbanisation": {"rate": 0.012, "incomeElasticity": 1.0,
                      "odds": {"race": {"black": 0.12, "hispanic": 0.5, "asian": 0.5},
                               "class": {"professional": 1.6, "business": 1.5, "clerical_sales": 1.2, "labour_service": 0.6, "retired": 0.4}}},
  "migration": {
    "rate": {"0-14": 0.03, "15-29": 0.07, "30-44": 0.04, "45-64": 0.02, "65+": 0.015},
    "sensitivity": 1.5,
    "barriers": {"race": {"black": {s: -0.35 for s in SOUTH}}},
    "amenity": {"CA": 0.35, "FL": 0.6, "AZ": 0.45, "NV": 0.5, "NM": 0.15, "TX": 0.12, "CO": 0.12, "OR": 0.05, "WA": 0.05,
                "WV": -0.25, "AR": -0.15, "KY": -0.1, "MS": -0.1, "ND": -0.15, "SD": -0.1, "ME": -0.05, "VT": -0.05},
    "sizeExponent": 1.0,
    "farmSurplusPenalty": 1.2
  },
  "immigration": {
    "rate": 0.0016,
    "shares": {"race": {"white": 0.78, "hispanic": 0.15, "asian": 0.05, "black": 0.02},
               "age": {"0-14": 0.20, "15-29": 0.45, "30-44": 0.25, "45-64": 0.08, "65+": 0.02}},
    "odds": {"settlement": {"city": 2.0, "suburb": 1.0, "rural": 0.4}}
  },
  "engel": {"agriculture": 0.3, "heavy_industry": 0.9, "energy": 0.9, "consumer_goods": 0.6,
            "technology": 1.8, "services": 1.4, "shipping_trade": 1.0},
  "provenance": "estimate",
  "note": "Income gaps are log points from the 1950 census income tables (Black family income about 54% of white, the South about 70% of the rest of the country), split between class, race, place and region. Labour force participation from the 1950 census (women 34%, men 87%), with women's participation rising about half a point a year, as it did from 1950 to 1980. Where each class works and sector productivity growth (USDA farm output per hour rose about 3.4-fold between 1950 and 1970, 6.2% a year) are estimates from BLS productivity series. Mobility, suburbanisation and migration rates are calibrated to 1950s flows: farm population falling about 4% a year, about 3% of Americans moving between states each year, the suburbs' share rising. Immigration runs at about 0.16% of the population a year, as under the 1924 quota system in the 1950s (about 250,000 a year), mostly European with Mexican and Canadian arrivals; later policy (the 1965 Hart–Celler Act) can change it. Destinations draw movers by size (dampened, so the biggest states do not swallow every mover) and by a climate-and-land pull that favours the Sun Belt and penalises declining Appalachian and Plains states (estimates calibrated to 1950s state growth). States where many families still farm push people out (too few town jobs for those leaving the land), a pull that fades as they modernise. Jim Crow is an explicit penalty on Black families' wellbeing in the former Confederacy and Kentucky/Oklahoma border South, which drives the Great Migration and which civil rights events can later remove. Engel elasticities follow standard household demand estimates: food well below 1 (most food reaches households through the consumer-goods sector, so its elasticity is low), services and technology above it."
}

json.dump(model, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
tot = sum(S[s][0] for s in S)
nat = lambda tab, k: sum(tab[s][k]*S[s][0] for s in S)/tot
print('total', tot)
for tab, name in ((state_race,'race'),(state_settle,'settle'),(state_class,'class'),(state_rel,'religion')):
    keys = next(iter(tab.values())).keys()
    print(name, {k: round(nat(tab,k)*100,1) for k in keys})
