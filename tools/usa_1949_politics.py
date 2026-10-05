"""Generates data/politics/usa-1949.json: American politics at the start of Truman's second term.

Run from the project root: python3 tools/usa_1949_politics.py data/politics/usa-1949.json

Opinion, interest groups, the 81st Congress, political capital and elections. Party leaning is
log-odds towards the Democrats. Levers are "budget:<line>", "tax:<line>" (per 10 points of rate)
and "indexation" (on/off); budget changes are measured in log points (+0.1 = about +10%).
"""
import json, sys

STATES = ['AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
          'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR',
          'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']
# The former Confederacy: the Solid South of one-party Democratic rule and Jim Crow.
SOUTH = ['AL', 'AR', 'FL', 'GA', 'LA', 'MS', 'NC', 'SC', 'TN', 'TX', 'VA']

# House seats by state in the 81st Congress (1940 census apportionment).
HOUSE_1940 = dict(AL=9, AZ=2, AR=7, CA=23, CO=4, CT=6, DE=1, DC=0, FL=6, GA=10, ID=2, IL=26, IN=11, IA=8, KS=6, KY=9,
                  LA=8, ME=3, MD=6, MA=14, MI=17, MN=9, MS=7, MO=13, MT=2, NE=4, NV=1, NH=2, NJ=14, NM=2, NY=45, NC=12,
                  ND=2, OH=23, OK=8, OR=4, PA=33, RI=2, SC=6, SD=2, TN=10, TX=21, UT=2, VT=1, VA=9, WA=6, WV=6, WI=10, WY=1)
assert sum(HOUSE_1940.values()) == 435, sum(HOUSE_1940.values())
assert sum(HOUSE_1940[s] for s in SOUTH) == 105

# Share of voting-age Black Southerners registered around 1947 (after Smith v. Allwright ended the white primary),
# from Southern Regional Council estimates; about 12% across the South.
BLACK_REGISTRATION = dict(AL=0.06, AR=0.17, FL=0.16, GA=0.19, LA=0.07, MS=0.02, NC=0.15, SC=0.13, TN=0.25, TX=0.19, VA=0.13)

