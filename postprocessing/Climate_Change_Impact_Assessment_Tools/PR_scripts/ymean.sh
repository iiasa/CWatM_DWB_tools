#!/bin/bash

# ------------------------------------------------------------------------------
# Title: Compute Yearly and Multiannual Mean Precipitation
# Description:
#   This script processes multiple NetCDF files containing precipitation data.
#   It computes yearly sums (using `yearsum`) and then calculates a multiannual 
#   mean (using `timmean`) across the entire time period.
#   Output files are saved in specified subdirectories.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directories (modify these paths as needed)
mkdir -p ../sum_ypr          # Directory for yearly precipitation sums
mkdir -p ../ymean_pr         # Directory for multiannual precipitation means

# Loop through all NetCDF files in the parent directory (modify path if needed)
for file in ../*.nc; do
    # Extract the base filename (remove .nc extension)
    base=$(basename "$file" .nc)

    # Set output file paths (modify paths if needed)
    out_file1="../sum_ypr/yearly_sum_${base}.nc"       # File for yearly totals
    out_file2="../ymean_pr/multiannual_mean_${base}.nc" # File for long-term mean

    echo "Processing $file"

    # Step 1: Compute yearly sum using CDO `yearsum`
    # This command aggregates sub-yearly (e.g. daily) values into annual sums
    cdo -f nc4c -z zip_9 yearsum "$file" "$out_file1"
    echo "Generated yearly sums: $out_file1"

    # Step 2: Compute multiannual mean using CDO `timmean`
    # Calculates the average across all years
    cdo -f nc4c -z zip_9 timmean "$out_file1" "$out_file2"
    echo "Generated multiannual yearly mean: $out_file2"
    echo "--------------------------------------------------"
done

echo "Script finished successfully!"