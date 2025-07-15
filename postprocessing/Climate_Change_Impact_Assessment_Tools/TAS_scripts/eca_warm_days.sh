 #!/bin/bash
# ------------------------------------------------------------------------------
# Title: Compute Warm Days Index (TG90p) for Daily Temperature Data
# Description:
#   This script calculates the TG90p climate index (percentage of warm days 
#   exceeding the 90th percentile) for each NetCDF file in a specified directory. 
#   It uses precomputed percentile thresholds and outputs the results into a 
#   separate directory.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory if it doesn't exist
mkdir -p /mnt/e/Analiza/tas_1990_2014/warm_days/  # <-- MODIFY this path if needed

# Define the directory containing daily tas files
FOLDER_PATH="/mnt/e/Analiza/tas_1990_2014"        # <-- MODIFY this path if needed

# List contents of the folder (optional)
ls "$FOLDER_PATH"

# Loop through all NetCDF files in the directory
for file in "$FOLDER_PATH"/*.nc; do
    # Extract filename without extension
    base=$(basename "$file" .nc)
    echo "Processing: $base"

    # Define the output file name
    out_file="/mnt/e/Analiza/tas_1990_2014/warm_days/wrm_${base}.nc"  # <-- MODIFY output path if needed

    echo "Processing $file -> $out_file"

    # Compute TG90p index:
    # - eca_tg90p computes percentage of days above 90th percentile
    # - Requires the input file and the corresponding percentile threshold file
    # - Output is compressed NetCDF4
    cdo -f nc4c -z zip eca_tg90p "$file" \
        "/mnt/e/Analiza/tas_1990_2014/tg_perc90/tg_perc90_${base}.nc" \
        "$out_file"  # <-- MODIFY percentile path if structure differs

done