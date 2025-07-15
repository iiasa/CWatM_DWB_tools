#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute R75p and R75ptot Climate Indices from Daily Precipitation Data
# Description:
#   This script processes daily precipitation NetCDF files to compute:
#     - R75p: Number of days with precipitation above the 75th percentile of wet days
#     - R75ptot: Total precipitation from R75p days, expressed as a percentage
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create required output directories (modify as needed)
mkdir -p ../wet_days             # Stores masked precipitation files (wet days only)
mkdir -p ../wet_days/wet_75p     # Stores 75th percentile threshold for wet days
mkdir -p ../r75p                 # Output: number of R75p days
mkdir -p ../r75ptot              # Output: total precipitation from R75p days

# Loop through all NetCDF files in the parent directory
for file in ../*.nc; do
    base=$(basename "$file" .nc)  # Extract file name without extension

    # Define output file paths (edit paths as needed)
    wet_days="../wet_days/wet_${base}.nc"                  # Masked wet days file
    wet_days75p="../wet_days/wet_75p/w75p_${base}.nc"      # 75th percentile threshold
    r75p_days="../r75p/r75p_${base}.nc"                    # R75p index output
    r75ptot_days="../r75ptot/r75ptot_${base}.nc"           # R75ptot output		

    echo "🔄 Processing $file"
    echo "➡️  Wet days file: $wet_days"
    echo "➡️  75th percentile file: $wet_days75p"
    echo "➡️  R75p result file: $r75p_days"
    echo "➡️  R75ptot result file: $r75ptot_days"

    # Step 1: Create binary mask where precipitation > 1 mm (wet days)
    # gtc = greater than constant (gtc,1): sets cells with value > 1 to 1, rest to 0
    cdo gtc,1 "$file" mask.nc

    # Step 2: Multiply original data by mask to zero out dry days
    # This ensures only wet days are retained for percentile analysis
    cdo mul "$file" mask.nc "$wet_days"
    rm mask.nc  # Remove temporary mask

    # Step 3: Calculate 75th percentile from wet days data (for each calendar day)
    # ydaypctl,75 = computes 75th percentile using daily min/max range
    cdo ydaypctl,75 "$wet_days" -ydaymin "$wet_days" -ydaymax "$wet_days" "$wet_days75p"

    # Step 4: Compute R75p – number of wet days with precipitation above 75th percentile
    cdo eca_r75p "$wet_days" "$wet_days75p" "$r75p_days"

    # Step 5: Compute R75ptot – contribution of R75p days to total annual precipitation
    cdo eca_r75ptot "$wet_days" "$wet_days75p" "$r75ptot_days"

    echo "✅ Done processing $base"
done