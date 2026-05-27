#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Merge and Subset ISIMIP NetCDF Files
# Description:
#   This script processes multiple folders containing NetCDF temperature files 
#   converted to Celsius. It performs the following operations:
#     - Merges all `.nc` files per folder into a single time-series
#     - Extracts a specific date range (1990-01-01 to 2014-12-31)
# Author: NIHWM RO
# ------------------------------------------------------------------------------

shopt -s nullglob  # Prevent errors if no .nc files are found in folder

# Define folders to process (modify pattern if your folder names differ)
folders=(./*_celsius)  # ❗ Modify this pattern if needed

# Loop through each matching folder
for folder in "${folders[@]}"; do
    echo "Processing folder: $folder"

    # Set merged file output name (merging all .nc files in the folder)
    merged_all="$folder/${folder}_merged_all.nc"
    
    # Merge all time-sorted NetCDF files in the folder
    cdo mergetime "$folder"/*.nc "$merged_all"

    # Set name for subset file (1990–2014 period)
    output_subset="$folder/${folder}_merged_1990_2014.nc"
    
    # Subset merged file by date range using seldate
    cdo seldate,1990-01-01,2014-12-31 "$merged_all" "$output_subset"

    echo "  ✅ Done: $output_subset"
done

echo "🎉 All processing complete."
