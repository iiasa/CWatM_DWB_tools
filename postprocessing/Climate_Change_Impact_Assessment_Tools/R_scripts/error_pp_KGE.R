# ==============================================================================
# Title      : KGE Analysis (Kling-Gupta Efficiency)
# Description: This script extracts, processes, and visualizes the Kling-Gupta 
#              Efficiency (KGE) of simulated daily precipitation from multiple 
#              climate models over pilot basins.
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

# Load Raster Files (KGE Outputs from Climate Models) ---------------------------
kge <- list.files(full.names = TRUE, pattern = ".tif$")
kge_r <- rast(kge)  # Load all raster layers into a SpatRaster object
names(kge_r)        # View layer names

# Rename Raster Layers with Corresponding Model Names ---------------------------
names(kge_r) <- c(
  "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR",
  "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
  "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5", "CNRM-CM6",
  "CNRM-ESM-2", "EC-EARTH-3", "GFDL-ESM-4",
  "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1"
)

# Convert Raster Data to Long Format Data Frame ---------------------------------
kge_r_df <- as.data.frame(kge_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = -c(x, y), names_to = "Model", values_to = "KGE")

# Zonal statistics for pilot basins  ----------------------------
kge_r_zs_mean <- t(round(terra::extract(kge_r, basins, fun = mean, na.rm = TRUE), 2))
kge_r_zs_max  <- t(round(terra::extract(kge_r, basins, fun = max,  na.rm = TRUE), 2))
kge_r_zs_min  <- t(round(terra::extract(kge_r, basins, fun = min,  na.rm = TRUE), 2))

# Define Bins for Classification ------------------------------------------------
# Bins represent ranges of KGE performance; adjust if necessary
breaks <- c(-1, -0.4, -0.1, 0, 0.05, 0.1)

kge_r_df <- kge_r_df %>%
  mutate(Value_bin = cut(
    KGE,
    breaks = breaks,
    include.lowest = TRUE,
    labels = paste(head(breaks, -1), breaks[-1], sep = "–"))
  )

# Visualize KGE Values Across Models --------------------------------------------
ggplot() +
  geom_raster(data = kge_r_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Model, ncol = 4) +
  scale_fill_brewer(palette = "Spectral") +
  theme_minimal() +
  labs(
    title = "Kling-Gupta Efficiency of Daily Precipitation (1990–2014)",
    fill = "KGE",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(
    legend.position = "bottom",
    plot.title = element_text(hjust = 0.5)
  )

# End of script ----------------------------------------------------------------