# ==============================================================================
# Title      : R99p and R99pTOT Indices – Very Wet Days Analysis
# Description: This script extracts, processes, and visualizes two heavy precipitation
#              indices derived from climate model outputs:
#              - R99p: Frequency of very wet days (>99th percentile of wet days)
#              - R99pTOT: Total precipitation amount on very wet days
# Author: NIHWM RO
# ==============================================================================

# Load Required Libraries ------------------------------------------------------
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set Working Directory --------------------------------------------------------
setwd("path_to_data")

# Load Pilot Basin Shapefile ---------------------------------------------------
basins <- st_read("path_to_pilot_basins") 

# Load R99p Raster Files -------------------------------------------------------
r99p <- list.files(full.names = TRUE, pattern = ".nc$")
r99p_r <- rast(r99p[c(1:19, 21)])  # Exclude index 20 if needed

# Load R99pTOT Raster Files ----------------------------------------------------
setwd("path_to_data")
r99ptot <- list.files(full.names = TRUE, pattern = ".nc$")
r99ptot_r <- rast(r99ptot[c(1:19, 21)])

# Rename Raster Layers (Models) ------------------------------------------------
model_names <- c("R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR",
                 "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
                 "R4F:NOR-ESM-2", "R4F:UKESM-1", "CAN-ESM-5", "CNRM-CM-6",
                 "CNRM-ESM-2", "EC-EARTH3", "  EMO-1", " E-OBS",
                 "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR",
                 "MRI-ESM-2-0", "UK-ESM-1")

names(r99p_r)     <- model_names
names(r99ptot_r)  <- model_names

# Convert Raster Data to Long Format -------------------------------------------
r99p_r_df <- as.data.frame(r99p_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = model_names, names_to = "Layer", values_to = "Value")

r99ptot_r_df <- as.data.frame(r99ptot_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = model_names, names_to = "Layer", values_to = "Value")

# Inspect Value Distribution ---------------------------------------------------
summary(r99p_r_df)
summary(r99ptot_r_df)

# Define Binning Thresholds for Classification ---------------------------------
breaks <- c(0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50)

# Create Classified Bins for R99p ----------------------------------------------
r99p_r_df <- r99p_r_df %>%
  mutate(Value_bin = cut(Value,
                         breaks = breaks,
                         include.lowest = TRUE,
                         right = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

# Visualize R99p Index ---------------------------------------------------------
ggplot() +
  geom_raster(data = r99p_r_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "RdYlBu") +
  theme_minimal() +
  xlab("Longitudine") + ylab("Latitudine") +
  labs(title = "Frequency of Very Wet Days (>99th Percentile, 1990–2014)",
       fill = "Frequency (%)") +
  theme(legend.position = "bottom",
        plot.title = element_text(hjust = 0.5))

# Zonal Statistics for R99p ----------------------------------------------------
r99p_r_zs_mean <- round(terra::extract(r99p_r, basins, fun = mean, na.rm = TRUE), 1)
r99p_r_zs_max  <- terra::extract(r99p_r, basins, fun = max, na.rm = TRUE)
r99p_r_zs_min  <- terra::extract(r99p_r, basins, fun = min, na.rm = TRUE)

# Visualize R99pTOT Index ------------------------------------------------------
# (Note: Reusing same breaks and color scale; can be customized)
r99ptot_r_df <- r99ptot_r_df %>%
  mutate(Value_bin = cut(Value,
                         breaks = breaks,
                         include.lowest = TRUE,
                         right = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

ggplot() +
  geom_raster(data = r99ptot_r_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "RdYlBu") +
  theme_minimal() +
  xlab("Longitudine") + ylab("Latitudine") +
  labs(title = "Total Precipitation on Very Wet Days (1990–2014)",
       fill = "Precipitation [mm]") +
  theme(legend.position = "bottom",
        plot.title = element_text(hjust = 0.5))

# Zonal Statistics for R99pTOT -------------------------------------------------
r99ptot_r_zs_mean <- round(terra::extract(r99ptot_r, basins, fun = mean, na.rm = TRUE), 1)
r99ptot_r_zs_max  <- terra::extract(r99ptot_r, basins, fun = max, na.rm = TRUE)
r99ptot_r_zs_min  <- terra::extract(r99ptot_r, basins, fun = min, na.rm = TRUE)

# View Zonal Statistics --------------------------------------------------------
t(r99p_r_zs_mean[, 2:21])
t(r99p_r_zs_max[, 2:21])
t(r99p_r_zs_min[, 2:21])

# End of script ----------------------------------------------------------------
