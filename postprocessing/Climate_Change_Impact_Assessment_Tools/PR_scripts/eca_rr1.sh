#!/bin/bash
# ------------------------------------------------------------------------------
# Title: Wet Days Index Calculation (RR1) Using CDO
# Description:
#   This script calculates the number of wet days (RR1 index) from NetCDF 
#   precipitation data using the Climate Data Operators (CDO) tool. The 
#   threshold is typically 1.0 mm/day, and the script processes all NetCDF 
#   files in the specified folder.
# Author: NIHWM RO
# ------------------------------------------------------------------------------

# Create output directory for results
mkdir -p ../rr1  # Modify this path if needed

# Define the precipitation threshold in mm (1.0 mm is a common wet-day threshold)
threshold=1.0  # NOTE: This is just for documentation; the threshold is predefined in CDO's eca_rr1 operator

# Loop through all NetCDF files in the parent folder
for file in ../*.nc; do
    # Extract base name of the file (without extension)
    base=$(basename "$file" .nc)

    # Define output file name with prefix
    out_file="../rr1/rr1_${base}.nc"  # Modify output directory path if needed

    echo "Processing $file -> $out_file"

    # Apply the ECARR1 operator to calculate number of wet days per time period
    # ECARR1 counts days with precipitation ≥ 1.0 mm
    cdo -f nc4c -z zip_9 eca_rr1 "$file" "$out_file"

done