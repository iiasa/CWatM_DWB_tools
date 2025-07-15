# ====================================================
# Title      : Consecutive Wet Days (CWD) Analysis
# Description: Processes and visualizes CWD Index and number of CWD periods > 5 days
# Author     : NIHWM RO
# ====================================================

# Load required libraries
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set working directory and load data (pilot basins and CWD files)
setwd("path_to_data")
basins <- st_read("path_to_pilot_basins")
cwd_files <- list.files(full.names = TRUE, pattern = ".nc$")
cwd_r <- rast(cwd_files[c(1:19, 21)])

# Extract CWD Index
cwd_r1 <- cwd_r["consecutive_wet_days_index_per_time_period"]
names(cwd_r1) <- c("R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR",
                   "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
                   "R4F:NOR-ESM-2", "R4F:UKESM-1", "CAN-ESM-5", "CNRM-CM6",
                   "CNRM-ESM-2", "EC-EARTH3", " EMO-1", "  E-OBS", "GFDL-ESM-4",
                   "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1")

# Convert to long format
cwd_r1_df <- as.data.frame(cwd_r1, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -c(x, y), names_to = "Layer", values_to = "Value")

# Classify values
breaks1 <- c(0, 10, 20, 30, 40, 60, 80, 100, 150, 200, 250)
cwd_r1_df <- cwd_r1_df %>%
  mutate(Value_bin = cut(Value, breaks = breaks1, include.lowest = TRUE,
                         labels = paste(head(breaks1, -1), breaks1[-1], sep = "–")))

# Plot CWD Index
ggplot() +
  geom_raster(data = cwd_r1_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "YlGnBu") +
  theme_minimal() +
  labs(
    title = "Consecutive Wet Days Index (1990–2014)",
    fill = "No. of Days",
    x = "Longitude", y = "Latitude"
  ) +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# Zonal statistics for pilot basins
cwd1_zs_mean <- terra::extract(cwd_r1, basins, fun = mean, na.rm = TRUE)
cwd1_zs_max  <- terra::extract(cwd_r1, basins, fun = max,  na.rm = TRUE)
cwd1_zs_min  <- terra::extract(cwd_r1, basins, fun = min,  na.rm = TRUE)

# Extract CWD periods > 5 days
cwd_r2 <- cwd_r["number_of_cwd_periods_with_more_than_5days_per_time_period"]
names(cwd_r2) <- names(cwd_r1)

# Convert to long format
cwd_r2_df <- as.data.frame(cwd_r2, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -c(x, y), names_to = "Layer", values_to = "Value")

# Zonal statistics
cwd2_zs_mean <- terra::extract(cwd_r2, basins, fun = mean, na.rm = TRUE)
cwd2_zs_max  <- terra::extract(cwd_r2, basins, fun = max,  na.rm = TRUE)
cwd2_zs_min  <- terra::extract(cwd_r2, basins, fun = min,  na.rm = TRUE)

# Classify values
breaks2 <- c(0, 10, 20, 40, 60, 80, 100, 350)
cwd_r2_df <- cwd_r2_df %>%
  mutate(Value_bin = cut(Value, breaks = breaks2, include.lowest = TRUE,
                         labels = paste(head(breaks2, -1), breaks2[-1], sep = "–")))

# Plot CWD periods > 5 days
ggplot() +
  geom_raster(data = cwd_r2_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "Set3") +
  theme_minimal() +
  labs(
    title = "CWD Periods > 5 Days (1990–2014)",
    fill = "No. of Periods",
    x = "Longitude", y = "Latitude"
  ) +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# End of script ----------------------------------------------------------------
