#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute R20mm Index (Heavy Precipitation Days) from NetCDF Files
# Description:
#   This script processes all NetCDF (.nc) files in a specified directory,
#   and computes:
#     - The number of days with precipitation > 20 mm (R20mm index)
#     - The yearly sum of days exceeding 20 mm precipitation
#   Outputs are saved to a subfolder named "r20mm"
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory (modify as needed)
mkdir -p ../r20mm  # <-- Change this path to desired output location

# Loop over all NetCDF files in parent directory (modify as needed)
for file in ../*.nc; do  # <-- Adjust '../' to your actual input data folder path
    # Extract base filename (without extension)
    base=$(basename "$file" .nc)

    # Define output file paths
    out_file="../r20mm/r20mm_${base}.nc"       # <-- R20mm index file
    out_file2="../r20mm/r20mmv2_${base}.nc"    # <-- Yearly count of days > 20mm

    echo "Processing $file -> $out_file"

    # Compute R20mm index:
    # eca_pd,20 → count of days with daily precipitation > 20 mm
    cdo -f nc4c -z zip_9 eca_pd,20 "$file" "$out_file"

    # Compute yearly number of wet days > 20 mm:
    # gtc,20 → select days > 20 mm
    # yearsum → sum of selected days per year
    cdo -f nc4c -z zip_9 yearsum -gtc,20 "$file" "$out_file2"
done