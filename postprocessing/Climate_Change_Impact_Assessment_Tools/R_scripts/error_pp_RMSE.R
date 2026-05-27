# ==============================================================================
# Title      : Root Mean Square Error (RMSE) of Daily Precipitation
# Description: This script extracts, processes, and visualizes the Root Mean 
#              Square Error (RMSE) of daily precipitation values from multiple 
#              climate model outputs relative to observed data for a period.
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

# Load Pilot Basin Shapefile ----------------------------------------------------
basins <- st_read("path_to_pilot_basins") 


# Load All RMSE Raster Files ----------------------------------------------------
rmse <- list.files(full.names = TRUE, pattern = ".tif$")  # List all RMSE rasters
rmse_r <- rast(rmse)                                     # Stack into a SpatRaster object

# Assign Descriptive Names to Raster Layers (One per Model) ---------------------
names(rmse_r) <- c(
  "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR",
  "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
  "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5", "CNRM-CM6",
  "CNRM-ESM-2", "EC-EARTH-3", "GFDL-ESM-4",
  "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1"
)

# Convert Raster Data to a Long Format Data Frame --------------------------------
# This enables plotting and analysis per model
rmse_r_df <- as.data.frame(rmse_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -c(x, y), names_to = "Model", values_to = "rmse")

# Compute Zonal Statistics for Each Basin ---------------------------------------
# Mean, Max, and Min RMSE values per basin across each model
rmse_r_zs_mean <- t(round(terra::extract(rmse_r, bazine, fun = mean, na.rm = TRUE), 2))
rmse_r_zs_max  <- t(round(terra::extract(rmse_r, bazine, fun = max,  na.rm = TRUE), 2))
rmse_r_zs_min  <- t(round(terra::extract(rmse_r, bazine, fun = min,  na.rm = TRUE), 2))

# Define Classification Bins for RMSE Values -------------------------------------
# These bins help group RMSE values into meaningful visual categories
summary(rmse_r_df)  # Inspect data distribution before binning
breaks <- c(1.5, 2, 3, 4, 5, 6, 7, 10, 13, 16, 20)

# Create a Binned Factor Variable for Plotting -----------------------------------
rmse_r_df <- rmse_r_df %>%
  mutate(
    Value_bin = cut(
      rmse,
      breaks = breaks,
      include.lowest = TRUE,
      labels = paste(head(breaks, -1), breaks[-1], sep = "–")
    )
  )

# Generate Spatial Plot of RMSE per Model ----------------------------------------
# Faceted plot shows RMSE distribution for each model across the study area
ggplot() +
  geom_raster(data = rmse_r_df, aes(x = x, y = y, fill = Value_bin)) +  
  geom_sf(data = bazine, fill = NA, color = "black") +                  
  facet_wrap(~ Model, ncol = 4) +                                       
  scale_fill_brewer(palette = "Spectral", direction = -1) +            
  theme_minimal() +
  labs(
    title = "Root Mean Square Error of Daily Precipitation (1990–2014)",
    fill = "RMSE",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(
    legend.position = "bottom",
    plot.title = element_text(hjust = 0.5)
  )

# End of script ----------------------------------------------------------------