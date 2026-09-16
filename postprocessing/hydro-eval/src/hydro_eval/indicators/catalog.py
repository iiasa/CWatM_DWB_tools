# src/hydro_eval/indicators/catalog.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Literal

Window = Literal["baseline", "future", "both"]


@dataclass(frozen=True)
class IndicatorSpec:
    code: str  # e.g., "A1"
    name: str  # e.g., "Long-term Mean Flow"
    abbr: str  # e.g., "Qmean"
    category: str  # e.g., "Long-term Flow Characteristics"
    interpretation: str
    calculation: str
    window: Window  # which time window the indicator primarily uses


CATALOG: Dict[str, IndicatorSpec] = {
    "A1": IndicatorSpec(
        code="A1",
        name="Long-term Mean Flow",
        abbr="Qmean",
        category="Long-term Flow Characteristics",
        interpretation="Represents overall water availability and long-term changes in the basin’s water yield.",
        calculation="Mean of simulated daily flows over the entire 30-year simulation period.",
        window="both",
    ),
    "A2": IndicatorSpec(
        code="A2",
        name="Flow Duration Curve",
        abbr="FDC",
        category="Long-term Flow Characteristics",
        interpretation="Show the percentage of time in a year that a certain flow is equaled or exceeded.",
        calculation="Calculated from daily flows; the median curve is obtained from all annual FDCs over the period.",
        window="both",
    ),
    "A3": IndicatorSpec(
        code="A3",
        name="Monthly Time Series + Trend",
        abbr="MTS",
        category="Long-term Flow Characteristics",
        interpretation="Identifies the direction and magnitude of change (increase/decrease) over time.",
        calculation="Simple linear trend analysis applied to monthly aggregated values.",
        window="both",
    ),
    "B1": IndicatorSpec(
        code="B1",
        name="Low-flow Days",
        abbr="LFD",
        category="Drought Indicators",
        interpretation="Indicates the frequency and occurrence of drought conditions or ecological stress.",
        calculation="Annual count of days when discharge falls below the 5th percentile of the reference period.",
        window="both",
    ),
    "B2": IndicatorSpec(
        code="B2",
        name="Low-flow Period Length",
        abbr="Ldry",
        category="Drought Indicators",
        interpretation="Measures the duration and severity of continuous dry spells.",
        calculation="Average or maximum number of consecutive days with flows below the threshold per year.",
        window="both",
    ),
    "B3": IndicatorSpec(
        code="B3",
        name="Deficit Volume",
        abbr="D",
        category="Drought Indicators",
        interpretation="Quantifies the magnitude of water shortage relative to required flow levels.",
        calculation="Cumulative volume difference between the threshold and actual flow during low-flow days relative to threshold.",
        window="both",
    ),
    "C1": IndicatorSpec(
        code="C1",
        name="High-flow Days",
        abbr="HFD",
        category="Flood Indicators",
        interpretation="Describes the frequency of high-flow conditions and potential flood-prone days.",
        calculation="Annual count of days exceeding the 95th percentile of the historical reference period.",
        window="both",
    ),
    "C2": IndicatorSpec(
        code="C2",
        name="Annual Maximum Discharge",
        abbr="AMAX",
        category="Flood Indicators",
        interpretation="Indicates trends in extreme values and the potential for increased flood intensity.",
        calculation="The maximum daily discharge observed within each individual year of the simulation.",
        window="both",
    ),
    "D1": IndicatorSpec(
        code="D1",
        name="Intra-annual Flow Distribution",
        abbr="IAFD",
        category="Seasonal Regime Indicator",
        interpretation="Shows flow seasonality and shift in the timing of spring/autumn maximums.",
        calculation="Mean daily flows averaged for average year over the entire simulation period.",
        window="both",
    ),
}
