#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute Consecutive Wet Days (CWD) Index
# Description:
#   This script calculates the Consecutive Wet Days (CWD) index from daily 
#   precipitation NetCDF files using CDO’s `eca_cwd` operator. It stores the 
#   output in a separate subfolder with compression applied.
#   The CWD index counts the maximum number of consecutive days with 
#   precipitation ≥ threshold (default: 1.0 mm).
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory for CWD results
mkdir -p ../cwd  # Modify this path as needed for your output location

# Set threshold in mm for a "wet day" (default is 1.0 mm, as per WMO standard)
threshold=1.0

# Loop through all NetCDF files in the parent directory
for file in ../*.nc; do
    # Extract the base name (filename without path or extension)
    base=$(basename "$file" .nc)

    # Define output file path in the cwd directory
    out_file="../cwd/cwd_${base}.nc"  # Modify path as needed

    echo "Processing $file -> $out_file"

    # Compute the CWD index using CDO’s eca_cwd operator
    #   -f nc4c     : Use NetCDF-4 classic format
    #   -z zip_9    : Apply maximum compression
    #   eca_cwd     : Calculates the maximum number of consecutive wet days
    #   threshold   : Value above which a day is considered "wet" (in mm)
    cdo -f nc4c -z zip_9 eca_cwd,"$threshold" "$file" "$out_file"
done