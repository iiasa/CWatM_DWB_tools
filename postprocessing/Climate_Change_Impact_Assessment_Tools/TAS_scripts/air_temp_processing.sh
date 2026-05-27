#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Convert NetCDF Air Temperature from Kelvin to Celsius
# Description:
#   This script loops through ISIMIP3b historical NetCDF datasets for different 
#   models, converts air temperature values (tas) from Kelvin to Celsius using CDO, 
#   and saves the outputs in separate folders per model.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

shopt -s nullglob  # Prevents errors if no matching files are found in a loop

# Define the source directories for processing
# MODIFY this path to point to your input dataset location
folders=(/mnt/e/ISIMIP3b/historical/*/)

# Loop through each model folder
for folder in "${folders[@]}"; do
    echo "Processing folder: $folder"

    # Extract folder name (e.g., model name) and create corresponding output folder
    folder_name=$(basename "$folder")
    
    # MODIFY this if you want to store outputs elsewhere
    output_folder="./${folder_name}_celsius"
    mkdir -p "$output_folder"  # Create output directory if it doesn't exist

    # Loop through all daily tas NetCDF files in the folder
    for file in "$folder"/*historical_tas_*.nc; do
        if [[ -f "$file" ]]; then  # Check that the file exists
            filename=$(basename "$file")  # Get filename without path
            output_file="$output_folder/$filename"  # Define path to output file

            echo "  Converting $filename to Celsius..."
            # Perform unit conversion using CDO: subtract 273.15 to convert Kelvin to Celsius
            cdo subc,273.15 "$file" "$output_file"
        fi
    done
done

echo ">>^<< Conversion complete. >>^<<"