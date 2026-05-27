# Load necessary libraries
if (!require("dplyr")) install.packages("dplyr")
library(dplyr)

# Set parameters
input_file <- "....csv"  # Input file path
output_file <- "....csv"  # Output file path
separator <- ","  # Column separator
columns_to_remove <- c(2, 3)  # Indexes of columns to be removed

# Load the CSV file
data <- read.csv(input_file, sep = separator, stringsAsFactors = FALSE)

# Remove specified columns
cleaned_data <- data %>%
  select(-all_of(columns_to_remove))

# Save the result to a CSV file
write.csv(cleaned_data, file = output_file, sep = separator, row.names = FALSE)
