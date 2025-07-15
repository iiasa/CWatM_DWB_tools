# ====================================================
# Title      : Simple Precipitation Intensity Index (SDII)
# Description: Extracts, processes, and visualizes the SDII indicator 
#              (total precipitation divided by number of wet days) 
#              for a period across climate models.
# Author     : NIHWM RO
# ====================================================

# Load Required Libraries
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set Working Directory
setwd("path_to_data")  # <- Replace with actual path

# Load Pilot Basins Shapefile
basins <- st_read("path_to_pilot_basins")  # <- Replace with actual path

# Load NetCDF Files
sdii_files <- list.files(full.names = TRUE, pattern = "\\.nc$")
sdii_rasters <- rast(sdii_files[c(1:19, 21)])  # Exclude file 20 if needed

# Select SDII Variable (assumes it's the only or primary variable)
sdii_r <- sdii_rasters["simple_daily_intensity_index_per_time_period"]

# Assign Model Names
names(sdii_r) <- c(
  "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR",
  "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
  "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5", "CNRM-CM6",
  "CNRM-ESM-2", "EC-EARTH3", "  EMO-1", " E-OBS", "GFDL-ESM-4",
  "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1"
)

# Convert Raster Stack to Long Data Frame
sdii_df <- as.data.frame(sdii_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -c(x, y), names_to = "Model", values_to = "Value")

# Zonal Statistics: Mean, Max, Min per Basin and Model
sdii_mean <- t(round(terra::extract(sdii_r, basins, fun = mean, na.rm = TRUE), 1))
sdii_max  <- t(round(terra::extract(sdii_r, basins, fun = max, na.rm = TRUE), 1))
sdii_min  <- t(round(terra::extract(sdii_r, basins, fun = min, na.rm = TRUE), 1))

# Define Classification Bins
breaks <- c(0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 25)

sdii_df <- sdii_df %>%
  mutate(
    Value_bin = cut(Value, breaks = breaks, include.lowest = TRUE,
                    labels = paste(head(breaks, -1), breaks[-1], sep = "–"))
  )

# Plot SDII
ggplot() +
  geom_raster(data = sdii_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Model, ncol = 4) +
  scale_fill_brewer(palette = "YlGnBu", direction = 1) +
  theme_minimal() +
  labs(
    title = "Simple Precipitation Intensity Index (SDII) – 1990–2014",
    fill = "SDII [mm/day]",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(
    legend.position = "bottom",
    plot.title = element_text(hjust = 0.5)
  )

# End of script ----------------------------------------------------------------
