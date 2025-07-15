# ==============================================================================
# Title      : Mean Bias Error (MBE) of Daily Precipitation
# Description: This script extracts, processes, and visualizes the Mean Bias 
#              Error (MBE) of simulated daily precipitation from multiple 
#              climate models over a defined spatial domain (pilot basins).
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

# Load All Raster Files (One per Model) -----------------------------------------
mbe <- list.files(full.names = TRUE, pattern = ".tif$")  # List all .tif raster files
mbe_r <- rast(mbe)  # Create a SpatRaster stack from the listed files

# Assign Descriptive Model Names to Raster Layers -------------------------------
# Ensures each layer is properly labeled by its corresponding climate model
names(mbe_r) <- c(
  "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR",
  "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
  "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5", "CNRM-CM6",
  "CNRM-ESM-2", "EC-EARTH-3", "GFDL-ESM-4",
  "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1"
)

# Convert Raster Stack to Long Format Data Frame --------------------------------
# This format is suitable for faceted plotting and further data manipulation
mbe_r_df <- as.data.frame(mbe_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -c(x, y), names_to = "Model", values_to = "mbe")

# Compute Zonal Statistics (Mean, Max, Min) -------------------------------------
# Extract statistics over each basin polygon for each model raster
mbe_r_zs_mean <- t(round(terra::extract(mbe_r, bazine, fun = mean, na.rm = TRUE), 2))
mbe_r_zs_max  <- t(round(terra::extract(mbe_r, bazine, fun = max,  na.rm = TRUE), 2))
mbe_r_zs_min  <- t(round(terra::extract(mbe_r, bazine, fun = min,  na.rm = TRUE), 2))

# Define Classification Bins for Visualization ----------------------------------
# Bins are chosen based on value ranges and distribution of MBE
# Modify as needed based on summary statistics
summary(mbe_r_df)
breaks <- c(-1.6, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 5)

# Create a Factor Variable for Discrete Color Mapping ---------------------------
mbe_r_df <- mbe_r_df %>%
  mutate(
    Value_bin = cut(
      mbe,
      breaks = breaks,
      include.lowest = TRUE,
      labels = paste(head(breaks, -1), breaks[-1], sep = "–")
    )
  )

# Plot Spatial Distribution of MBE per Model ------------------------------------
# Each raster layer is visualized using facets for side-by-side model comparison
ggplot() +
  geom_raster(data = mbe_r_df, aes(x = x, y = y, fill = Value_bin)) +  
  geom_sf(data = bazine, fill = NA, color = "black") +                 
  facet_wrap(~ Model, ncol = 4) +                                      
  scale_fill_brewer(palette = "Set1") +                                
  theme_minimal() +
  labs(
    title = "Mean Bias Error of Daily Precipitation (1990–2014)",
    fill = "MBE",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(
    legend.position = "bottom",
    plot.title = element_text(hjust = 0.5)
  )

# End of script ----------------------------------------------------------------