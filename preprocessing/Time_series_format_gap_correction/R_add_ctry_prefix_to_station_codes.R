# Load necessary libraries
if (!require("dplyr")) install.packages("dplyr")
library(dplyr)

# Set parameters
input_file <- "....csv"  # Input file path
output_file <- "....csv"  # Output file path
prefix <- "CZ_" # Prefix to be added to each line

# Read the CSV file
data <- readLines(input_file)

# Modify lines (excluding the header)
modified_data <- c(
  data[1], # Keep the header unchanged
  paste0(prefix, data[-1]) # Add the prefix to all other lines
)

# Write the modified data to a new file
writeLines(modified_data, output_file)

cat("The modified file has been saved to:", output_file, "\n")
