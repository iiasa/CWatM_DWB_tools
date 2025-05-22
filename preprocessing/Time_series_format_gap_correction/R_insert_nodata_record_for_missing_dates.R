# Load necessary libraries
if (!require("dplyr")) install.packages("dplyr")
if (!require("tidyr")) install.packages("tidyr")
library(dplyr)
library(tidyr)

# Set parameters
file_path <- "....csv"  # Input file path
output_path <- "....csv"  # Output file path
separator <- ","  # Column separator
current_date_format <- "Y-M-D"  # Current date format (e.g., "Y-M-D", "D.M.Y")
missing_value <- -9999  # Value for missing data
id_column <- "ID"  # Column name for station IDs
date_column <- "Date"  # Column name for dates
value_column <- "GWHmasl"  # Column name for data values
global_start_date <- as.Date("1990-01-01")  # Global start date for the time series
global_end_date <- as.Date("2022-12-31")  # Global end date for the time series
time_step <- "monthly"  # Define the type of data: "daily" or "monthly"

# Function to interpret date formats
interpret_date_format <- function(format) {
  format <- gsub("Y", "%Y", format)
  format <- gsub("M", "%m", format)
  format <- gsub("D", "%d", format)
  return(format)
}

# Interpret the current date format for R
current_date_format_r <- interpret_date_format(current_date_format)

# Read CSV file
data <- read.csv(file_path, sep = separator, stringsAsFactors = FALSE)

# Check if the required columns exist
required_columns <- c(id_column, date_column, value_column)
if (!all(required_columns %in% colnames(data))) {
  stop("The specified column names are not found in the dataset.")
}

# Remember the original order of stations
original_order <- unique(data[[id_column]])

# Format the date column using the specified date format
data[[date_column]] <- as.Date(data[[date_column]], format = current_date_format_r)

# Check for invalid dates
if (any(is.na(data[[date_column]]))) {
  invalid_rows <- data[is.na(data[[date_column]]), ]
  stop("Invalid date values found in the following rows:\n", 
       capture.output(print(invalid_rows)))
}

# Extract the reference day for monthly data
get_reference_day <- function(dates) {
  if (length(dates) > 0) {
    unique_days <- unique(as.numeric(format(dates, "%d")))
    if (length(unique_days) == 1) {
      return(unique_days)  # Use the unique day as the reference
    } else {
      stop("Monthly data contains inconsistent day values.")
    }
  }
  return(15)  # Default to the 15th if no dates are available
}

reference_day <- if (time_step == "monthly") {
  get_reference_day(data[[date_column]])
} else {
  NA
}

# Define a sequence of dates based on the time_step
generate_date_sequence <- function(start_date, end_date, time_step, reference_day = NULL) {
  if (time_step == "daily") {
    return(seq(start_date, end_date, by = "day"))
  } else if (time_step == "monthly") {
    seq_dates <- seq(start_date, end_date, by = "month")
    return(as.Date(paste(format(seq_dates, "%Y-%m"), reference_day, sep = "-")))
  } else {
    stop("Invalid time_step. Choose either 'daily' or 'monthly'.")
  }
}

# Generate the global date sequence based on the time step
global_date_sequence <- generate_date_sequence(global_start_date, global_end_date, time_step, reference_day)

# Fill missing dates globally for all stations
data_filled <- data %>%
  group_by(!!sym(id_column)) %>%
  complete(!!sym(date_column) := global_date_sequence) %>%
  mutate(!!sym(value_column) := ifelse(is.na(!!sym(value_column)), missing_value, !!sym(value_column))) %>%
  ungroup()

# Preserve the original order of stations
data_filled <- data_filled %>%
  mutate(!!sym(id_column) := factor(!!sym(id_column), levels = original_order)) %>%
  arrange(!!sym(id_column), !!sym(date_column))

# Format the filled date column back to the original format
data_filled[[date_column]] <- format(as.Date(data_filled[[date_column]]), format = current_date_format_r)

# Write the result to the output file
write.table(data_filled, file = output_path, sep = separator, row.names = FALSE, quote = FALSE)

cat("Time series have been filled and saved to:", output_path, "\n")
