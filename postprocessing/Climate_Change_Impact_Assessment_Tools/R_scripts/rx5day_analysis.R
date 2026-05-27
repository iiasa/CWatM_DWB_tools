# ==============================================================================
# Title      : Highest Five Day Precipitation (RX5day)
# Description: Extracts, processes, and visualizes the highest 
#              5-day precipitation totals from climate models.
# Author     : NIHWM RO
# ==============================================================================

# Load Required Libraries ------------------------------------------------------
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set working directory and load pilot basins
setwd("path_to_data")
basins <- st_read("path_to_pilot_basins")

# Load and stack selected NetCDF files
rx5d_files <- list.files(full.names = TRUE, pattern = ".nc$")
rx5d_r <- rast(rx5d_files[c(1:19, 21)])

# Select variable of interest
rx5d_r1 <- rx5d_r["highest_five_day_precipitation_amount_per_time_period"]

# Assign model names
names(rx5d_r1) <- c(
  "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR",
  "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
  "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5", "CNRM-CM6",
  "CNRM-ESM-2", "EC-EARTH3", "EMO-1", "E-OBS", "GFDL-ESM-4",
  "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1"
)

# Convert raster data to long format
rx5d_df <- as.data.frame(rx5d_r1, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -c(x, y), names_to = "Model", values_to = "Value")

# Compute zonal statistics by basin
rx5d_mean <- t(round(terra::extract(rx5d_r1, basins, fun = mean, na.rm = TRUE), 1))
rx5d_max  <- t(round(terra::extract(rx5d_r1, basins, fun = max, na.rm = TRUE), 1))
rx5d_min  <- t(round(terra::extract(rx5d_r1, basins, fun = min, na.rm = TRUE), 1))

# Classify data into intervals
breaks <- c(0, 20, 40, 60, 80, 100, 125, 150, 175, 200, 300, 400)
rx5d_df <- rx5d_df %>%
  mutate(Value_bin = cut(Value, breaks = breaks, include.lowest = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

# Plot highest 5-day precipitation per model
ggplot() +
  geom_raster(data = rx5d_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Model, ncol = 4) +
  scale_fill_brewer(palette = "Set3") +
  theme_minimal() +
  labs(
    title = "Highest Five Day Precipitation Amount (1990–2014)",
    fill = "Precipitation [mm/5 days]",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(
    legend.position = "bottom",
    plot.title = element_text(hjust = 0.5)
  )

# End of script ----------------------------------------------------------------
