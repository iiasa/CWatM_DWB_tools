#!/bin/bash
# ------------------------------------------------------------------------------
# Title: R90p and R90pTOT Calculation from Daily Precipitation
# Description:
#   Computes the number of very wet days (R90p) and the percentage of precipitation
#   due to very wet days (R90pTOT) from daily precipitation data.
#   It follows the ETCCDI CDO indices:
#     - R90p: days exceeding the 90th percentile of wet days
#     - R90pTOT: percentage of total wet-day precipitation from R90p days
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create required output directories (modify paths as needed)
mkdir -p ../wet_days               # Directory for masked wet days
mkdir -p ../wet_days/wet_90p       # Directory for 90th percentile values
mkdir -p ../r90p                   # Output for R90p index
mkdir -p ../r90ptot                # Output for R90pTOT index

# Loop through all NetCDF files in the parent directory (modify path if needed)
for file in ../*.nc; do
    base=$(basename "$file" .nc)  # Get base filename without extension

    # Define output file paths
    wet_days="../wet_days/wet_${base}.nc"               # Masked wet days (> 1 mm)
    wet_days90p="../wet_days/wet_90p/w90p_${base}.nc"   # 90th percentile of wet days
    r90p_days="../r90p/r90p_${base}.nc"                 # Output R90p file
    r90ptot_days="../r90ptot/r90ptot_${base}.nc"        # Output R90pTOT file

    echo "🔄 Processing $file"
    echo "➡️  Wet days file: $wet_days"
    echo "➡️  90th percentile file: $wet_days90p"
    echo "➡️  R90p result file: $r90p_days"

    # Step 1: Generate mask of wet days (precipitation > 1 mm)
    # gtc = greater than constant. This creates a binary mask of wet days
    cdo gtc,1 "$file" mask.nc

    # Step 2: Apply mask to retain only wet days; dry days become zero
    # mul = element-wise multiplication
    cdo mul "$file" mask.nc "$wet_days"
    rm mask.nc  # Clean up temporary mask

    # Step 3: Compute the 90th percentile of wet days for each calendar day
    # ydaypctl = daily percentile with reference period from ydaymin/ydaymax
    cdo ydaypctl,90 "$wet_days" -ydaymin "$wet_days" -ydaymax "$wet_days" "$wet_days90p"

    # Step 4: Compute R90p (count of days > 90th percentile for wet days)
    cdo eca_r90p "$wet_days" "$wet_days90p" "$r90p_days"

    # Step 5: Compute R90pTOT (total % of precip from very wet days)
    cdo eca_r90ptot "$wet_days" "$wet_days90p" "$r90ptot_days"

    echo "✅ Done processing $base"
done