# Install and load necessary libraries
if (!require("dplyr")) install.packages("dplyr")
if (!require("tidyr")) install.packages("tidyr")
library(dplyr)
library(tidyr)

# Set parameters
file_path <- "C:/input.csv"  # Input file path
output_file <- "C:/report.txt"  # Output file path
separator <- ","  # Column separator character e.g. ";", ","
station_column <- 1  # Column index containing station IDs
date_column <- 2  # Column index containing dates
data_column <- 3  # Column index containing data values
start_year <- 1990  # Start year
end_year <- 2022  # End year
date_separator <- "-"  # Separator used in the date format (e.g., ".", "-", "/")
no_data_value <- -9999

# Load the CSV file using the specified separator
data <- read.csv(file_path, sep = separator, stringsAsFactors = FALSE)

# Rename columns based on their indices
colnames(data)[station_column] <- "ID"
colnames(data)[date_column] <- "Date"
colnames(data)[data_column] <- "Value"

# Format the date using the specified separator
date_format <- paste("%Y", date_separator, "%m", date_separator, "%d", sep = "")  # Date format
data$Date <- as.Date(data$Date, format = date_format)

# Add a year column
data <- data %>%
  mutate(Year = as.numeric(format(Date, "%Y")))

# Prepare the range of years
years <- seq(from = start_year, to = end_year, by = 1)

# Only count values that are not equal to the missing data value
valid_data <- data %>%
  filter(Value != no_data_value) %>%
  group_by(ID, Year) %>%
  summarise(valid_count = n(), .groups = "drop")

# Ensure all years are represented for each station
result <- expand.grid(ID = unique(data$ID), Year = years) %>%
  left_join(valid_data, by = c("ID", "Year")) %>%
  mutate(valid_count = ifelse(is.na(valid_count), 0, valid_count)) %>%
  arrange(ID, Year)

# Create a pivot table
result <- result %>%
  pivot_wider(names_from = Year, values_from = valid_count, values_fill = list(valid_count = 0)) %>%
  select(ID, order(names(.)))

# Write the results to the output file
cat("Valid data summary by station and year:\n")
write.table(result, file = output_file, sep = "\t", row.names = FALSE, col.names = TRUE)


