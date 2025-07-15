#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Remap NetCDF Files to Reference Grid (0.5° resolution)
# Description:
#   This script loops through a folder of NetCDF files, and regrids them using 
#   conservative remapping (`remapcon`) based on the grid of a reference NetCDF file.
#   Output files are saved with a `regr05_` prefix.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Define the input folder containing NetCDF files to be regridded
FOLDER_PATH="/mnt/e/Analiza/tas_1990_2014/R4L"  # <-- MODIFY: set your source directory path here

# Define the reference NetCDF file whose grid will be used for remapping
clone="/mnt/e/Analiza/tas_1990_2014/GFDL-ESM4_celsius_merged_1990_2014.nc"  # <-- MODIFY: reference file path

# List all files in the input folder (optional for logging)
ls "$FOLDER_PATH"

# Loop over each .nc file in the folder
for file in "$FOLDER_PATH"/*.nc; do
    # Extract the filename without the full path
    base=$(basename "$file" .nc)

    # Print current file being processed
    echo "Processing file: $base"

    # Define output file path with prefix "regr05_"
    out_file="../regr05_${base}.nc"  # <-- MODIFY: adjust destination folder if needed

    echo "Regridding $file -> $out_file"

    # Apply conservative remapping using CDO
    cdo -f nc4c -z zip remapcon,"$clone" "$file" "$out_file"
done