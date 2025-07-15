# ====================================================
# Title      : Highest One Day Precipitation (RX1day)
# Description: Extracts, processes, and visualizes RX1day values
#              across multiple climate models.
# Author     : NIHWM RO
# ====================================================


# Load Required Libraries -------------------------------------------------------
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set working directory and load pilot basins
setwd("path_to_data")
basins <- st_read("path_to_pilot_basins")

# Load NetCDF files and convert to SpatRaster
rx1d_files <- list.files(full.names = TRUE, pattern = ".nc$")
rx1d_r <- rast(rx1d_files[c(1:19, 21)])

# Assign model names to raster layers
names(rx1d_r) <- c(
  "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR",
  "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
  "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5", "CNRM-CM6",
  "CNRM-ESM-2", "EC-EARTH3", "EMO-1", "E-OBS", "GFDL-ESM-4",
  "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1"
)

# Convert raster to long-format data frame
rx1d_df <- as.data.frame(rx1d_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -c(x, y), names_to = "Layer", values_to = "Value")

# Compute zonal statistics (mean, max, min)
rx1d_mean <- t(round(terra::extract(rx1d_r, basins, fun = mean, na.rm = TRUE), 1))
rx1d_max  <- t(round(terra::extract(rx1d_r, basins, fun = max, na.rm = TRUE), 1))
rx1d_min  <- t(round(terra::extract(rx1d_r, basins, fun = min, na.rm = TRUE), 1))

# Define class intervals
breaks <- c(0, 20, 40, 60, 80, 100, 125, 150, 175, 200, 360)

# Bin values by class intervals
rx1d_df <- rx1d_df %>%
  mutate(Value_bin = cut(Value, breaks = breaks, include.lowest = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

# Plot RX1day per model
ggplot() +
  geom_raster(data = rx1d_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "Set2") +
  theme_minimal() +
  labs(
    title = "Highest One Day Precipitation Amount (1990–2014)",
    fill = "Precipitation [mm/day]",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(
    legend.position = "bottom",
    plot.title = element_text(hjust = 0.5)
  )

# End of script ----------------------------------------------------------------
