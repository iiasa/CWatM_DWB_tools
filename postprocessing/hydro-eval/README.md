# HydroEval

Hydrological evaluation toolkit for analysing discharge simulations from hydrological models, especially **CWatM**.

The tool computes a set of hydrological indicators describing long-term flow characteristics, drought conditions, flood potential and seasonal flow regimes.

It is designed to:

- evaluate **baseline vs future scenarios**
- work with **multiple datasets / initiatives**
- support **multiple stations**
- produce **tables and figures suitable for reports**

---

# Key Features

- Command line interface
- Flexible configuration via `config.toml`
- Automatic discovery of datasets and experiments
- Station-wise or full dataset evaluation
- Modular indicator framework
- Reproducible outputs (CSV + figures)
- Clean logging

---

# Indicators

The following indicators are currently implemented.

## Long-term Flow Characteristics

| Indicator | Name                        | Description                                     |
| --------- | --------------------------- | ----------------------------------------------- |
| **A1**    | Long-term Mean Flow         | Mean daily discharge over the evaluation period |
| **A2**    | Flow Duration Curve         | Flow exceedance statistics                      |
| **A3**    | Monthly Time Series + Trend | Long-term trend of monthly discharge            |

## Drought Indicators

| Indicator | Name                   | Description                                            |
| --------- | ---------------------- | ------------------------------------------------------ |
| **B1**    | Low-flow Days          | Annual number of days below Q05 reference threshold    |
| **B2**    | Low-flow Period Length | Duration of dry spells                                 |
| **B3**    | Deficit Volume         | Cumulative discharge deficit relative to Q05 threshold |

## Flood Indicators

| Indicator | Name                     | Description                                         |
| --------- | ------------------------ | --------------------------------------------------- |
| **C1**    | High-flow Days           | Annual number of days above Q95 reference threshold |
| **C2**    | Annual Maximum Discharge | Maximum daily discharge per year                    |

## Seasonal Regime Indicator

| Indicator | Name                           | Description                     |
| --------- | ------------------------------ | ------------------------------- |
| **D1**    | Intra-annual Flow Distribution | Average annual discharge regime |

---

# Installation

Clone the repository and install the package.

```bash
git clone https://github.com/roPeCZ/hydro-eval.git
cd hydro-eval
pip install -e .
```

---

# Main Project Structure

The tool expects the folloing folder layout and naming.

```
hydro_eval/
│
├─ src/hydro_eval/
│  │
│  ├─ cli.py
│  ├─ core/
│  │   ├─ comparison.py
│  │   ├─ context.py
│  │   ├─ plotting.py
│  │   ├─ stats.py
│  │   ├─ hydrology.py
│  │   └─ timewindow.py
│  │
│  ├─ io/
│  │   ├─ discovery.py
│  │   ├─ loader.py
│  │   └─ reader.py
│  │
│  └─ indicators/
│      ├─ A1_qmean.py
│      ├─ A2_fdc.py
│      ├─ A3_trend.py
│      ├─ B1_lfd.py
│      ├─ B2_spells.py
│      ├─ B3_deficit.py
│      ├─ C1_hfd.py
│      ├─ C2_amax.py
│      └─ D1_regime.py
│
├─ data/
│  │
│  ├─ isimip3b/
│  │    ├─ historical/
│  │    │   └─ discharge_daily.csv
│  │    │
│  │    ├─ ssp245/
│  │    │   └─ discharge_daily.csv
│  │    │
│  │    └─ ssp585/
│  │        └─ discharge_daily.csv
│  └─ restore4life/
│       ├─ historical/
│       │   └─ discharge_daily.csv
│       │
│       ├─ ssp245/
│       │   └─ discharge_daily.csv
│       │
│       └─ ssp585/
│           └─ discharge_daily.csv
├─ outputs/
│   └─ core/
│       ├─ figures/
│       ├─ tables/
│       └─ logs/
├─ config.toml
└─ README.md
```

Each CSV data file must contain a date column and station columns (raw TSS output from CWatM should be okay):

```
date,G1,G2,G3,...
1990-01-01,12.5,9.8
1990-01-02,13.1,10.4
```

---

# Configuration

All run settings are defined in `config.toml`.

Example:

```
project_name = "basin_climate_eval"

data_root = "data"
output_root = "outputs"

reference_experiment = "historical"

[periods.baseline]
name = "baseline"
start = "1990-01-01"
end = "2014-12-31"

[periods.future]
name = "future"
start = "2031-01-01"
end = "2060-12-31"

[indicators]

A1 = true
A2 = true
A3 = true

B1 = true
B2 = true
B3 = true

C1 = true
C2 = true

D1 = true

[indicators_params.B2]
min_event_days = 3
```

---

# CLI Usage

List available stations:

```
hydro-eval list-stations
```

Run all indicators:

```
hydro-eval run
```

Run analysis for a single station:

```
hydro-eval run --station G7
```

Run a single indicator:

```
hydro-eval run --only B1
```

Dry-run (test pipeline without writing outputs):

```
hydro-eval run --dry-run
```

---

# Methodological Notes

## Threshold indicators

Low-flow and high-flow thresholds are derived from the baseline reference period.

```
Q05 → drought threshold
Q95 → flood threshold
```

These thresholds are then applied to all evaluation periods.

## Flow Regime

The intra-annual flow regime (D1) is computed as a mean daily hydrograph representing an average years. Lead day (29th February) is removed to maintain a consistent 365-day cycle.

---

# Extending the Tool

New indicators can be added in:

```
src/hydro_eval/indicators/
```

Each indicator must implement a class with: `run(view, ctx)` and return an `IndicatorResult` class object.

---

# License

MIT License
