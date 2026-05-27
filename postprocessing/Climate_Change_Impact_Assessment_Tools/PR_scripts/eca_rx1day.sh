#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute RX1DAY Index (Annual Maximum 1-Day Precipitation)
# Description:
#   This script processes daily precipitation NetCDF files to compute the RX1DAY
#   index using the CDO command `eca_rx1day`. It calculates the highest 1-day 
#   precipitation value per year for each grid cell.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory for RX1DAY results
mkdir -p ../rx1day  # [Modify path as needed]

# Define threshold (optional, not used directly by eca_rx1day, just informative)
threshold=1.0  # mm – standard wet-day threshold used in other indices

# Loop over all NetCDF files in the source directory
for file in ../InitialData/*.nc; do  # [Modify source path if needed]

    # Extract base name from filename (remove path and extension)
    base=$(basename "$file" .nc)

    # Define output filename and path
    out_file="../rx1day/rx1day_${base}.nc"  # [Modify output path if needed]

    echo "Processing $file -> $out_file"

    # Run the CDO command to compute RX1DAY:
    # - eca_rx1day: computes the maximum 1-day precipitation for each year
    # - -f nc4c: output in NetCDF4 classic format
    # - -z zip_9: compress output with level 9
    cdo -f nc4c -z zip_9 eca_rx1day "$file" "$out_file"
done