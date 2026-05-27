# Load necessary libraries
if (!require("dplyr")) install.packages("dplyr")
library(dplyr)

# Set parameters
input_file <- "....csv"  # Input file path
output_file <- "....csv"  # Output file path
separator <- ","  # Column separator character
current_date_format <- "Y-M-D"  # Current date format (e.g., "Y-M-D", "D.M.Y")
start_date <- as.Date("1990-01-01")  # Predefined start date
end_date <- as.Date("2022-12-31")  # Predefined end date
date_column_name <- "Date"  # The name of the date column

# Helper function to interpret the date format for R
interpret_format <- function(format) {
  format <- gsub("Y", "%Y", format)
  format <- gsub("M", "%m", format)
  format <- gsub("D", "%d", format)
  return(format)
}

# Convert the current date format to R-compatible format
current_date_format_r <- interpret_format(current_date_format)

# Read the CSV file
data <- read.csv(input_file, sep = separator, stringsAsFactors = FALSE)

# Check if the date column exists
if (!date_column_name %in% colnames(data)) {
  stop("The specified date column does not exist in the dataset.")
}

# Convert the date column to Date type
data[[date_column_name]] <- as.Date(data[[date_column_name]], format = current_date_format_r)

# Remove records outside the predefined date range
filtered_data <- data %>%
  filter(!!sym(date_column_name) >= start_date & !!sym(date_column_name) <= end_date)

# Save the filtered data to a new file
write.table(filtered_data, file = output_file, sep = separator, row.names = FALSE, quote = FALSE)

cat("Records outside the predefined date range have been removed. The filtered file has been saved to:", output_file, "\n")
