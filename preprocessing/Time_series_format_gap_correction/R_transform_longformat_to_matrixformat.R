# Install and load necessary libraries
if (!require("dplyr")) install.packages("dplyr")
if (!require("tidyr")) install.packages("tidyr")
library(dplyr)
library(tidyr)

# Set parameters
input_file <- "C:/input.csv"
output_file <- "C:/output.csv"
delimiter <- ','  # Column separator character e.g. ";", ","
station_column <- 1  # Column index containing station IDs
date_column <- 2  # Column index containing dates
data_column <- 4  # Column index containing data values

# Read the input file
df <- read.csv(input_file, stringsAsFactors = FALSE, sep = delimiter)

# Select columns based on index
df <- df[, c(station_column, date_column, data_column)]
colnames(df) <- c("ID", "Date", "Data")

# Convert Date column to Date format
df$Date <- as.Date(df$Date, format="%Y-%m-%d")

# Pivot data to wide format
df_wide <- df %>%
  pivot_wider(names_from = ID, values_from = Data)

# Save the transformed data to CSV
write.csv(df_wide, output_file, row.names = FALSE, quote = FALSE)

cat("Transformation complete. Output saved to:", output_file, "\n")
