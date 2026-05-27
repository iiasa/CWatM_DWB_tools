# ==============================================================================
# Title      : Index of Moderate Wet Days
# Description: This script extracts, processes, classifies, and visualizes the 
#              R75p index from multiple climate models. R75p represents the 
#              percentage of wet days (≥1 mm) where precipitation exceeds the 
#              75th percentile of a reference 30-year period.
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

# Load Raster Files from NetCDF -------------------------------------------------
r75p <- list.files(full.names = TRUE, pattern = ".nc$")       # Get all NetCDF file paths
r75p_r <- rast(r75p[c(1:19, 21)])                             # Read selected raster layers (exclude index 20)
names(r75p_r)                                                 # Inspect variable names

# R75p Description --------------------------------------------------------------
# Represents the percent of wet days (≥1 mm/day) that exceed the 75th percentile
# threshold based on a historical 30-year reference period.

# Rename Raster Layers by Model Name -------------------------------------------
names(r75p_r) <- c("R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR", 
                   "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
                   "R4F:NOR-ESM-2", "R4F:UKESM-1", "CAN-ESM-5",         
                   "CNRM-CM-6", "CNRM-ESM-2", "EC-EARTH3", "  EMO-1", " E-OBS", 
                   "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR",     
                   "MRI-ESM-2-0", "UK-ESM-1")

# Convert Raster Stack to Long Format Data Frame --------------------------------
r75p_r_df <- as.data.frame(r75p_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = "R4F:CNRM-ESM2-1":"UK-ESM-1", names_to = "Layer", values_to = "Value")

# Inspect Summary Statistics ----------------------------------------------------
summary(r75p_r_df)

# Define Classification Breaks for Binning --------------------------------------
# These should reflect the distribution of R75p values (in %)
# FIXED SYNTAX ERROR: Removed extra comma between 10 and 200
breaks <- c(0, 2.5, 5, 7.5, 10, 200, 500, 1000, 1250)

# Create Categorical Bins for Color Mapping -------------------------------------
r75p_r_df <- r75p_r_df %>%
  mutate(Value_bin = cut(Value,
                         breaks = breaks,
                         include.lowest = TRUE,
                         right = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

# Recheck Summary After Binning -------------------------------------------------
summary(r75p_r_df)

# Plot Raster Layers by Model (Faceted Layout) ----------------------------------
ggplot() +
  geom_raster(data = r75p_r_df, aes(x = x, y = y, fill = Value_bin)) +  
  geom_sf(data = basins, fill = NA, color = "black") +                 
  facet_wrap(~ Layer, ncol = 4) +                                      
  scale_fill_brewer(palette = "Set3") +                                
  theme_minimal() +
  xlab("Longitudine") + ylab("Latitudine") +
  labs(title = "Total Number of Precipitation Days Index (1990–2014)", 
       fill = "No. of Intervals With\nPrecipitation Above 75th Percentile") +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# Compute Zonal Statistics per Basin --------------------------------------------
# Extract mean, max, and min R75p values for each model over each basin
r75p_r_zs_mean <- round(terra::extract(r75p_r, basins, fun = mean, na.rm = TRUE), 1)
r75p_r_zs_max  <- terra::extract(r75p_r, basins, fun = max, na.rm = TRUE)
r75p_r_zs_min  <- terra::extract(r75p_r, basins, fun = min, na.rm = TRUE)

# Transpose Results to Match Models as Rows -------------------------------------
t(r75p_r_zs_mean[, 2:21])  # Mean values
t(r75p_r_zs_max[, 2:21])   # Max values
t(r75p_r_zs_min[, 2:21])   # Min values

# End of script ----------------------------------------------------------------