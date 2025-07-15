#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute 90th Percentile of Daily Mean Temperature (TG) Using CDO
# Description:
#   This script processes NetCDF files containing daily mean temperature (TG)
#   and computes the 90th percentile (TG90p) for each calendar day.
#   It uses the CDO operators `ydaypctl`, `ydaymin`, and `ydaymax` to generate
#   a daily climatology-based threshold dataset.
#
#   Output is stored in a separate folder with filenames prefixed by tg_perc90_.
#
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Define the input folder containing .nc files
FOLDER_PATH="/mnt/e/Analiza/tas_1990_2014"  # <-- Modify this path as needed

# List contents for verification
ls "$FOLDER_PATH"
echo $(ls "$FOLDER_PATH")

# Loop over all NetCDF files in the folder
for file in "$FOLDER_PATH"/*.nc; do
    # Extract the filename without extension
    base=$(basename "$file" .nc)
    echo "Processing: $base"

    # Define the output file path
    out_file="/mnt/e/Analiza/tas_1990_2014/tg_perc90/tg_perc90_${base}.nc"  # <-- Modify path if needed

    echo "Processing $file -> $out_file"

    # Use CDO to compute the 90th percentile for each calendar day:
    # ydaypctl,N infile clim_min clim_max outfile
    #
    # - ydaypctl,90: 90th percentile for each calendar day across years
    # - -ydaymin: daily minimum values (climatology lower bound)
    # - -ydaymax: daily maximum values (climatology upper bound)
    #
    # Output is compressed NetCDF4 with zip compression
    cdo -f nc4c -z zip ydaypctl,90 "$file" -ydaymin "$file" -ydaymax "$file" "$out_file"
done