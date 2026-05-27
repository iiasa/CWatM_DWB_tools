# ====================================================
# Title      : Very Wet Days and Precipitation Totals
# Description: Analyzes the frequency and total precipitation on days exceeding 
#              the 90th percentile of wet-day precipitation for multiple models.
# Author     : NIHWM RO
# ====================================================

# Load required libraries
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set working directories and load pilot basins
setwd("path_to_data")
basins <- st_read("path_to_pilot_basins")

# Load NetCDF files for frequency and totals
r90p_files <- list.files(full.names = TRUE, pattern = ".nc$")
r90p_r <- rast(r90p_files[c(1:19,21)])

setwd("path_to_data")
r90ptot_files <- list.files(full.names = TRUE, pattern = ".nc$")
r90ptot_r <- rast(r90ptot_files[c(1:19,21)])

# Assign model names
model_names <- c(
  "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR", "R4F:MIROC-6",
  "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR", "R4F:NOR-ESM-2", "R4F:UKESM-1",
  "CAN-ESM-5", "CNRM-CM-6", "CNRM-ESM-2", "EC-EARTH3", "  EMO-1", " E-OBS",
  "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1"
)

names(r90p_r) <- model_names
names(r90ptot_r) <- model_names

# Convert raster stacks to long-format data frames
r90p_df <- as.data.frame(r90p_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = model_names, names_to = "Layer", values_to = "Value")

r90ptot_df <- as.data.frame(r90ptot_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = model_names, names_to = "Layer", values_to = "Value")

# Define classification bins for frequency
freq_breaks <- c(0,5,10,15,20,25,30,35,40,45,50)

r90p_df <- r90p_df %>%
  mutate(Value_bin = cut(Value, breaks = freq_breaks, include.lowest = TRUE,
                         labels = paste(head(freq_breaks, -1), freq_breaks[-1], sep = "–")))

# Define classification bins for total precipitation
total_breaks <- c(20,30,40,50,60,70,80,90,100)

r90ptot_df <- r90ptot_df %>%
  mutate(Value_bin = cut(Value, breaks = total_breaks, include.lowest = TRUE,
                         labels = paste(head(total_breaks, -1), total_breaks[-1], sep = "–")))

# Plot: frequency of very wet days
ggplot() +
  geom_raster(data = r90p_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "RdYlBu") +
  theme_minimal() +
  labs(
    title = "Frequency of Very Wet Days > 90th Percentile (1990–2014)",
    fill = "Frequency",
    x = "Longitudine",
    y = "Latitudine"
  ) +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# Zonal statistics for frequency
r90p_mean <- round(terra::extract(r90p_r, basins, fun = mean, na.rm = TRUE), 1)
r90p_max  <- terra::extract(r90p_r, basins, fun = max, na.rm = TRUE)
r90p_min  <- terra::extract(r90p_r, basins, fun = min, na.rm = TRUE)

# Plot: total precipitation on very wet days
ggplot() +
  geom_raster(data = r90ptot_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "RdYlBu") +
  theme_minimal() +
  labs(
    title = "Annual Total Precipitation on Very Wet Days (1990–2014)",
    fill = "Precipitation [mm]",
    x = "Longitudine",
    y = "Latitudine"
  ) +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# Zonal statistics for total precipitation
r90ptot_mean <- round(terra::extract(r90ptot_r, basins, fun = mean, na.rm = TRUE), 1)
r90ptot_max  <- round(terra::extract(r90ptot_r, basins, fun = max, na.rm = TRUE), 1)
r90ptot_min  <- round(terra::extract(r90ptot_r, basins, fun = min, na.rm = TRUE), 1)

# Transposed summaries
t(r90ptot_mean[, 2:21])
t(r90ptot_max[, 2:21])
t(r90ptot_min[, 2:21])

# End of script ----------------------------------------------------------------
