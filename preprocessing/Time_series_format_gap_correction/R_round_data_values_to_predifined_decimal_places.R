# Install and load necessary libraries
if (!require("dplyr")) install.packages("dplyr")
if (!require("tidyr")) install.packages("tidyr")
library(dplyr)
library(tidyr)

input_file <- "....csv" # Input file path
output_file <- "....csv" # Output file path
delimiter <- ","  # Adjust delimiter as needed
data_column_index <- 3  # Column index containing data values
nodata_value <- -9999  # Define the NoData value
decimal_places <- 2  # Number of decimal places for rounding

# Function to round data while keeping NoData value as integer
  # Read the input file
  df <- read.csv(input_file, stringsAsFactors = FALSE, sep = delimiter)
  
  # Get the column name based on index
  data_column <- names(df)[data_column_index]
  
  # Ensure data column is numeric
  df[[data_column]] <- as.numeric(df[[data_column]])
  
  # Round values except NoData value
  df[[data_column]] <- ifelse(df[[data_column]] == nodata_value, nodata_value, round(df[[data_column]], decimal_places))
  
  # Save the modified data
  write.csv(df, output_file, row.names = FALSE, quote = FALSE)
  
  cat("Rounding complete. Output saved to:", output_file, "\n")