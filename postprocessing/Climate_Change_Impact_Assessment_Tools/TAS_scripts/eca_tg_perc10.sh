#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute 10th Percentile of Daily Mean Temperature (TG) Using CDO
# Description:
#   This script calculates the 10th percentile of daily mean temperature
#   from multiple NetCDF files using the CDO `ydaypctl` operator. It processes
#   each file, computes the climatological daily 10th percentile across years,
#   and stores the output in a separate directory.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Define input directory (modify this path to your own directory location)
FOLDER_PATH="/mnt/e/Analiza/tas_1990_2014"

# Optional: list the files in the directory for verification
ls "$FOLDER_PATH"
echo $(ls "$FOLDER_PATH")

# Loop over each NetCDF (.nc) file in the folder
for file in "$FOLDER_PATH"/*.nc; do
    # Extract filename without extension (e.g., model name or source)
    base=$(basename "$file" .nc)
    echo "Processing: $base"

    # Define output file path (modify this path as needed)
    out_file="/mnt/e/Analiza/tas_1990_2014/tg_perc10/tg_perc10_${base}.nc"

    echo "Processing $file -> $out_file"

    # Compute the daily 10th percentile across all years in the dataset
    # `ydaypctl,10` calculates the 10th percentile for each day-of-year
    # Requires min and max range for correct quantile estimation
    # Output is written in NetCDF4 compressed format (-f nc4c -z zip)
    cdo -f nc4c -z zip ydaypctl,10 "$file" -ydaymin "$file" -ydaymax "$file" "$out_file"

done