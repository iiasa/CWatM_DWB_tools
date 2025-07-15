#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Calculate Consecutive Dry Days (CDD)
# Description:
#   This script processes NetCDF files and computes the Consecutive Dry Days (CDD)
#   index using CDO's `eca_cdd` operator. The result is saved as compressed NetCDF.
#   The CDD index counts the largest number of consecutive days with daily
#   precipitation below a threshold (default 1.0 mm).
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory (modify path as needed)
mkdir -p ../cdd  # Change "../cdd" to your preferred output directory

# Loop over all NetCDF files in the specified input directory (modify path)
for file in ../*.nc; do  # Adjust "../*.nc" to your actual input folder
    # Extract base name without extension
    base=$(basename "$file" .nc)

    # Define output file path (modify as needed)
    out_file="../cdd/cdd_${base}.nc"  # Save output to "../cdd" folder

    echo "Processing $file -> $out_file"

    # Apply CDO eca_cdd operator
    # eca_cdd computes the maximum length of dry spells (days with prec < 1.0 mm)
    cdo -f nc4c -z zip_9 eca_cdd "$file" "$out_file"
done