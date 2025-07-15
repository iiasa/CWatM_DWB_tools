#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Calculate R99p and R99pTOT Indices from Daily Precipitation
# Description:
#   This script processes daily precipitation NetCDF files to compute:
#     - R99p: Total precipitation from days exceeding the 99th percentile (extremely wet days)
#     - R99pTOT: Contribution of R99p days to total precipitation
#   The procedure uses wet-day masking, percentile computation, and CDO-based ECA functions.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create required directories if they don't exist
mkdir -p ../wet_days              # Modify path: output folder for wet days (precip > 1 mm)
mkdir -p ../wet_days/wet_99p      # Modify path: output folder for 99th percentile files
mkdir -p ../r99p                  # Modify path: output folder for R99p index results
mkdir -p ../r99ptot               # Modify path: output folder for R99pTOT index results

# Loop through all NetCDF files in the parent directory
for file in ../*.nc; do
    base=$(basename "$file" .nc)  # Extract filename without extension

    # Define output file paths
    wet_days="../wet_days/wet_${base}.nc"                # Modify path as needed
    wet_days99p="../wet_days/wet_99p/w99p_${base}.nc"    # Modify path as needed
    r99p_days="../r99p/r99p_${base}.nc"                  # Modify path as needed
    r99ptot_days="../r99ptot/r99ptot_${base}.nc"         # Modify path as needed

    echo "🔄 Processing $file"
    echo "➡️  Wet days file: $wet_days"
    echo "➡️  99th percentile file: $wet_days99p"
    echo "➡️  R99p result file: $r99p_days"
    echo "➡️  R99ptot result file: $r99ptot_days"

    # Step 1: Create a binary mask for wet days (precip > 1 mm)
    # CDO 'gtc,1' returns 1 where value > 1 mm (wet day), 0 otherwise
    cdo gtc,1 "$file" mask.nc

    # Step 2: Apply the wet-day mask to keep only wet-day values in original data
    cdo mul "$file" mask.nc "$wet_days"
    rm mask.nc  # Clean up temporary mask file

    # Step 3: Calculate the 99th percentile of wet days
    # Uses ydaypctl with -ydaymin and -ydaymax for proper thresholding per calendar day
    cdo ydaypctl,99 "$wet_days" -ydaymin "$wet_days" -ydaymax "$wet_days" "$wet_days99p"

    # Step 4: Compute R99p index (sum of precipitation above the 99th percentile)
    cdo eca_r99p "$wet_days" "$wet_days99p" "$r99p_days"

    # Step 5: Compute R99pTOT index (percent of total precipitation from R99p days)
    cdo eca_r99ptot "$wet_days" "$wet_days99p" "$r99ptot_days"

    echo "✅ Done processing $base"
done
