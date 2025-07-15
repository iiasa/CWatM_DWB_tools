#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Monthly Maximum 1-Day Precipitation (RX1DAY) Computation
# Description:
#   This script computes the RX1DAY index (monthly maximum 1-day precipitation)
#   for each NetCDF file in the parent directory and stores the results in a 
#   dedicated output folder. The output represents the highest daily 
#   precipitation for each month over the input time series.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory (modify path if needed)
mkdir -p ../rx1day_month  # <- Change this path as appropriate for your project

# Define threshold value in mm (typically 1.0 mm for wet day, but unused here)
threshold=1.0  # <- Not used by eca_rx1day, kept for reference or future logic

# Loop over all .nc files in the parent directory (modify path if needed)
for file in ../*.nc; do
    # Extract base name without extension
    base=$(basename "$file" .nc)

    # Define output file path (modify if output location should differ)
    out_file="../rx1day_month/rx1day_m12_${base}.nc"  # <- Adjust path if needed

    echo "Processing $file -> $out_file"

    # Compute monthly RX1DAY (eca_rx1day,m=12):
    # - m=12 tells CDO to compute the maximum 1-day precipitation for each month
    # - Output is compressed NetCDF4 (level 9)
    cdo -f nc4c -z zip_9 eca_rx1day,m=12 "$file" "$out_file"
done
