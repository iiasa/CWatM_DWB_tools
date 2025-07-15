# ==============================================================================
# Title      :  Moderate wet days w.r.t. 75th percentile of reference period
# Description: This script processes and visualizes the "moderate wet days 
#              above the 75th percentile of wet-day precipitation" indicator 
#              for a period across various climate models.
# Author: NIHWM RO
# ==============================================================================

# Load Required Libraries -------------------------------------------------------
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set Working Directory ---------------------------------------------------------
setwd("path_to_data")

# Load Pilot Basin Shapefile ---------------------------------------------------
basins <- st_read("path_to_pilot_basins")

# Load NetCDF Files and Stack as Raster ----------------------------------------
r75p_files <- list.files(full.names = TRUE, pattern = "\\.nc$")
r75p_rasters <- rast(r75p_files[c(1:19, 21)])

# Assign Standardized Names to Raster Layers ------------------------------------
names(r75p_rasters) <- c(
  "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR", 
  "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
  "R4F:NOR-ESM-2", "R4F:UKESM-1", "CAN-ESM-5",         
  "CNRM-CM-6", "CNRM-ESM-2", "EC-EARTH3", "EMO-1", "E-OBS", 
  "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR",     
  "MRI-ESM-2-0", "UK-ESM-1"
)

# Convert Raster Stack to Long-Format Data Frame --------------------------------
r75p_df <- as.data.frame(r75p_rasters, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(
    cols = "R4F:CNRM-ESM2-1":"UK-ESM-1", 
    names_to = "Layer", 
    values_to = "Value"
  )

# Define Binning Intervals for Plotting ----------------------------------------
breaks <- c(0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25)

# Classify Raster Values into Bins ---------------------------------------------
r75p_df <- r75p_df %>%
  mutate(Value_bin = cut(
    Value,
    breaks = breaks,
    include.lowest = TRUE,
    right = TRUE,
    labels = paste(head(breaks, -1), breaks[-1], sep = "–")
  ))

# Summary (Optional) -----------------------------------------------------------
summary(r75p_df)

# Visualization: Raster Maps by Model ------------------------------------------
ggplot() +
  geom_raster(data = r75p_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "RdYlBu", direction = -1) +
  theme_minimal() +
  xlab("Longitudine") + ylab("Latitudine") +
  labs(
    title = "Frequency of Moderate Wet Days Above 75th Percentile Threshold (1990–2014)",
    fill = "Precipitation [% of Wet Days]"
  ) +
  theme(
    legend.position = "bottom",
    plot.title = element_text(hjust = 0.5)
  )

# Zonal Statistics: Mean, Max, Min per Basin and Model --------------------------
r75p_mean <- round(terra::extract(r75p_rasters, basins, fun = mean, na.rm = TRUE), 1)
r75p_max  <- round(terra::extract(r75p_rasters, basins, fun = max, na.rm = TRUE), 1)
r75p_min  <- round(terra::extract(r75p_rasters, basins, fun = min, na.rm = TRUE), 1)

# Print Transposed Tables (Model × Basin) ---------------------------------------
t(r75p_mean[, -1])
t(r75p_max[, -1])
t(r75p_min[, -1])

# End of script ----------------------------------------------------------------
