#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Simple Daily Intensity Index (SDII) Calculation
# Description:
#   This script computes the SDII index (Simple Daily Intensity Index) for 
#   all NetCDF files in the target directory. The SDII is the total precipitation 
#   on wet days divided by the number of wet days, where a wet day is defined 
#   by a precipitation threshold (usually ≥1.0 mm).
#   The CDO operator used is `eca_sdii`.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory for SDII files
mkdir -p ../sdii  # Modify path if needed

# Loop over all NetCDF (.nc) files in the parent directory
for file in ../*.nc; do
    # Extract the filename without extension
    base=$(basename "$file" .nc)

    # Define the output filename and location
    out_file="../sdii/sdii_${base}.nc"  # Modify output path if needed

    echo "Processing $file -> $out_file"

    # Compute the Simple Daily Intensity Index using CDO
    # CDO Operator: eca_sdii
    # -f nc4c: output format is NetCDF-4 classic model
    # -z zip_9: compress output file with highest compression level
    cdo -f nc4c -z zip_9 eca_sdii "$file" "$out_file"
done