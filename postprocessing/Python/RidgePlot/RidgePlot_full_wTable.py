"""
README
------
This script reads a semicolon-separated CSV file containing daily runoff time series
for multiple scenarios, cleans and converts the data, and calculates long-term mean
daily runoff statistics.

Main outputs:
- A CSV file with summary statistics for each scenario:
    - Center of Volume (CoV)
    - Peak Date
    - Maximum runoff
    - Total annual runoff
- A line plot showing the smoothed mean daily runoff regimes together with a summary table
- A ridge plot highlighting seasonal shifts in runoff patterns between scenarios

Notes:
- The first column of the input CSV is assumed to be the date column in YYYY.MM.DD format
- Runoff values are converted from meters (m) to millimeters (mm)
- A rolling mean is applied for smoother visualization

Required Python packages:
pandas, matplotlib, seaborn, numpy
"""

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os

# --- SETTINGS ---
# INPUT: Path to your CSV file
FILE_PATH = r"D:\DRBWBM\MODEL\CC_anal\Evaluation\runoff_ridge_plot\EARTH_runoff_RP_noWD2.csv"

# OUTPUTS: Where to save the images and the stats CSV
OUTPUT_IMAGE_RIDGE = r"D:\DRBWBM\MODEL\CC_anal\Evaluation\runoff_ridge_plot\runoff_EARTH_RP_noWD2.png"
OUTPUT_IMAGE_LINE = r"D:\DRBWBM\MODEL\CC_anal\Evaluation\runoff_ridge_plot\runoff_EARTH_RP_lines_noWD2.png"
OUTPUT_STATS_CSV = r"D:\DRBWBM\MODEL\CC_anal\Evaluation\runoff_ridge_plot\runoff_EARTH_RP_stat_noWD2.csv"

# Smoothing window (in days) - higher value = smoother lines
ROLLING_WINDOW = 10


def convert_day_to_date(day_of_year):
    """Helper: Converts Day of Year (1-365) to 'Month Day' string (e.g., 'Apr 15')."""
    try:
        return (pd.Timestamp('2021-01-01') + pd.Timedelta(days=int(day_of_year) - 1)).strftime('%b %d')
    except:
        return "N/A"


