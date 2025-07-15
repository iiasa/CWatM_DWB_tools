#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Calculate Maximum 5-Day Precipitation (Rx5day) Index
# Description:
#   This script computes the Rx5day index for each NetCDF file in the parent
#   directory using the Climate Data Operators (CDO) tool. The Rx5day index
#   identifies the highest 5-day total precipitation amount within each year.
#   Results are saved in a dedicated output directory.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory (edit the path as needed)
mkdir -p ../rx5day  # <- MODIFY this path if needed

# Loop over all NetCDF files in the parent directory
for file in ../*.nc; do
    # Get base filename without extension
    base=$(basename "$file" .nc)

    # Define output file path
    out_file="../rx5day/rx5d_${base}.nc"  # <- MODIFY if you want a different output location or naming

    echo "Processing $file -> $out_file"

    # Compute the Rx5day index:
    # 'eca_rx5day' computes the annual maximum 5-day precipitation total.
    # '-f nc4c' specifies NetCDF-4 classic format; '-z zip_9' applies maximum compression.
    cdo -f nc4c -z zip_9 eca_rx5day "$file" "$out_file"
done