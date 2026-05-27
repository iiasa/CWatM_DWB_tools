#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute Annual Standard Deviation of Daily Air Temperature
# Description:
#   This script calculates the yearly standard deviation (`yearstd`) of daily 
#   air temperature data from NetCDF files using the Climate Data Operators (CDO) tool.
#   Results are stored in compressed NetCDF-4 format.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory (modify path as needed)
mkdir -p /mnt/e/Analiza/tas_1990_2014/yearstd/

# Define input folder containing daily air temperature .nc files (modify path)
FOLDER_PATH="/mnt/e/Analiza/tas_1990_2014"

# Display files in folder
ls "$FOLDER_PATH"

# Loop over all NetCDF files in the directory
for file in "$FOLDER_PATH"/*.nc; do
    # Extract filename without the extension
    base=$(basename "$file" .nc)
    echo "Processing: $base"
    
    # Define output file path and name (modify path if needed)
    out_file="/mnt/e/Analiza/tas_1990_2014/yearstd/yearstd_${base}.nc"
    echo "Processing $file -> $out_file"

    # Compute yearly standard deviation using CDO:
    # - `yearstd`: calculates standard deviation for each year
    # - `timmean`: added before `yearstd` here incorrectly; should be removed unless averaging is intended
    # - `-f nc4c`: output format is NetCDF-4 classic model
    # - `-z zip`: applies compression
    cdo -f nc4c -z zip yearstd "$file" "$out_file"
done