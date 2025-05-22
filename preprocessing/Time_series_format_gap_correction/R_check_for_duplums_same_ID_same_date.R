# Load necessary libraries
if (!require("dplyr")) install.packages("dplyr")
library(dplyr)

# Set parameters
file_path <- "....csv"  # Input file path
separator <- ","  # Column separator
id_column <- "ID"  # Column name for station IDs
date_column <- "Date"  # Column name for dates

# Read CSV file
data <- read.csv(file_path, sep = separator, stringsAsFactors = FALSE)

# Check if the required columns exist
required_columns <- c(id_column, date_column)
if (!all(required_columns %in% colnames(data))) {
  stop("The specified column names are not found in the dataset.")
}

# Check for duplicate records (same ID and same Date)
duplicates <- data %>%
  group_by(!!sym(id_column), !!sym(date_column)) %>%
  filter(n() > 1)

# If duplicates exist, print out affected IDs
if (nrow(duplicates) > 0) {
  cat("Duplicates found for the following station IDs and dates:\n")
  affected_ids <- unique(duplicates[[id_column]])
  print(affected_ids)
} else {
  cat("No duplicates found.\n")
}
