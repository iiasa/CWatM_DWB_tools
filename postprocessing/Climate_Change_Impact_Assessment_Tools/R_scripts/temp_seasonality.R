# ==============================================================================
# Title      : Seasonal Mean Air Temperature Analysis (1990–2014)
# Description: This script processes seasonal temperature from NetCDF files,
#              computes multiannual seasonal means (winter, spring, summer, autumn),
#              extracts zonal statistics by basin, and visualizes each season's
#              spatial distribution using facet plots.
#
# Author: NIHWM
# ==============================================================================

# Load Required Libraries -------------------------------------------------------
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)
library(viridis)

# Set Working Directory and Load Pilot Basins -----------------------------------
setwd("path_to_data")
basins <- st_read("path_to_pilot_basins")

# Load Seasonal NetCDF Files ----------------------------------------------------
seasonal <- list.files(full.names = TRUE, pattern = ".nc$")

# Compute Multiannual Mean for Each Season --------------------------------------
for (i in 1:length(seasonal)) {
  model <- rast(seasonal[i])
  name_nc <- gsub("\\./", "", seasonal[i])
  
  model_w <- mean(model[[seq(1, 101, by = 4)]])
  model_sp <- mean(model[[seq(2, 101, by = 4)]])
  model_sum <- mean(model[[seq(3, 101, by = 4)]])
  model_aut <- mean(model[[seq(4, 101, by = 4)]])
  
  seas <- c(model_w, model_sp, model_sum, model_aut)
  names(seas) <- c("winter", "spring", "summer", "autumn")
  
  writeCDF(seas,
           filename = paste0("./multi/", name_nc),
           varname = "seasonal",
           overwrite = TRUE)
}

# Read Back Aggregated Seasonal Files -------------------------------------------
seasonal_m <- list.files(path = "./multi/", full.names = TRUE, pattern = ".nc$")
seas_r <- rast(seasonal_m)

# Assign Correct Model Names ----------------------------------------------------
names(seas_r) <- rep(c("CAN-ESM-5", "CNRM-CM6", "CNRM-ESM-2", "EC-EARTH3",
                       "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR", 
                       "MRI-ESM-2-0", "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", 
                       "R4F:IPSL-CM6A-LR", "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", 
                       "R4F:MPI-ESM-1-2-LR", "R4F:NOR-ESM-2", "R4F:UK-ESM-1",
                       " EMO-1", " E-OBS", "UK-ESM-1"), each = 4)

# Split Raster Stack into Seasons -----------------------------------------------
seas_r_winter <- seas_r[[seq(1, dim(seas_r)[3], by = 4)]]
seas_r_spring <- seas_r[[seq(2, dim(seas_r)[3], by = 4)]]
seas_r_summer <- seas_r[[seq(3, dim(seas_r)[3], by = 4)]]
seas_r_autumn <- seas_r[[seq(4, dim(seas_r)[3], by = 4)]]

# Convert Rasters to Long Data Frame --------------------------------------------
seas_r_df_wint <- as.data.frame(seas_r_winter, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(-c(x, y), names_to = "Model", values_to = "Temp")

seas_r_df_spr <- as.data.frame(seas_r_spring, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(-c(x, y), names_to = "Model", values_to = "Temp")

seas_r_df_sum <- as.data.frame(seas_r_summer, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(-c(x, y), names_to = "Model", values_to = "Temp")

seas_r_df_autm <- as.data.frame(seas_r_autumn, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(-c(x, y), names_to = "Model", values_to = "Temp")

# Zonal Statistics for Each Season by Basin -------------------------------------
seas_r_winter_zs_mean <- t(round(extract(seas_r_winter, basins, mean, na.rm = TRUE), 1))
seas_r_winter_zs_max  <- t(round(extract(seas_r_winter, basins, max, na.rm = TRUE), 1))
seas_r_winter_zs_min  <- t(round(extract(seas_r_winter, basins, min, na.rm = TRUE), 1))

seas_r_spring_zs_mean <- t(round(extract(seas_r_spring, basins, mean, na.rm = TRUE), 1))
seas_r_spring_zs_max  <- t(round(extract(seas_r_spring, basins, max, na.rm = TRUE), 1))
seas_r_spring_zs_min  <- t(round(extract(seas_r_spring, basins, min, na.rm = TRUE), 1))

seas_r_summer_zs_mean <- t(round(extract(seas_r_summer, basins, mean, na.rm = TRUE), 1))
seas_r_summer_zs_max  <- t(round(extract(seas_r_summer, basins, max, na.rm = TRUE), 1))
seas_r_summer_zs_min  <- t(round(extract(seas_r_summer, basins, min, na.rm = TRUE), 1))

seas_r_autumn_zs_mean <- t(round(extract(seas_r_autumn, basins, mean, na.rm = TRUE), 1))
seas_r_autumn_zs_max  <- t(round(extract(seas_r_autumn, basins, max, na.rm = TRUE), 1))
seas_r_autumn_zs_min  <- t(round(extract(seas_r_autumn, basins, min, na.rm = TRUE), 1))

# Define Classification Bins and Plot Maps --------------------------------------

# --- Winter Plot ---
breaks <- c(-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10, 12.5)
seas_r_df_wint <- seas_r_df_wint %>%
  mutate(Value_bin = cut(Temp, breaks = breaks, include.lowest = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

ggplot() +
  geom_raster(data = seas_r_df_wint, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Model, ncol = 4) +
  scale_fill_viridis_d(option = "viridis") +
  theme_minimal() +
  labs(
    title = "Mean Air Temperature - Winter (1990–2014)",
    fill = "Mean Air Temperature\n [°C]",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# --- Spring Plot ---
breaks <- c(-5, -2.5, 0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5)
seas_r_df_spr <- seas_r_df_spr %>%
  mutate(Value_bin = cut(Temp, breaks = breaks, include.lowest = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

ggplot() +
  geom_raster(data = seas_r_df_spr, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Model, ncol = 4) +
  scale_fill_brewer(palette = "YlGnBu", direction = -1) +
  theme_minimal() +
  labs(
    title = "Mean Air Temperature - Spring (1990–2014)",
    fill = "Mean Air Temperature\n [°C]",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# --- Summer Plot ---
breaks <- c(0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5)
seas_r_df_sum <- seas_r_df_sum %>%
  mutate(Value_bin = cut(Temp, breaks = breaks, include.lowest = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

ggplot() +
  geom_raster(data = seas_r_df_sum, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Model, ncol = 4) +
  scale_fill_brewer(palette = "Spectral", direction = -1) +
  theme_minimal() +
  labs(
    title = "Mean Air Temperature - Summer (1990–2014)",
    fill = "Mean Air Temperature\n [°C]",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# --- Autumn Plot ---
breaks <- c(0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20)
seas_r_df_autm <- seas_r_df_autm %>%
  mutate(Value_bin = cut(Temp, breaks = breaks, include.lowest = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

ggplot() +
  geom_raster(data = seas_r_df_autm, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Model, ncol = 4) +
  scale_fill_brewer(palette = "Spectral", direction = -1) +
  theme_minimal() +
  labs(
    title = "Mean Air Temperature - Autumn (1990–2014)",
    fill = "Mean Air Temperature\n [°C]",
    x = "Longitude",
    y = "Latitude"
  ) +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# End of script ----------------------------------------------------------------
