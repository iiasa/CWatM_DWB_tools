#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Conservative Remapping of NetCDF Files to 0.5° Grid
# Description:
#   This script loops through all NetCDF files in a specified directory and 
#   applies conservative remapping to match the grid of a reference file 
#   (clone grid), using CDO's `remapcon` operator. The outputs are saved 
#   with a prefix indicating the new grid resolution.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Set the input folder containing NetCDF files
FOLDER_PATH="../InitialData/"  # <-- Modify this path to your input data directory

# Print the contents of the input folder
ls "$FOLDER_PATH"

# Define the reference NetCDF file whose grid will be used as the target grid
clone="../InitialData/pr_gfdlesm4_mmd_1990_2014.nc"  # <-- Modify this path to match your desired clone grid

# Loop over all NetCDF files in the input folder
for file in ../InitialData/*.nc; do
    # Extract the base filename without the .nc extension
    base=$(basename "$file" .nc)
    echo $base

    # Define output filename with a prefix indicating regridding
    out_file="../regr05_${base}.nc"  # <-- Modify output path or naming if needed

    echo "Processing $file -> $out_file"

    # Apply conservative remapping using the grid of the clone file
    cdo -f nc4c -z zip remapcon,"$clone" "$file" "$out_file"
    # -f nc4c: write output in NetCDF-4 classic format
    # -z zip: apply compression
    # remapcon: conservative remapping based on weight averaging
done