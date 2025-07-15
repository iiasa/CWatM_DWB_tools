# ==============================================================================
# Title      : Analysis of Days with Precipitation > 20 mm
# Description: This script processes NetCDF files representing the number of 
#              days per year with precipitation over 20 mm.
# Author: NIHWM RO
# ==============================================================================

# Load Required Libraries -------------------------------------------------------
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)
library(raster)
library(terra)

# Set Working Directory and Load Pilot Basins -----------------------------------
setwd("path_to_data")
basins <- st_read("path_to_pilot_basins")

# Read NetCDF Files -------------------------------------------------------------
r20mm <- list.files(full.names = TRUE, pattern = ".nc$")

# Generate output names for conversion
name <- gsub("./|.nc", "", r20mm)

# Convert NetCDF to GeoTIFF -----------------------------------------------------
for (h in 1:length(r20mm)) {
  rast_tif <- raster(r20mm[h])
  writeRaster(rast_tif, paste0("./TIFF/", name[h], ".tif"), overwrite = TRUE)
}

# Load GeoTIFF Files into Raster Stack ------------------------------------------
r20mm <- list.files(path = "./TIFF", full.names = TRUE, pattern = "\\.tif$")
r20mm_r <- rast(r20mm)

# Assign Descriptive Names to Raster Layers -------------------------------------
names(r20mm_r) <- c("R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR", 
                    "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
                    "R4F:NOR-ESM-2", "R4F:UKESM-1", "CAN-ESM-5",         
                    "CNRM-CM-6", "CNRM-ESM-2", "EC-EARTH3", "  EMO-1", " E-OBS", 
                    "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR",     
                    "MRI-ESM-2-0", "UK-ESM-1")

# Convert Raster Stack to Long DataFrame ----------------------------------------
r20mm_r_df <- as.data.frame(r20mm_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = "R4F:CNRM-ESM2-1":"UK-ESM-1", names_to = "Model", values_to = "Value")

# Inspect Data Summary ----------------------------------------------------------
summary(r20mm_r_df)

# Define Classification Bins for Plotting ---------------------------------------
breaks <- c(0, 20, 40, 80, 100, 200, 300, 500, 1000, 1150)

# Apply Binning to Values -------------------------------------------------------
r20mm_r_df <- r20mm_r_df %>%
  mutate(Value_bin = cut(Value,
                         breaks = breaks,
                         include.lowest = TRUE,
                         right = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

# Spatial Visualization Using Faceted Map per Model -----------------------------
ggplot() +
  geom_raster(data = r20mm_r_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Model, ncol = 4) +
  scale_fill_brewer(palette = "Set1") +
  theme_minimal() +
  xlab("Longitude") + ylab("Latitude") +
  labs(
    title = "Number of Days with Precipitation > 20 mm/day (1990–2014)",
    fill = "No. of Days"
  ) +
  theme(
    legend.position = "bottom",
    plot.title = element_text(hjust = 0.5)
  )

# Compute Zonal Statistics for Each Basin ---------------------------------------
r20mm_zs_mean <- t(round(terra::extract(r20mm_r, basins, fun = mean, na.rm = TRUE), 1))
r20mm_zs_max  <- t(round(terra::extract(r20mm_r, basins, fun = max, na.rm = TRUE), 1))
r20mm_zs_min  <- t(round(terra::extract(r20mm_r, basins, fun = min, na.rm = TRUE), 1))


# End of script ----------------------------------------------------------------
