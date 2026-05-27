#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute Annual Mean Air Temperature Using CDO
# Description:
#   This script loops through daily NetCDF files and computes the annual (yearly)
#   mean air temperature using the Climate Data Operators (CDO) `timmean` function.
#   Output is saved in NetCDF-4 compressed format.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory for annual mean files
mkdir -p /mnt/e/Analiza/tas_1990_2014/yearmean/  # <-- Modify this path as needed

# Define input directory containing daily temperature files
FOLDER_PATH="/mnt/e/Analiza/tas_1990_2014"        # <-- Modify this path as needed

# List all NetCDF files in the folder
ls "$FOLDER_PATH"

# Loop over each .nc file in the input directory
for file in "$FOLDER_PATH"/*.nc; do
    # Extract the base filename (without path and extension)
    base=$(basename "$file" .nc)
    echo "Processing: $base"

    # Define output file path
    out_file="/mnt/e/Analiza/tas_1990_2014/yearmean/yrmean_${base}.nc"  # <-- Modify if structure changes

    echo "Processing $file -> $out_file"

    # Compute annual mean using CDO's timmean (time mean) operator
    # -f nc4c : Output format NetCDF-4 classic model
    # -z zip  : Apply compression to reduce file size
    cdo -f nc4c -z zip timmean "$file" "$out_file"
done