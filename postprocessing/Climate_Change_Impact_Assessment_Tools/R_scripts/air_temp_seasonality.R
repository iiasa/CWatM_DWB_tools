# ==============================================================================
# Title      : Seasonal Air Temperature Analysis
# Description: Computes seasonal means from daily NetCDFs, extracts stats by basin,
# and plots spatial temperature distributions per season.
# Author     : NIHWM RO
# ==============================================================================

# 1. Load Libraries ------------------------------------------------------------
library(terra)        
library(sf)           
library(ggplot2)      
library(dplyr)        
library(tidyr)        
library(RColorBrewer) 
library(viridis)      

# Set Paths and Read Auxiliary Data -----------------------------------------
setwd("path_to_data")              # Folder with daily NetCDFs
basins <- st_read("path_to_pilot_basins") # Pilot basins (vector polygons)

# List Daily NetCDF Files ------------------------------------------------
seasonal <- list.files(full.names = TRUE, pattern = "\\.nc$")

# Loop over Models: build seasonal means and write new NetCDFs --------------
for (i in seq_along(seasonal)) {
  
  # Load full daily time‑series as a SpatRaster
  model <- rast(seasonal[i])
  
  # Clean filename to use in output name
  name_nc <- basename(seasonal[i])
  
  # --- Extract seasonal subsets (DJF, MAM, JJA, SON) --------------------------
  # The daily NetCDF is assumed to have one layer per day, ordered chronologically.
  # Layers are selected with a step of 4, starting at:
  #   1 = winter (DJF), 2 = spring (MAM), 3 = summer (JJA), 4 = autumn (SON)
  #   Repeats every 4 layers for 25 years (25*4 = 100), hence seq(..., by = 4)
  model_w  <- mean(model[[seq(1, 101, by = 4)]]) # DJF
  model_sp <- mean(model[[seq(2, 101, by = 4)]]) # MAM
  model_su <- mean(model[[seq(3, 101, by = 4)]]) # JJA
  model_au <- mean(model[[seq(4, 101, by = 4)]]) # SON
  
  # Combine seasonal layers into one SpatRaster
  seas <- c(model_w, model_sp, model_su, model_au)
  names(seas) <- c("winter", "spring", "summer", "autumn")
  
  # Write the 4‑layer seasonal raster to disk
  writeCDF(
    x        = seas,
    filename = file.path("./multi", name_nc),
    varname  = "seasonal",
    overwrite = TRUE
  )
}

# Load All Seasonal Rasters into a Single Stack ------------------------------
seasonal_m <- list.files(path = "./multi/", full.names = TRUE, pattern = "\\.nc$")
seas_r     <- rast(seasonal_m)

# Assign Human‑Readable Layer Names -----------------------------------------
# Each model contributes 4 layers (winter, spring, summer, autumn) in this exact order
layer_names <- rep(
  c("CAN-ESM-5", "CNRM-CM6", "CNRM-ESM-2", "EC-EARTH3",
    "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR",
    "MRI-ESM-2-0", "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG",
    "R4F:IPSL-CM6A-LR", "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR",
    "R4F:MPI-ESM-1-2-LR", "R4F:NOR-ESM-2", "R4F:UK-ESM-1",
    "  EMO-1", " E-OBS", "UK-ESM-1"),
  each = 4
)
names(seas_r) <- layer_names

# Split Stack by Season ------------------------------------------------------
seas_r_winter <- seas_r[[seq(1, nlyr(seas_r), by = 4)]]
seas_r_spring <- seas_r[[seq(2, nlyr(seas_r), by = 4)]]
seas_r_summer <- seas_r[[seq(3, nlyr(seas_r), by = 4)]]
seas_r_autumn <- seas_r[[seq(4, nlyr(seas_r), by = 4)]]

# Convert to Long DataFrame for Plotting ------------------------------------
to_long_df <- function(r) {
  as.data.frame(r, xy = TRUE, na.rm = TRUE) |>
    pivot_longer(cols = -c(x, y), names_to = "Model", values_to = "Temp")
}

seas_df_wint <- to_long_df(seas_r_winter)
seas_df_spr  <- to_long_df(seas_r_spring)
seas_df_sum  <- to_long_df(seas_r_summer)
seas_df_aut  <- to_long_df(seas_r_autumn)

# Zonal Statistics for Each Basin -------------------------------------------
# Returns matrices with basins in rows, models in columns (transposed for easier reading)
extract_stats <- function(r, stat_fun) {
  t(round(terra::extract(r, basins, fun = stat_fun, na.rm = TRUE), 1))
}

zs <- list(
  winter_mean = extract_stats(seas_r_winter, mean), # Winter
  winter_max  = extract_stats(seas_r_winter, max),
  winter_min  = extract_stats(seas_r_winter, min),
  
  spring_mean = extract_stats(seas_r_spring, mean), # Spring
  spring_max  = extract_stats(seas_r_spring, max),
  spring_min  = extract_stats(seas_r_spring, min),
  
  summer_mean = extract_stats(seas_r_summer, mean), # Summer
  summer_max  = extract_stats(seas_r_summer, max),
  summer_min  = extract_stats(seas_r_summer, min),
  
  autumn_mean = extract_stats(seas_r_autumn, mean), # Winter
  autumn_max  = extract_stats(seas_r_autumn, max),
  autumn_min  = extract_stats(seas_r_autumn, min)
)

# Classify temperature values into bins ----------------------------
bin_and_plot <- function(df, breaks, title, palette) {
  
  # Discretise temperatures
  df <- df |>
    mutate(
      Value_bin = cut(
        Temp,
        breaks = breaks,
        include.lowest = TRUE,
        labels = paste(head(breaks, -1), breaks[-1], sep = "–")
      )
    )
  
  # Build ggplot
  ggplot() +
    geom_raster(data = df, aes(x = x, y = y, fill = Value_bin)) +
    geom_sf(data = basins, fill = NA, colour = "black") +
    facet_wrap(~ Model, ncol = 4) +
    { if (palette == "viridis") scale_fill_viridis_d(option = "viridis")
      else scale_fill_brewer(palette = palette, direction = -1) } +
    labs(
      title = title,
      fill  = "Mean Air Temperature [°C]",
      x = "Longitude", y = "Latitude"
    ) +
    theme_minimal() +
    theme(
      legend.position = "bottom",
      plot.title = element_text(hjust = 0.5)
    )
}

# Plot Seasonal Maps --------------------------------------------------------
# Winter
bin_and_plot(
  seas_df_wint,
  breaks = c(-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10, 12.5),
  title  = "Mean Air Temperature – Winter (1990–2014)",
  palette = "viridis"
)

# Spring
bin_and_plot(
  seas_df_spr,
  breaks = c(-5, -2.5, 0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5),
  title  = "Mean Air Temperature – Spring (1990–2014)",
  palette = "YlGnBu"
)

# Summer
bin_and_plot(
  seas_df_sum,
  breaks = c(0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5),
  title  = "Mean Air Temperature – Summer (1990–2014)",
  palette = "Spectral"
)

# Autumn
bin_and_plot(
  seas_df_aut,
  breaks = c(0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20),
  title  = "Mean Air Temperature – Autumn (1990–2014)",
  palette = "Spectral"
)

# End of script ----------------------------------------------------------------
