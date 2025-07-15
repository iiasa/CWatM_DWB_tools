# ====================================================
# Title      : Consecutive Dry Days (CDD) Analysis
# Description: Visualizes the CDD index and number of periods > 5 days
# Author     : NIHWM RO
# ====================================================

# Load required libraries
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set working directory and load pilot basisns shapefile
setwd("path_to_data")
basins <- st_read("path_to_pilot_basins")

# Load NetCDF files and select models
cdd <- list.files(full.names = TRUE, pattern = ".nc$")
cdd_r <- rast(cdd[c(1:19, 21)])
names(cdd_r)

# Extract CDD index
cdd_r1 <- cdd_r["consecutive_dry_days_index_per_time_period"]

# Rename layers
names(cdd_r1) <- c("R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR", 
                   "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
                   "R4F:NOR-ESM-2", "R4F:UKESM-1", "CAN-ESM-5", "CNRM-CM-6",
                   "CNRM-ESM-2", "EC-EARTH3", "  EMO-1", " E-OBS", 
                   "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", 
                   "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1")

# Convert to long dataframe
cdd_r1_df <- as.data.frame(cdd_r1, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -"c(x, y)", names_to = "Layer", values_to = "Value")

# Define bins
breaks <- c(0, 10, 20, 30, 40, 50, 75, 100, 150, 200)
cdd_r1_df <- cdd_r1_df %>%
  mutate(Value_bin = cut(Value, breaks = breaks, include.lowest = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

# Plot CDD index
ggplot() +
  geom_raster(data = cdd_r1_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "Set1") +
  theme_minimal() +
  labs(title = "Consecutive Dry Days Index (1990–2014)",
       fill = "No. of Consecutive\nDry Days",
       x = "Longitudine", y = "Latitudine") +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# Zonal statistics
cdd_zs_mean <- terra::extract(cdd_r1, basins, fun = mean, na.rm = TRUE)
cdd_zs_max  <- terra::extract(cdd_r1, basins, fun = max, na.rm = TRUE)
cdd_zs_min  <- terra::extract(cdd_r1, basins, fun = min, na.rm = TRUE)

# Extract second variable: CDD periods > 5 days
cdd_r2 <- cdd_r["number_of_cdd_periods_with_more_than_5days_per_time_period"]
names(cdd_r2) <- names(cdd_r1)

# Convert to long dataframe
cdd_r2_df <- as.data.frame(cdd_r2, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -"c(x, y)", names_to = "Layer", values_to = "Value")

# Zonal statistics for pilot basins
cdd2_zs_mean <- terra::extract(cdd_r2, basins, fun = mean, na.rm = TRUE)
cdd2_zs_max  <- terra::extract(cdd_r2, basins, fun = max, na.rm = TRUE)
cdd2_zs_min  <- terra::extract(cdd_r2, basins, fun = min, na.rm = TRUE)

# Define bins
breaks <- c(10, 20, 40, 60, 80, 100, 200, 300, 400, 500)
cdd_r2_df <- cdd_r2_df %>%
  mutate(Value_bin = cut(Value, breaks = breaks, include.lowest = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

# Plot CDD periods > 5 days
ggplot() +
  geom_raster(data = cdd_r2_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "Set3") +
  theme_minimal() +
  labs(title = "CDD Periods > 5 Days (1990–2014)",
       fill = "No. of CDD > 5 Days",
       x = "Longitudine", y = "Latitudine") +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# End of script ----------------------------------------------------------------