def create_analysis_and_plots(file_path):
    print("--- 1. READING AND CLEANING DATA ---")

    # Read CSV (handling semicolon separator)
    try:
        df = pd.read_csv(file_path, sep=';', skipinitialspace=True, low_memory=False)
    except FileNotFoundError:
        print(f"ERROR: File not found: {file_path}")
        return

    # Drop empty columns (often caused by trailing semicolons in CSV)
    df.dropna(axis=1, how='all', inplace=True)

    # Handle Date Column (Assume first column is Date)
    date_col_name = df.columns[0]
    df[date_col_name] = pd.to_datetime(df[date_col_name], format='%Y.%m.%d', errors='coerce')
    df.dropna(subset=[date_col_name], inplace=True)
    df.set_index(date_col_name, inplace=True)

    # Convert all data to numeric (coercing errors to NaN)
    df = df.apply(pd.to_numeric, errors='coerce')

    # Convert units: Meters (m) -> Millimeters (mm)
    df = df * 1000

    print(f"Data loaded successfully. Period: {df.index.min().date()} - {df.index.max().date()}")

    # --- 2. CALCULATING STATISTICS ---
    print("\n--- 2. CALCULATING STATISTICS ---")

    # Calculate long-term daily averages (Day 1 to 365)
    daily_avg_raw = df.groupby(df.index.dayofyear).mean()
    daily_avg_raw = daily_avg_raw.loc[1:365]

    stats_results = []

    for col in daily_avg_raw.columns:
        if daily_avg_raw[col].isna().all(): continue

        data = daily_avg_raw[col]

        # Find Peak
        peak_day = data.idxmax()
        peak_value = data.max()
        total_volume = np.sum(data.values)

        # Calculate Center of Volume (CoV)
        if total_volume == 0:
            cov = 0
        else:
            weighted_sum = np.sum(data.index * data.values)
            cov = weighted_sum / total_volume

        stats_results.append({
            "Scenario": col,
            "CoV (Day)": round(cov, 1),
            "Peak Date": convert_day_to_date(peak_day),
            "Max (mm)": round(peak_value, 2),
            "Total (mm)": int(round(total_volume, 0))
        })

    stats_df = pd.DataFrame(stats_results)

    # Save statistics to CSV
    try:
        stats_df.to_csv(OUTPUT_STATS_CSV, index=False, sep=';')
        print(f"Statistics saved to: {OUTPUT_STATS_CSV}")
    except Exception as e:
        print(f"Error saving CSV: {e}")

    # --- PREPARE DATA FOR PLOTTING ---
    # Apply rolling mean for smoother visualization
    daily_avg_smooth = daily_avg_raw.rolling(window=ROLLING_WINDOW, center=True, min_periods=1).mean()
    scenarios = list(daily_avg_smooth.columns)

    # Axis settings
    month_starts = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]
    month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    palette = sns.color_palette("viridis", len(scenarios))

    # --- 3. PLOT A: SUPERIMPOSED LINES WITH AUTO-SIZED TABLE ---
    print("\n--- 3. GENERATING LINE PLOT WITH TABLE ---")

    # Slightly wider figure to accommodate the table
    fig1, ax1 = plt.subplots(figsize=(13, 8))

    for i, col in enumerate(scenarios):
        if daily_avg_smooth[col].isna().all(): continue
        ax1.plot(daily_avg_smooth.index, daily_avg_smooth[col],
                 label=col, color=palette[i], linewidth=2.5)

    # --- CALCULATE COLUMN WIDTHS BASED ON CONTENT ---
    # 1. Determine max character length for each column (Header vs. Data)
    col_widths = []
    for col in stats_df.columns:
        len_header = len(str(col))
        len_data = stats_df[col].astype(str).map(len).max()
        max_len = max(len_header, len_data)
        col_widths.append(max_len)

    # 2. Normalize widths to fit a specific portion of the plot
    # The table will take up 55% (0.55) of the plot's total width
    total_table_width_ratio = 0.55
    total_chars = sum(col_widths)
    final_col_widths = [(w / total_chars) * total_table_width_ratio for w in col_widths]

    # --- INSERT TABLE ---
    cell_text = []
    for row in range(len(stats_df)):
        cell_text.append(stats_df.iloc[row].values)

    the_table = ax1.table(cellText=cell_text,
                          colLabels=stats_df.columns,
                          colWidths=final_col_widths,  # Using the calculated widths
                          loc='upper right',
                          cellLoc='center',
                          # bbox=[x, y, width, height]
                          bbox=[0.45, 0.75, total_table_width_ratio, 0.25])

    the_table.auto_set_font_size(False)
    the_table.set_fontsize(9)
    the_table.scale(1, 1.3)  # Increase row height

    # --- LEGEND ---
    # Placed below the X-axis, centered horizontally
    ax1.legend(loc='upper center', bbox_to_anchor=(0.5, -0.06),
               fancybox=True, shadow=False, ncol=len(scenarios), fontsize=10)

    # Labels and Grid
    ax1.set_title("Mean Daily Runoff Regime & Statistics", fontsize=14, pad=20)
    ax1.set_ylabel("Runoff (mm)", fontsize=12)
    #ax1.set_xlabel("Month", fontsize=12)
    ax1.set_xlim(1, 365)
    ax1.set_xticks(month_starts)
    ax1.set_xticklabels(month_names)
    ax1.grid(True, which='both', linestyle='--', alpha=0.5)

    # Adjust layout to fit the bottom legend
    plt.subplots_adjust(bottom=0.15)

    plt.savefig(OUTPUT_IMAGE_LINE, dpi=300, bbox_inches='tight')
    print(f"Line plot saved to: {OUTPUT_IMAGE_LINE}")
    plt.close(fig1)

    # --- 4. PLOT B: RIDGE PLOT (Seasonal Shift) ---
    print("\n--- 4. GENERATING RIDGE PLOT ---")

    sns.set_theme(style="white", rc={"axes.facecolor": (0, 0, 0, 0)})
    fig2, ax2 = plt.subplots(figsize=(10, 8))

    y_max = daily_avg_smooth.max().max()
    offset_step = y_max * 0.4

    for i, col in enumerate(scenarios):
        if daily_avg_smooth[col].isna().all(): continue

        y_data = daily_avg_smooth[col].values
        x_data = daily_avg_smooth.index

        # Logic: First column (History) goes to the top
        offset = (len(scenarios) - 1 - i) * offset_step
        z_ord = (len(scenarios) - i) * 10

        ax2.plot(x_data, y_data + offset, color=palette[i], lw=2, zorder=z_ord + 1)
        ax2.fill_between(x_data, offset, y_data + offset, color=palette[i], alpha=0.6, zorder=z_ord)

        # Label next to the curve
        ax2.text(0, offset + (y_max * 0.15), col,
                 fontweight="bold", color=palette[i], ha="right", va="center", fontsize=11,
                 transform=ax2.get_yaxis_transform())

    ax2.set_yticks([])
    ax2.yaxis.set_label_coords(-0.05, 0.6)
    ax2.set_ylabel("Runoff (mm) + Offset", fontsize=12, loc='top')
    ax2.set_title("Seasonal Runoff Shift (Ridge Plot)", fontsize=16, pad=20)
    ax2.set_xlim(1, 365)
    ax2.set_xticks(month_starts)
    ax2.set_xticklabels(month_names)

    sns.despine(left=True, bottom=False)

    plt.tight_layout()
    plt.savefig(OUTPUT_IMAGE_RIDGE, dpi=300)
    print(f"Ridge plot saved to: {OUTPUT_IMAGE_RIDGE}")
    plt.show()


# --- EXECUTION ---
if __name__ == "__main__":
    create_analysis_and_plots(FILE_PATH)