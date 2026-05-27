#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Cold Days Index Calculation (TG10p) for Daily Air Temperature Data
# Description:
#   This script calculates the number of cold days (days below 10th percentile)
#   for each daily temperature NetCDF using the `eca_tg10p` CDO operator.
#   It loops over all input files and saves the results in a dedicated folder.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory for cold days index
# MODIFY this path to your desired output location
mkdir -p /mnt/e/Analiza/tas_1990_2014/cold_days/

# Define the folder containing input NetCDF daily tas files
# MODIFY this path to the directory where your .nc files are located
FOLDER_PATH="/mnt/e/Analiza/tas_1990_2014"

# List all files in the folder (for logging/debugging)
ls "$FOLDER_PATH"

# Loop through each .nc file in the input folder
for file in "$FOLDER_PATH"/*.nc; do
    # Get filename without extension
    base=$(basename "$file" .nc)
    echo "Processing: $base"

    # Define output file path
    # MODIFY if you want to change output directory
    out_file="/mnt/e/Analiza/tas_1990_2014/cold_days/cld_${base}.nc"
    echo "Processing $file -> $out_file"

    # Compute TG10p index using CDO
    # MODIFY the second input path if your percentile files are stored elsewhere
    cdo -f nc4c -z zip eca_tg10p \
        "$file" \
        "/mnt/e/Analiza/tas_1990_2014/tg_perc10/tg_perc10_${base}.nc" \
        "$out_file"
done