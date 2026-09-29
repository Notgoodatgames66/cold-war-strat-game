# The economy model (Phase 2A)

This paper explains how the US economy is simulated, in plain English first and equations second. Every number mentioned lives in a data file, not in the code:

- Model parameters: `data/economy/models/keynesian.json`
- US 1949 accounts, budget and taxes: the `economy` block in `data/nations/usa.json`
- Budget and tax levers: `data/economy/budget-lines.json`, `data/economy/tax-lines.json`

Each figure there carries a note saying where it came from and whether it is measured or estimated.

## The idea in one paragraph

In the short run, output is whatever people, firms, government and foreigners choose to spend (Keynes). In the long run, output is limited by productive capacity ("potential"), which grows with productivity and public capital. The gap between the two drives jobs (Okun's law) and prices (the Phillips curve). The federal budget, the debt, interest rates under the Treasury peg, and gold flows under Bretton Woods are all settled every quarter.

## Units

Money is $bn at an annual rate. *Real* means constant 1949 dollars; *nominal* means current dollars. The price level starts at 1.0 in 1949.

## Calibration: why 1949 comes out exactly right

The data gives observed 1949 flows: GDP, investment, government spending, exports, imports, each tax's receipts and each outlay. Calibration then derives the hidden constants, such as autonomous consumption, the base of each tax and the import share, so the model's first quarter reproduces those figures exactly. Consumption is the residual in the national accounts identity. Nothing is tuned by hand: change a data figure and the constants follow.

## Each quarter, in order

### 1. Capacity grows

Productivity grows at the trend rate (3.2% a year). Public investment (infrastructure, research, education and health) builds a public capital stock that depreciates at 4% a year. Potential output is productivity times a public-capital effect:

```
potential = productivity × (public capital ÷ 1949 public capital) ^ 0.06
```

Doubling public capital raises potential by about 4%, slowly, over decades.

### 2. The budget moves

If **indexation** is on, every budget target rises with the economy's nominal growth: capacity growth plus last quarter's inflation. Actual spending then closes half the gap to the target each quarter (appropriation lag). Tax changes apply at once.

### 3. Spending decisions

- **Consumption** follows a blend of current disposable income and expected long-run income, which tracks potential (Friedman's permanent income). It closes half the gap each quarter.

  `desired C = autonomous + 0.75 × (½ current income + ½ long-run income)`

- **Fixed investment** is a share of potential, raised by high capacity use (the accelerator), lowered by high real interest rates and high corporate tax. It closes 30% of the gap each quarter. Investors judge real rates against *long-horizon* inflation expectations, which stay close to the 2% gold anchor.
- **Inventories**: firms aim for stocks worth 20% of a year's sales and correct a quarter of any surplus or shortfall each quarter. The 1948 stock overhang produces the 1949 inventory recession.
- **Government** is federal purchases (defence, public investment, general government) deflated by prices, plus state and local spending that grows with capacity.
- **Exports** grow with world demand (4.5% a year), plus the part of foreign aid spent on American goods (70% for the Marshall Plan).
- **Imports** are a share of last quarter's output. The share drifts up 1.3% a year as foreign industry recovers, and tariffs cut it.

### 4. Output

```
Y = C + I + inventories + G + exports − imports
```

Output cannot exceed potential by more than 6%. Demand beyond that is rationed (consumption and investment in proportion, then inventories) and appears as extra inflation instead.

### 5. Jobs and prices

- **Unemployment** (Okun's law): the natural rate (4.5%) minus half a point per 1% of output gap, with a frictional floor of 2.5%. Half the distance is closed each quarter.
- **Inflation** (expectations-augmented Phillips curve):

  ```
  inflation = expected + 0.35 × gap + bottlenecks + shortages
  expected  = 0.6 × last quarter's inflation + 0.4 × 2% anchor
  ```

  Bottlenecks add a point of inflation per point of gap beyond 3%; shortages add the rationed demand.

### 6. Interest rates (the Treasury peg)

The Fed's desired rate leans against inflation and the output gap. Under the peg it may ease in a slump but cannot rise above the 1.25% ceiling. That asymmetry is the historical peg: it held down the Treasury's borrowing costs but left the Fed unable to fight inflation, which is why the 1951 Accord happened. Ending the peg arrives with politics in Phase 3.

### 7. The federal budget

Receipts:

- **Income tax**: rate × household income base × *bracket creep*. Brackets are unindexed, so receipts grow faster than nominal income per head. This is an automatic stabiliser, and the source of "fiscal drag".
- **Corporate tax**: rate × profits, which swing three times as much as output.
- **Excise** on consumer spending, **payroll** on wages, **tariffs** on imports, plus small other receipts.

Outlays: every budget line, plus unemployment insurance (rises automatically with unemployment) and interest on the debt. The interest rate on the debt drifts towards the long-term rate as debt is refinanced. The balance changes the debt; negative debt means the government is a net lender.

### 8. Household income for next quarter

```
disposable income = GDP × (1 − business saving) − household taxes − state and local taxes + transfers + interest
```

### 9. Gold and Bretton Woods

The balance of payments is net exports + income from abroad − foreign aid − defence spent abroad − private capital outflow. Half of any deficit is settled in gold; the rest piles up as foreign-held dollars. That pile is the seed of the Triffin dilemma: it grows faster than the gold that backs it.

## What the tests check

`tests/economy.test.ts` checks, among other things, that:

- 1949 reproduces the accounts and the budget exactly.
- A $10bn defence rise gives a multiplier of roughly 1–2.5 within 18 months.
- Tax cuts raise consumption, tariffs cut imports, and corporate tax discourages investment.
- Public investment raises capacity over decades, and demand past capacity becomes inflation.
- The peg ceiling holds, and unemployment respects its floor.
- 1949–55 with no policy changes stays historically plausible.
- The model never produces impossible numbers over 52 years, even under absurd policies.

## Known gaps (to fix in later phases)

- **No private capital stock yet.** Investment raises demand but not capacity. Phase 2B's sectors add that link.
- **Gold barely drains** unless you spend heavily abroad. The real 1950s–60s drain also came from rising private investment abroad and European recovery, which later events and the Bretton Woods mechanics will add.
- **The peg is permanent** until the Accord arrives with Phase 3 politics.
- **Frozen budgets cause slow stagnation** over decades, because receipts rise with the economy while spending does not. That is realistic fiscal drag, but it means a hands-off player needs indexation on or regular tax cuts.
- **Figures are unchecked.** Many 1949 values are approximate and marked as estimates. The Monte Carlo fidelity test in Phase 4 will check the whole path against history.
