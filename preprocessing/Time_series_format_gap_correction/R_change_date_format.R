# Loading libraries
if (!require("dplyr")) install.packages("dplyr")
library(dplyr)

# Set parameters
input_file <- "....csv"  # Input file path
output_file <- "....csv"  # Output file path
separator <- ","  # Column separator character
date_column_index <- 2  # Index of the column containing the date
current_date_format <- "Y.M.D"  # Current (incorrect) date format
new_date_format <- "Y-M-D"  # New (correct) date format
missing_value <- "NA"  # Placeholder for missing values in dates

# Interpreting the format for R
interpret_format <- function(format) {
  format <- gsub("Y", "%Y", format)
  format <- gsub("M", "%m", format)
  format <- gsub("D", "%d", format)
  return(format)
}

# Reading the CSV file
data <- read.csv(input_file, sep = separator, stringsAsFactors = FALSE)

# Check if the specified column exists
if (date_column_index > ncol(data)) {
  stop("The specified date column index is out of range.")
}

# Interpreting the current date format and transforming
current_date_format_r <- interpret_format(current_date_format)
new_date_format_r <- interpret_format(new_date_format)

data[[date_column_index]] <- as.Date(data[[date_column_index]], format = current_date_format_r)

# Checking for invalid dates
if (any(is.na(data[[date_column_index]]))) {
  invalid_rows <- data[is.na(data[[date_column_index]]), ]
  warning("Invalid date values found in the following rows:")
  print(invalid_rows)
}

# Converting to the new date format
data[[date_column_index]] <- format(data[[date_column_index]], format = new_date_format_r)

# Handling missing values
data[[date_column_index]][is.na(data[[date_column_index]])] <- missing_value

# Saving the result file
write.csv(data, file = output_file, sep = separator, row.names = FALSE, quote = FALSE)

cat("Date format conversion is completed, and the result file has been saved.\n")
