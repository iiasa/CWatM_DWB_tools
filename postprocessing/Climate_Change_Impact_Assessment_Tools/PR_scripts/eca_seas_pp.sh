#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Seasonal Total Precipitation Calculation
# Description:
#   This script calculates the seasonal sum of precipitation (seassum) for 
#   each NetCDF file in the parent directory. Output files are compressed 
#   and stored in a separate folder.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory for seasonal precipitation
mkdir -p ../seas_pp  # Modify this path if output folder should be placed elsewhere

# Loop over all NetCDF files in the parent directory
for file in ../*.nc; do
    # Extract base filename without extension
    base=$(basename "$file" .nc)

    # Define output file name and path
    out_file="../seas_pp/seaspp_${base}.nc"  # Modify "../seas_pp/" as needed

    echo "Processing $file -> $out_file"

    # Calculate seasonal sum of precipitation
    # seassum computes total precipitation over meteorological seasons (DJF, MAM, JJA, SON)
    # -f nc4c specifies NetCDF-4 classic format
    # -z zip_9 applies maximum compression
    cdo -f nc4c -z zip_9 seassum "$file" "$out_file"
done