#!/bin/bash
# ------------------------------------------------------------------------------
# Title: R95p and R95ptot Index Calculation for Very Wet Days
# Description:
#   This script calculates:
#     - R95p: Number of very wet days (daily precipitation > 95th percentile of wet days)
#     - R95ptot: Fraction of total precipitation from R95p days
#   The calculation is based on ISIMIP NetCDF daily precipitation datasets.
#   Only wet days (precip > 1mm) are considered in percentile computation.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create necessary output directories
mkdir -p ../wet_days                  # Stores masked files with only wet days
mkdir -p ../wet_days/wet_95p          # Stores daily 95th percentile values from wet days
mkdir -p ../r95p                      # Stores R95p index outputs
mkdir -p ../r95ptot                   # Stores R95ptot outputs

# Modify the path to the folder containing your NetCDF input files (*.nc)
for file in ../*.nc; do
    base=$(basename "$file" .nc)  # Extract filename without extension

    # Define intermediate and output filenames
    wet_days="../wet_days/wet_${base}.nc"                  # Output for masked wet days
    wet_days95p="../wet_days/wet_95p/w95p_${base}.nc"      # Daily 95th percentiles
    r95p_days="../r95p/r95p_${base}.nc"                    # Output for R95p index
    r95ptot_days="../r95ptot/r95ptot_${base}.nc"           # Output for R95ptot index

    echo "🔄 Processing $file"
    echo "➡️  Wet days file: $wet_days"
    echo "➡️  95th percentile file: $wet_days95p"
    echo "➡️  R95p result file: $r95p_days"
    echo "➡️  R95ptot result file: $r95ptot_days"

    # Step 1: Create mask where precipitation > 1 mm (wet days)
    cdo gtc,1 "$file" mask.nc  # gtc = greater than constant

    # Step 2: Apply the mask to isolate only wet days (others become 0)
    cdo mul "$file" mask.nc "$wet_days"
    rm mask.nc  # Clean up temporary mask file

    # Step 3: Compute the 95th percentile of daily values from wet days
    # Requires: ydaymin, ydaymax = daily min/max across years for percentile bounds
    cdo ydaypctl,95 "$wet_days" -ydaymin "$wet_days" -ydaymax "$wet_days" "$wet_days95p"

    # Step 4: Calculate R95p - Number of days exceeding 95th percentile
    cdo eca_r95p "$wet_days" "$wet_days95p" "$r95p_days"

    # Step 5: Calculate R95ptot - Contribution of R95p days to total rainfall
    cdo eca_r95ptot "$wet_days" "$wet_days95p" "$r95ptot_days"

    echo "✅ Done processing $base"
done