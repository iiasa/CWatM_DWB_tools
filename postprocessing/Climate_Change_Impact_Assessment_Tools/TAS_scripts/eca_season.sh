#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute Seasonal Mean Air Temperature from Daily NetCDF Files
# Description:
#   This script calculates seasonal means (DJF, MAM, JJA, SON) from daily 
#   air temperature data (tas) using the `seasmean` operator from CDO.
#   It processes each NetCDF file in the input directory and saves the output 
#   to a dedicated subdirectory.
#   Output files are compressed NetCDF4 format (.nc).
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory if it doesn't exist
mkdir -p /mnt/e/Analiza/tas_1990_2014/seasonal/  # Modify path as needed

# Define the folder containing daily NetCDF tas files
FOLDER_PATH="/mnt/e/Analiza/tas_1990_2014"       # Modify path as needed

# Optional: List files in the folder (for logging/debugging)
ls "$FOLDER_PATH"

# Loop over all .nc files in the folder
for file in "$FOLDER_PATH"/*.nc; do
    # Extract base filename (without extension)
    base=$(basename "$file" .nc)
    echo "Processing: $base"

    # Define the output file path
    out_file="/mnt/e/Analiza/tas_1990_2014/seasonal/seasonal_${base}.nc"  # Modify path as needed

    echo "Processing $file -> $out_file"

    # Compute seasonal mean using CDO
    # seasmean: Computes mean for each climatological season (DJF, MAM, JJA, SON)
    # -f nc4c: NetCDF-4 classic format
    # -z zip: Enable compression
    cdo -f nc4c -z zip seasmean "$file" "$out_file"
done