# Regional party leaning outside the Solid South (log-odds Democratic), by state.
DIVISION_LEAN = {'NE': -0.25, 'MA': -0.05, 'ENC': -0.1, 'WNC': -0.3, 'SA': 0.1, 'ESC': 0.3, 'WSC': 0.2, 'MTN': -0.05, 'PAC': 0.05}
DIV = {'NE': ['ME', 'NH', 'VT', 'MA', 'RI', 'CT'], 'MA': ['NY', 'NJ', 'PA'], 'ENC': ['OH', 'IN', 'IL', 'MI', 'WI'],
       'WNC': ['MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS'], 'SA': ['DE', 'MD', 'DC', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL'],
       'ESC': ['KY', 'TN', 'AL', 'MS'], 'WSC': ['AR', 'LA', 'OK', 'TX'], 'MTN': ['MT', 'ID', 'WY', 'CO', 'NM', 'AZ', 'UT', 'NV'],
       'PAC': ['WA', 'OR', 'CA']}
state_lean = {}
for d, ss in DIV.items():
    for s in ss:
        state_lean[s] = 0.0 if s in SOUTH else DIVISION_LEAN[d]

def g(*pairs):
    return {k: v for k, v in pairs}

SOUTH_DIVS = {'South Atlantic': 0.5, 'East South Central': 0.45, 'West South Central': 0.55}

groups = [
  {
    "id": "labour", "label": "Organised labour",
    "description": "The AFL and the CIO: about 14 million members, a third of non-farm workers, strongest in the industrial North.",
    "membership": {"base": 1, "factors": {
        "class": {"industrial": 0.5, "labour_service": 0.25, "clerical_sales": 0.1, "professional": 0.04, "business": 0,
                  "farm_owner": 0, "farm_tenant": 0.02, "retired": 0.12},
        "settlement": {"city": 1.2, "suburb": 1.0, "rural": 0.6}},
      "regionGroups": {**SOUTH_DIVS, "West North Central": 0.8, "Mountain": 0.8, "Middle Atlantic": 1.25,
                       "East North Central": 1.25, "Pacific": 1.2, "New England": 1.1}},
    "organisation": 0.8, "party": "democratic", "partyLean": 0.8, "startApproval": 62,
    "preferences": {"budget:welfare": 1.0, "budget:education_health": 0.5, "budget:infrastructure": 0.4, "budget:defence": 0.1,
                    "tax:corporate": 0.4, "tax:income": 0.1, "tax:payroll": -0.2, "tax:excise": -0.3, "indexation": 0.6},
    "conditions": {"unemployment": -0.15, "inflation": -0.05},
    "provenance": "estimate",
    "note": "Union density about 31% of non-farm workers in 1950 (BLS). Labour backed Truman after his veto of Taft–Hartley (1947) and the 1948 campaign."
  },
  {
    "id": "big_business", "label": "Big business",
    "description": "The National Association of Manufacturers, the Chamber of Commerce and the boardrooms of the great corporations.",
    "membership": {"base": 1, "factors": {"class": {"business": 0.2, "professional": 0.04}, "settlement": {"suburb": 1.4}},
                   "defaults": {"class": 0}},
    "organisation": 0.9, "party": "republican", "partyLean": 0.6, "startApproval": 35,
    "preferences": {"tax:corporate": -1.0, "tax:income": -0.6, "budget:welfare": -0.4, "budget:defence": 0.3, "budget:foreign_aid": 0.3,
                    "tax:tariff": -0.3, "budget:general_government": -0.4, "budget:research": 0.2, "indexation": -0.5},
    "conditions": {"real_growth": 0.08, "inflation": -0.04},
    "provenance": "estimate", "note": "Few in number, great in wealth and organisation; hostile to the Fair Deal but internationalist on trade and the Marshall Plan."
  },
  {
    "id": "small_business", "label": "Small business",
    "description": "Main Street: shopkeepers, small manufacturers and contractors. Anti-tax, wary of big business and of unions.",
    "membership": {"base": 1, "factors": {"class": {"business": 0.55, "clerical_sales": 0.05}, "settlement": {"rural": 1.2, "city": 0.9}},
                   "defaults": {"class": 0}},
    "organisation": 0.4, "party": "republican", "partyLean": 0.4, "startApproval": 40,
    "preferences": {"tax:income": -0.6, "tax:corporate": -0.3, "tax:payroll": -0.5, "budget:welfare": -0.4,
                    "budget:general_government": -0.6, "tax:tariff": 0.2, "tax:excise": -0.3, "indexation": -0.6},
    "conditions": {"unemployment": -0.05, "inflation": -0.06},
    "provenance": "estimate", "note": "About four million proprietors; the backbone of the Taft wing of the Republican Party."
  },
  {
    "id": "farmers", "label": "Farmers",
    "description": "The Farm Bureau, the Grange and the Farmers Union: commercial farmers, overrepresented in Congress.",
    "membership": {"base": 1, "factors": {"class": {"farm_owner": 0.8, "farm_tenant": 0.25}}, "defaults": {"class": 0}},
    "organisation": 0.8, "party": "democratic", "partyLean": 0.1, "startApproval": 58,
    "preferences": {"budget:infrastructure": 0.5, "tax:tariff": 0.3, "tax:income": -0.3, "tax:excise": -0.2, "budget:foreign_aid": 0.2},
    "conditions": {"inflation": 0.1},
    "provenance": "estimate", "note": "Farmers swung to Truman in 1948 over grain storage and price supports. Falling farm prices (deflation) hurt them; Marshall Plan purchases of American grain helped."
  },
  {
    "id": "mic", "label": "Military-industrial complex",
    "description": "The armed services, the defence contractors and the aircraft industry: small in 1949, growing with every defence dollar.",
    "membership": {"base": 1, "factors": {"class": {"industrial": 0.05, "professional": 0.06, "business": 0.05}},
                   "defaults": {"class": 0}, "regionGroups": {"Pacific": 2.0, "New England": 1.3, "South Atlantic": 1.2}},
    "organisation": 0.6, "lockIn": {"lever": "budget:defence", "elasticity": 0.8}, "partyLean": 0, "startApproval": 55,
    "preferences": {"budget:defence": 2.0, "budget:research": 0.8, "budget:foreign_aid": 0.3},
    "conditions": {},
    "provenance": "estimate", "note": "Lock-in (GDD): membership and organisation grow with the defence budget, making later cuts harder. Eisenhower named it in his farewell address (1961)."
  },
  {
    "id": "segregationists", "label": "Southern segregationists",
    "description": "White Southerners organised to defend Jim Crow: the Dixiecrats of 1948, later the Citizens' Councils.",
    "membership": {"base": 1, "factors": {"race": {"white": 1}, "state": {s: 0.5 for s in SOUTH}}, "defaults": {"race": 0, "state": 0}},
    "organisation": 0.8, "party": "democratic", "partyLean": 0.3, "startApproval": 25,
    "preferences": {"budget:education_health": -0.5, "budget:welfare": -0.3, "budget:defence": 0.4, "tax:income": -0.2,
                    "budget:general_government": -0.4},
    "conditions": {},
    "provenance": "estimate", "note": "Strom Thurmond's States' Rights ticket carried four Deep South states in 1948 after Truman's civil rights programme. Civil rights policy arrives with the events engine."
  },
  {
    "id": "civil_rights", "label": "Civil rights movement",
    "description": "The NAACP, the Black churches and the Urban League, with labour and liberal allies.",
    "membership": {"base": 1, "factors": {"race": {"black": 0.2}, "religion": {"jewish": 3}, "class": {"professional": 2}},
                   "defaults": {"race": 0.004}},
    "organisation": 0.35, "party": "democratic", "partyLean": 0.3, "startApproval": 55,
    "preferences": {"budget:welfare": 0.6, "budget:education_health": 0.8, "budget:infrastructure": 0.2},
    "conditions": {"unemployment": -0.05},
    "provenance": "estimate", "note": "NAACP membership was several hundred thousand in the late 1940s. Truman desegregated the armed forces by executive order in July 1948."
  },
  {
    "id": "churches", "label": "Churches",
    "description": "The Catholic hierarchy and the Protestant denominations as political voices: the active, organised core of the faithful.",
    "membership": {"base": 1, "factors": {"religion": {"catholic": 0.2, "protestant": 0.12, "jewish": 0.1, "other": 0.3, "none": 0},
                                           "settlement": {"rural": 1.2}}},
    "organisation": 0.45, "partyLean": 0, "startApproval": 55,
    "preferences": {"budget:welfare": 0.4, "budget:education_health": 0.3, "budget:foreign_aid": 0.3, "tax:excise": 0.1},
    "conditions": {"unemployment": -0.03},
    "provenance": "estimate", "note": "Church membership reached about 57% of Americans in 1950 and rose through the decade."
  },
  {
    "id": "anticommunists", "label": "Anti-communists",
    "description": "A broad front from the Catholic Church and the American Legion to the China Lobby and the House Un-American Activities Committee.",
    "membership": {"base": 0.1, "factors": {"religion": {"catholic": 1.4, "protestant": 1.0, "jewish": 0.5, "none": 0.4},
                                              "class": {"business": 1.5, "farm_owner": 1.2, "professional": 0.8}}},
    "organisation": 0.5, "party": "republican", "partyLean": 0.3, "startApproval": 45,
    "preferences": {"budget:defence": 1.0, "budget:foreign_aid": 0.2, "budget:research": 0.2},
    "conditions": {},
    "provenance": "estimate", "note": "Their clout will rise with the events of 1949–50: the Hiss case, the fall of China, the Soviet bomb and McCarthy's Wheeling speech."
  },
  {
    "id": "veterans", "label": "Veterans",
    "description": "The American Legion, the VFW and AMVETS: 15 million men who served in the Second World War.",
    "membership": {"base": 1, "factors": {"sex": {"male": 1, "female": 0.02}, "age": {"0-14": 0, "15-29": 0.4, "30-44": 0.55, "45-64": 0.2, "65+": 0.05},
                                           "race": {"black": 0.8}}},
    "organisation": 0.7, "lockIn": {"lever": "budget:welfare", "elasticity": 0.3}, "partyLean": 0, "startApproval": 55,
    "preferences": {"budget:welfare": 1.0, "budget:defence": 0.5, "budget:education_health": 0.3, "indexation": 0.4},
    "conditions": {"unemployment": -0.05},
    "provenance": "estimate", "note": "About 15 million WWII and 4 million WWI veterans in 1949; the GI Bill and veterans' pensions sit in the welfare budget."
  },
  {
    "id": "isolationists", "label": "Isolationists",
    "description": "The America First tradition: Midwestern Republicans, the Chicago Tribune, German- and Irish-American communities wary of foreign entanglements.",
    "membership": {"base": 0.06, "factors": {"race": {"white": 1}, "settlement": {"rural": 1.4},
                                              "religion": {"protestant": 1.2, "catholic": 0.9, "jewish": 0.1}},
                   "defaults": {"race": 0.2},
                   "regionGroups": {"East North Central": 2.0, "West North Central": 2.5, "Mountain": 1.5, "Pacific": 0.8,
                                    "New England": 0.6, "Middle Atlantic": 0.8, "South Atlantic": 0.6, "East South Central": 0.6,
                                    "West South Central": 0.8}},
    "organisation": 0.35, "party": "republican", "partyLean": 0.5, "startApproval": 30,
    "preferences": {"budget:foreign_aid": -1.5, "budget:defence": -0.3, "tax:tariff": 0.5, "tax:income": -0.4},
    "conditions": {},
    "provenance": "estimate", "note": "Discredited by Pearl Harbor but still strong in the Midwest; they fought the Marshall Plan and NATO."
  },
  {
    "id": "intellectuals", "label": "Intellectuals",
    "description": "The universities, the press, the foundations and the professions: few, liberal and loud.",
    "membership": {"base": 1, "factors": {"class": {"professional": 0.25, "clerical_sales": 0.02, "business": 0.03},
                                           "religion": {"jewish": 2.0, "none": 1.8}, "settlement": {"city": 1.2, "suburb": 1.2, "rural": 0.5}},
                   "defaults": {"class": 0},
                   "regionGroups": {"New England": 1.5, "Middle Atlantic": 1.3, "Pacific": 1.2}},
    "organisation": 0.4, "party": "democratic", "partyLean": 0.4, "startApproval": 50,
    "preferences": {"budget:education_health": 1.0, "budget:research": 1.0, "budget:foreign_aid": 0.4, "budget:defence": -0.2,
                    "budget:welfare": 0.3},
    "conditions": {},
    "provenance": "estimate", "note": "Small numbers, outsized voice through the press and universities; targets of the loyalty programme and HUAC."
  },
  {
    "id": "radical_left", "label": "Radical left",
    "description": "In 1949 the Old Left: the Communist Party (its leaders on trial under the Smith Act), Henry Wallace's Progressives and left-led unions being purged from the CIO. Later the New Left of the SDS and Black Power radicals such as the Black Panthers.",
    "membership": {"base": 0.002, "factors": {"class": {"industrial": 2, "labour_service": 2, "professional": 2.5},
                                               "religion": {"jewish": 6, "none": 5}, "settlement": {"city": 2.5, "suburb": 0.5, "rural": 0.3},
                                               "race": {"black": 1.5}},
                   "regionGroups": {"Middle Atlantic": 2.5, "Pacific": 2.0, "South Atlantic": 0.4, "East South Central": 0.3, "West South Central": 0.3}},
    "organisation": 0.15, "partyLean": 0, "startApproval": 8,
    "preferences": {"budget:welfare": 1.0, "budget:defence": -1.0, "budget:foreign_aid": -0.6, "tax:corporate": 0.6, "tax:income": 0.2},
    "conditions": {"unemployment": -0.1},
    "provenance": "estimate", "note": "The Communist Party had about 43,000 members in 1950; Wallace won 2.4% in 1948. A fringe whose clout can swell with unrest and an unpopular war; its base shifts with the era through events."
  },
]

model = {
  "id": "usa-1949",
  "nation": "usa",
  "label": "United States, 81st Congress",
  "verification": "unchecked",
  "sources": [
    {"label": "Gallup presidential approval series (Roper Center)", "url": "https://ropercenter.cornell.edu/presidential-approval"},
    {"label": "Office of the Clerk, US House: party divisions of the House since 1789", "url": "https://history.house.gov/Institution/Party-Divisions/Party-Divisions/"},
    {"label": "US Senate: party division", "url": "https://www.senate.gov/history/partydiv.htm"},
    {"label": "Southern Regional Council, Black voter registration estimates (1947–1968)"},
    {"label": "Statistical Abstract of the United States 1952: union membership, voting, apportionment"},
    {"label": "Mueller, War, Presidents and Public Opinion (1973): approval decay and rally effects"},
    {"label": "Tufte, 'The Relationship between Seats and Votes in Two-Party Systems' (1973): swing ratio"}
  ],
  "leader": {"name": "Harry S. Truman", "party": "democratic", "faction": "northern_democrats", "termsWon": 1, "quartersInOffice": 0, "honeymoon": 0.35},
  "voting": {
    "ageShare": {"0-14": 0, "15-29": 0.6, "30-44": 1, "45-64": 1, "65+": 1},
    "franchise": {"race": {"black": BLACK_REGISTRATION, "asian": {s: 0.6 for s in STATES}}},
    "turnout": {"base": 0.58,
                "factors": {"state": {s: 0.55 for s in SOUTH},
                            "class": {"business": 1.25, "professional": 1.3, "clerical_sales": 1.1, "farm_tenant": 0.6, "labour_service": 0.8},
                            "age": {"15-29": 0.75, "65+": 0.95}}},
    "note": "Voting age 21 (60% of the 15–29 band). Poll taxes, literacy tests and white primaries kept most Black Southerners off the rolls: about 12% were registered in 1947. First-generation Asian immigrants could not naturalise until 1952. Turnout was about 51% of adults in 1948, far lower in the one-party South."
  },
  "opinion": {
    "startApproval": 69,
    "partisanWeight": 0.7,
    "partisan": {
      "race": {"black": 1.0, "hispanic": 0.8, "asian": 0.2, "native": 0.3},
      "class": {"farm_owner": -0.3, "farm_tenant": 0.2, "industrial": 0.5, "labour_service": 0.6, "clerical_sales": 0.0,
                "professional": -0.4, "business": -0.8, "retired": -0.1},
      "religion": {"protestant": -0.35, "catholic": 0.6, "jewish": 1.2, "other": -0.4, "none": 0.2},
      "settlement": {"city": 0.3, "suburb": -0.4, "rural": -0.15},
      "state": state_lean
    },
    "partisanInteractions": [
      {"when": [["race", "white"], ["state", SOUTH]], "effect": 1.6,
       "note": "The Solid South: white Southerners had voted Democratic since Reconstruction."},
      {"when": [["race", "black"], ["state", SOUTH]], "effect": -0.3,
       "note": "The few Black Southerners who could vote were less firmly Democratic than Northern Black voters: the party of Jim Crow."}
    ],
    "economy": {
      "unemployment": -0.12, "unemploymentRef": 4.5,
      "inflation": -0.08, "inflationRef": 3.0,
      "deflation": -0.05, "deflationRef": 1.0,
      "growth": 0.05,
      "memory": 0.5,
      "sensitivity": {
        "unemployment": {"class": {"industrial": 1.5, "labour_service": 1.5, "farm_owner": 0.5, "farm_tenant": 0.6, "retired": 0.5,
                                   "professional": 0.6, "business": 0.7}, "race": {"black": 1.3}},
        "inflation": {"class": {"retired": 1.6, "clerical_sales": 1.2}},
        "deflation": {"class": {"farm_owner": 3.0, "farm_tenant": 2.0}}
      }
    },
    "termDecay": 0.04,
    "honeymoon": 0.5,
    "honeymoonKeep": 0.8,
    "policies": {
      "budget:welfare": {"class": {"labour_service": 0.3, "farm_tenant": 0.2, "retired": 0.4, "industrial": 0.15, "business": -0.2}, "race": {"black": 0.2}},
      "budget:education_health": {"class": {"professional": 0.15, "clerical_sales": 0.1}, "race": {"black": 0.1}},
      "budget:infrastructure": {"settlement": {"rural": 0.15}, "class": {"farm_owner": 0.1}},
      "budget:foreign_aid": {"settlement": {"rural": -0.1}},
      "tax:income": {"class": {"business": -0.4, "professional": -0.4, "clerical_sales": -0.25, "industrial": -0.15, "farm_owner": -0.2}},
      "tax:payroll": {"class": {"industrial": -0.3, "labour_service": -0.3, "clerical_sales": -0.3}},
      "tax:excise": {"*": {"*": -0.15}},
      "tax:corporate": {"class": {"business": -0.3}},
      "indexation": {"class": {"retired": 0.2}}
    },
    "provenance": "estimate",
    "note": "Truman's Gallup approval was 69% in January 1949, after his upset re-election. Party leaning follows the New Deal coalition: Catholics, Jews, Black voters, union households and the Solid South for the Democrats; Protestants outside the South, business, farm owners and suburbanites for the Republicans. Approval falls about a point a quarter in office (Mueller's 'coalition of minorities'), with each point of unemployment above 4.5% costing about three points among exposed groups. Calibration choices, tuned so 1949–52 can reproduce Truman's slide when events (Korea, scandals) arrive."
  },
  "clout": {"wealth": 0.45, "numbers": 0.25, "organisation": 0.3},
  "interestGroups": groups,
  "legislature": {
    "label": "Congress",
    "parties": [{"id": "democratic", "label": "Democratic"}, {"id": "republican", "label": "Republican"}],
    "chambers": [{"id": "house", "label": "House", "seats": 435, "upShare": 1}, {"id": "senate", "label": "Senate", "seats": 96, "upShare": 1 / 3}],
    "coreRegions": SOUTH,
    "seatsByRegion": {"house": HOUSE_1940, "senate": {s: (0 if s == 'DC' else 2) for s in STATES}},
    "factions": [
      {"id": "southern_democrats", "label": "Southern Democrats", "party": "democratic", "base": "core",
       "description": "The Solid South's Democrats: committee chairmen by seniority, New Deal on farms and public works, implacable on segregation.",
       "seats": {"house": 103, "senate": 22},
       "groups": {"segregationists": 0.4, "farmers": 0.25, "anticommunists": 0.15, "mic": 0.1, "churches": 0.1},
       "stances": {"budget:welfare": -0.3, "budget:education_health": -0.5, "budget:defence": 0.4, "budget:infrastructure": 0.3,
                   "tax:income": -0.1, "indexation": -0.2}},
      {"id": "northern_democrats", "label": "Northern Democrats", "party": "democratic", "base": "rest",
       "description": "The New Deal coalition outside the South: big-city machines, labour liberals and the ADA.",
       "seats": {"house": 161, "senate": 32},
       "groups": {"labour": 0.4, "civil_rights": 0.15, "intellectuals": 0.15, "churches": 0.1, "veterans": 0.1, "farmers": 0.05, "radical_left": 0.05},
       "stances": {"budget:welfare": 0.3, "budget:education_health": 0.3, "budget:infrastructure": 0.2}},
      {"id": "taft_republicans", "label": "Taft Republicans", "party": "republican", "base": "rest",
       "description": "The Old Guard of 'Mr Republican', Robert A. Taft: balanced budgets, low taxes, suspicion of foreign commitments.",
       "seats": {"house": 100, "senate": 24},
       "groups": {"small_business": 0.35, "isolationists": 0.25, "big_business": 0.15, "farmers": 0.15, "anticommunists": 0.1},
       "stances": {"budget:foreign_aid": -0.8, "budget:welfare": -0.6, "tax:income": -0.6, "budget:general_government": -0.6,
                   "budget:defence": -0.1, "tax:tariff": 0.3, "indexation": -0.6}},
      {"id": "internationalist_republicans", "label": "Internationalist Republicans", "party": "republican", "base": "rest",
       "description": "The Eastern wing of Dewey and Vandenberg: bipartisan foreign policy, business-friendly, accepting much of the New Deal.",
       "seats": {"house": 71, "senate": 18},
       "groups": {"big_business": 0.4, "anticommunists": 0.2, "small_business": 0.15, "farmers": 0.15, "veterans": 0.1},
       "stances": {"budget:foreign_aid": 0.4, "budget:defence": 0.4, "tax:income": -0.4, "budget:welfare": -0.2}}
    ],
    "bills": {
      "salience": 6, "statusQuo": 1.5, "loyalty": 0.6, "opposition": 0.4, "ownFaction": 0.3,
      "approvalPull": 0.02, "groupPull": 0.015, "capitalPerPoint": 0.03, "whipUncertainty": 0.04,
      "provenance": "estimate",
      "note": "81st Congress (1949–51): House 263 Democrats, 171 Republicans, 1 American Labor (counted with the Northern Democrats); Senate 54–42. The Southern Democrat–Republican 'Conservative Coalition' blocked most of the Fair Deal (national health insurance, repeal of Taft–Hartley, civil rights) while passing housing, minimum wage and Social Security expansions. Faction splits between Taft and internationalist Republicans are estimates. Bill parameters are calibration choices: a modest Fair Deal spending increase starts below even odds; capital can carry it."
    }
  },
  "capital": {"start": 30, "max": 100, "base": 3, "approvalRate": 12, "failurePenalty": 3, "newTerm": 40,
              "note": "Political capital is a game abstraction (GDD): it regenerates with approval and is spent getting bills through Congress."},
  "elections": {
    "legislative": {"every": 2, "quarter": 4, "first": 1950},
    "executive": {"every": 4, "quarter": 4, "first": 1952, "maxTerms": 2},
    "approvalEffect": 0.013, "midtermPenalty": 0.07, "incumbency": 0.15, "swingRatio": 2.0, "noise": 0.05,
    "retireBelow": 40, "normalVote": 0.535, "electoralBonus": 2,
    "extraElectors": [{"region": "DC", "votes": 3, "from": 1964}],
    "censusYears": [1950, 1960, 1970, 1980, 1990, 2000],
    "nominees": {
      "1952": {"democratic": [{"name": "Adlai Stevenson", "party": "democratic", "faction": "northern_democrats", "appeal": 0},
                              {"name": "Estes Kefauver", "party": "democratic", "faction": "southern_democrats", "appeal": 0}],
               "republican": [{"name": "Dwight D. Eisenhower", "party": "republican", "faction": "internationalist_republicans", "appeal": 0.25},
                              {"name": "Robert A. Taft", "party": "republican", "faction": "taft_republicans", "appeal": -0.05}]},
      "1956": {"democratic": [{"name": "Adlai Stevenson", "party": "democratic", "faction": "northern_democrats", "appeal": 0},
                              {"name": "Estes Kefauver", "party": "democratic", "faction": "southern_democrats", "appeal": 0}],
               "republican": [{"name": "Dwight D. Eisenhower", "party": "republican", "faction": "internationalist_republicans", "appeal": 0.25},
                              {"name": "Richard Nixon", "party": "republican", "faction": "internationalist_republicans", "appeal": 0}]},
      "1960": {"democratic": [{"name": "John F. Kennedy", "party": "democratic", "faction": "northern_democrats", "appeal": 0.05},
                              {"name": "Lyndon B. Johnson", "party": "democratic", "faction": "southern_democrats", "appeal": 0}],
               "republican": [{"name": "Richard Nixon", "party": "republican", "faction": "internationalist_republicans", "appeal": 0},
                              {"name": "Nelson Rockefeller", "party": "republican", "faction": "internationalist_republicans", "appeal": 0}]},
      "1964": {"democratic": [{"name": "Lyndon B. Johnson", "party": "democratic", "faction": "southern_democrats", "appeal": 0.05},
                              {"name": "Hubert Humphrey", "party": "democratic", "faction": "northern_democrats", "appeal": 0}],
               "republican": [{"name": "Barry Goldwater", "party": "republican", "faction": "taft_republicans", "appeal": -0.2},
                              {"name": "Nelson Rockefeller", "party": "republican", "faction": "internationalist_republicans", "appeal": 0}]},
      "1968": {"democratic": [{"name": "Hubert Humphrey", "party": "democratic", "faction": "northern_democrats", "appeal": 0},
                              {"name": "Eugene McCarthy", "party": "democratic", "faction": "northern_democrats", "appeal": -0.05}],
               "republican": [{"name": "Richard Nixon", "party": "republican", "faction": "internationalist_republicans", "appeal": 0},
                              {"name": "Nelson Rockefeller", "party": "republican", "faction": "internationalist_republicans", "appeal": 0}]},
      "1972": {"democratic": [{"name": "George McGovern", "party": "democratic", "faction": "northern_democrats", "appeal": -0.25},
                              {"name": "Hubert Humphrey", "party": "democratic", "faction": "northern_democrats", "appeal": 0}],
               "republican": [{"name": "Richard Nixon", "party": "republican", "faction": "internationalist_republicans", "appeal": 0},
                              {"name": "Nelson Rockefeller", "party": "republican", "faction": "internationalist_republicans", "appeal": 0}]},
      "1976": {"democratic": [{"name": "Jimmy Carter", "party": "democratic", "faction": "southern_democrats", "appeal": 0},
                              {"name": "Henry M. Jackson", "party": "democratic", "faction": "northern_democrats", "appeal": 0}],
               "republican": [{"name": "Gerald Ford", "party": "republican", "faction": "internationalist_republicans", "appeal": -0.05},
                              {"name": "Ronald Reagan", "party": "republican", "faction": "taft_republicans", "appeal": 0.05}]},
      "1980": {"democratic": [{"name": "Jimmy Carter", "party": "democratic", "faction": "southern_democrats", "appeal": 0},
                              {"name": "Ted Kennedy", "party": "democratic", "faction": "northern_democrats", "appeal": 0}],
               "republican": [{"name": "Ronald Reagan", "party": "republican", "faction": "taft_republicans", "appeal": 0.1},
                              {"name": "George H. W. Bush", "party": "republican", "faction": "internationalist_republicans", "appeal": 0}]},
      "1984": {"democratic": [{"name": "Walter Mondale", "party": "democratic", "faction": "northern_democrats", "appeal": -0.1},
                              {"name": "Gary Hart", "party": "democratic", "faction": "northern_democrats", "appeal": 0}],
               "republican": [{"name": "Ronald Reagan", "party": "republican", "faction": "taft_republicans", "appeal": 0.1},
                              {"name": "George H. W. Bush", "party": "republican", "faction": "internationalist_republicans", "appeal": 0}]},
      "1988": {"democratic": [{"name": "Michael Dukakis", "party": "democratic", "faction": "northern_democrats", "appeal": -0.05},
                              {"name": "Jesse Jackson", "party": "democratic", "faction": "northern_democrats", "appeal": -0.05}],
               "republican": [{"name": "George H. W. Bush", "party": "republican", "faction": "internationalist_republicans", "appeal": 0},
                              {"name": "Bob Dole", "party": "republican", "faction": "internationalist_republicans", "appeal": 0}]},
      "1992": {"democratic": [{"name": "Bill Clinton", "party": "democratic", "faction": "southern_democrats", "appeal": 0.05},
                              {"name": "Paul Tsongas", "party": "democratic", "faction": "northern_democrats", "appeal": 0}],
               "republican": [{"name": "George H. W. Bush", "party": "republican", "faction": "internationalist_republicans", "appeal": 0},
                              {"name": "Pat Buchanan", "party": "republican", "faction": "taft_republicans", "appeal": -0.15}]},
      "1996": {"democratic": [{"name": "Bill Clinton", "party": "democratic", "faction": "southern_democrats", "appeal": 0.05},
                              {"name": "Al Gore", "party": "democratic", "faction": "southern_democrats", "appeal": 0}],
               "republican": [{"name": "Bob Dole", "party": "republican", "faction": "internationalist_republicans", "appeal": -0.05},
                              {"name": "Pat Buchanan", "party": "republican", "faction": "taft_republicans", "appeal": -0.15}]},
      "2000": {"democratic": [{"name": "Al Gore", "party": "democratic", "faction": "southern_democrats", "appeal": 0},
                              {"name": "Bill Bradley", "party": "democratic", "faction": "northern_democrats", "appeal": 0}],
               "republican": [{"name": "George W. Bush", "party": "republican", "faction": "taft_republicans", "appeal": 0},
                              {"name": "John McCain", "party": "republican", "faction": "internationalist_republicans", "appeal": 0.05}]}
    },
    "provenance": "estimate",
    "note": "House elections every two years and presidential elections every four, resolved in the fourth quarter (November). Swing ratio about 2 (Tufte): a point of vote is worth about two points of seats. Each point of presidential approval above 50% is worth about 0.3 points of vote to his party; the president's party loses about two points in midterms. The Solid South's seats only change hands if white Southerners' Democratic loyalty breaks. Nominees are the historical ones unless an eligible incumbent with at least 40% approval runs again; personal appeal values are estimates. Seats are reapportioned from the pops after each census (Huntington–Hill), effective at the next election. Alaska and Hawaii are not modelled, so the Electoral College has 531 votes (534 once DC votes from 1964)."
  }
}

json.dump(model, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
print('ok', len(groups), 'groups')
