# Load necessary libraries
if (!require("dplyr")) install.packages("dplyr")
library(dplyr)

# Set parameters
file_path <- "C:/input.csv"  # Input file path
output_path <- "C:/output.csv"  # Output file path
separator <- ","  # Column separator character e.g. ";", ","
value_column <- "Value"  # Column name for data values

# Read CSV file
data <- read.csv(file_path, sep = separator, stringsAsFactors = FALSE)

# Check if the value column exists
if (!(value_column %in% colnames(data))) {
  stop("The specified value column does not exist in the dataset.")
}

# Function to preserve original digits but convert scientific notation to normal numbers
convert_to_normal_format <- function(x) {
  # Check if the value is in scientific notation (scientific values have an "e" or "E" in them)
  if (grepl("e", as.character(x)) | grepl("E", as.character(x))) {
    # Convert the value to normal number with the same number of digits
    return(formatC(x, format = "f", digits = nchar(sub("0\\.", "", as.character(x)))))
  } else {
    # Return the value as is if it's not in scientific notation
    return(x)
  }
}

# Apply conversion to the value column
data[[value_column]] <- sapply(data[[value_column]], convert_to_normal_format)

# Write the result to the output file
write.table(data, file = output_path, sep = separator, row.names = FALSE, quote = FALSE)

cat("The values in scientific notation have been converted to normal format and saved to:", output_path, "\n")
