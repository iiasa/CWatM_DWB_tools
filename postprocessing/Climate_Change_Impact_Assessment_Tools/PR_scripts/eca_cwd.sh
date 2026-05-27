#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute Consecutive Wet Days (CWD) Index
# Description:
#   This script computes the Consecutive Wet Days (CWD) index for all NetCDF files
#   in a specified directory using the CDO function `eca_cwd`. It stores results
#   in a subfolder named `cwd` relative to the input file directory.
#   CWD counts the maximum number of consecutive days with daily precipitation ≥ 1 mm.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory (modify path as needed)
mkdir -p ../cwd  # <- Change this if your output path is different

# Optional: Set precipitation threshold (default for `eca_cwd` is 1.0 mm)
# You can set a different threshold using the -setrtomiss or -expr options if needed.

# Loop through all NetCDF (.nc) files in the parent directory (modify path if needed)
for file in ../*.nc; do
    # Extract the filename without extension
    base=$(basename "$file" .nc)

    # Define output file path (stored in ../cwd/)
    out_file="../cwd/cwd_${base}.nc"  # <- Change this if you want a different output folder

    echo "Processing $file -> $out_file"

    # Apply the CDO operation to compute the CWD index
    cdo -f nc4c -z zip_9 eca_cwd "$file" "$out_file"
    # -f nc4c: Output format NetCDF-4 Classic
    # -z zip_9: Apply maximum compression level (9)
    # eca_cwd: CDO operator for Consecutive Wet Days
done