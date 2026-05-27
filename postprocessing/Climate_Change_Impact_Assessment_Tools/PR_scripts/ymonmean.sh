#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Monthly and Multiannual Precipitation Climatology
# Description:
#   This script processes NetCDF precipitation data using CDO to compute:
#     - Monthly sums (e.g., for each month in each year)
#     - Multiannual (climatological) monthly means across the full time series
#   Input files are expected to contain daily or sub-monthly data.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directories if they don't exist
mkdir -p ../sum_pr         # <- Change this path if needed
mkdir -p ../ymon_pr        # <- Change this path if needed

# Loop over all NetCDF files in the parent directory
for file in ../*.nc; do    # <- Adjust input directory path if necessary
    # Extract the base filename without extension (e.g., 'pr_daily')
    base=$(basename "$file" .nc)

    # Define output file paths
    out_file1="../sum_pr/monthly_sum_${base}.nc"               # <- Monthly sum output path (modify if needed)
    out_file2="../ymon_pr/multiannual_monthly_sum_${base}.nc"  # <- Multiannual monthly mean output path (modify if needed)

    echo "Processing $file"

    # Step 1: Compute monthly sum from daily/sub-monthly precipitation
    # This step converts daily data to monthly totals
    cdo -f nc4c -z zip_9 monsum "$file" "$out_file1"

    echo "Generated monthly sums: $out_file1"

    # Step 2: Compute multiannual monthly means (climatology)
    # This calculates the mean for each calendar month across all years
    cdo -f nc4c -z zip_9 ymonmean "$out_file1" "$out_file2"

    echo "Generated multiannual monthly means: $out_file2"
    echo "--------------------------------------------------"
done

echo "Script finished successfully!"