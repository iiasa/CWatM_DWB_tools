#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Seasonal Standard Deviation of Daily Mean Temperature
# Description:
#   This script computes the seasonal standard deviation (yseasstd) of daily 
#   mean air temperature from NetCDF files using CDO.
#   The output is written in compressed NetCDF4 format.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory (modify as needed)
mkdir -p /mnt/e/Analiza/tas_1990_2014/yearmean/  # <- Change path to your output folder if required

# Set the input folder path (modify as needed)
FOLDER_PATH="/mnt/e/Analiza/tas_1990_2014"        # <- Change path to your input folder if needed

# List the contents of the input folder (for debugging/logging)
ls "$FOLDER_PATH"

# Loop over all NetCDF files in the input directory
for file in "$FOLDER_PATH"/*.nc; do
    # Extract the filename without extension
    base=$(basename "$file" .nc)
    echo "Processing: $base"

    # Define output file path (modify path if needed)
    out_file="/mnt/e/Analiza/tas_1990_2014/yearmean/yrmean_${base}.nc"  # <- Change output path or naming convention if needed

    echo "Processing $file -> $out_file"

    # Compute seasonal standard deviation using yseasstd operator
    # 'yseasstd' calculates the seasonal standard deviation for each year
    # Output is written in NetCDF4 classic format with compression
    cdo -f nc4c -z zip yseasstd "$file" "$out_file"

done