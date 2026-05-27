# ==============================================================================
# Title      : Multiannual and Annual Precipitation Analysis
# Description: This script performs two main analyses:
#              1. Multiannual mean precipitation visualization and 
#                 zonal statistics over pilot basins
#              2. Annual precipitation trends per model and basin
# Author: NIHWM RO
# ==============================================================================

# Load Required Libraries -------------------------------------------------------
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set Working Directory and Load Spatial Data -----------------------------------
setwd("path_to_data")  # directory with ymean_pr NetCDF files
basins <- st_read("path_to_pilot_basins")  # pilot basin shapefile

# Load Multiannual Mean Precipitation Data --------------------------------------
ypr <- list.files(full.names = TRUE, pattern = ".nc$")
ypr_r <- rast(ypr[c(1:19, 21)])  # omit one problematic file if needed

# Assign Model Names to Raster Layers -------------------------------------------
names(ypr_r) <- c("R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR", 
                  "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
                  "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5",         
                  "CNRM-CM-6", "CNRM-ESM-2", "EC-EARTH3", "  EMO-1", " E-OBS", 
                  "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR",     
                  "MRI-ESM-2-0", "UK-ESM-1")

# Convert to Long Data Frame ----------------------------------------------------
ypr_r_df <- as.data.frame(ypr_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = names(ypr_r), names_to = "Layer", values_to = "Value")

# Inspect Distribution and Define Bins ------------------------------------------
summary(ypr_r_df)
breaks <- c(0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000)

ypr_r_df <- ypr_r_df %>%
  mutate(Value_bin = cut(Value, breaks = breaks, include.lowest = TRUE,
                         labels = paste(head(breaks, -1), breaks[-1], sep = "–")))

# Plot Multiannual Mean Precipitation -------------------------------------------
ggplot() +
  geom_raster(data = ypr_r_df, aes(x = x, y = y, fill = Value_bin)) +
  geom_sf(data = basins, fill = NA, color = "black") +
  facet_wrap(~ Layer, ncol = 4) +
  scale_fill_brewer(palette = "RdYlBu") +
  theme_minimal() +
  xlab("Longitudine") + ylab("Latitudine") +
  labs(title = "Multiannual Mean Precipitation (1990–2014)", 
       fill = "[mm/year]") +
  theme(legend.position = "bottom", plot.title = element_text(hjust = 0.5))

# Zonal Statistics (Mean, Max, Min) ---------------------------------------------
ypr_r_zs_mean <- round(terra::extract(ypr_r, basins, fun = mean, na.rm = TRUE), 1)
ypr_r_zs_max  <- round(terra::extract(ypr_r, basins, fun = max,  na.rm = TRUE), 1)
ypr_r_zs_min  <- round(terra::extract(ypr_r, basins, fun = min,  na.rm = TRUE), 1)

# View Transposed Tables of Zonal Statistics -------------------------------------
t(ypr_r_zs_mean[, 2:21])
t(ypr_r_zs_max[, 2:21])
t(ypr_r_zs_min[, 2:21])

# -------------------------------------------------------------------------------
# Load Annual Precipitation Data for Time Series Analysis
# -------------------------------------------------------------------------------
setwd("path_to_data")  # directory with sum_ypr NetCDF files
yr_pr <- list.files(full.names = TRUE, pattern = "\\.nc$")
yr_pr_r <- rast(yr_pr[c(1:19, 21)])

models <- c("R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR", 
            "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
            "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5",         
            "CNRM-CM-6", "CNRM-ESM-2", "EC-EARTH3", "  EMO-1", " E-OBS", 
            "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR",     
            "MRI-ESM-2-0", "UK-ESM-1")

replicated_models <- rep(models, each = 25)
years <- rep(1990:2014, times = 20)

names(yr_pr_r) <- replicated_models
yr_pr_r_zs_mean <- round(terra::extract(yr_pr_r, basins, fun = mean, na.rm = TRUE), 1)

# Reshape and Annotate Data -----------------------------------------------------
yr_pr_r_zs_mean <- as.data.frame(t(yr_pr_r_zs_mean))[2:501, ]
yr_pr_r_zs_mean$Year <- years
colnames(yr_pr_r_zs_mean) <- c("DanubeRB", "TisaRB", "MoravaRB", "Upper SavaRB", "DrinaRB", "Year")
yr_pr_r_zs_mean$Model <- replicated_models
rownames(yr_pr_r_zs_mean) <- NULL

# Convert to Long Format for Plotting -------------------------------------------
yr_pr_r_zs_mean_long <- yr_pr_r_zs_mean %>%
  pivot_longer(cols = c("DanubeRB", "TisaRB", "MoravaRB", "Upper SavaRB", "DrinaRB"),
               names_to = "basins", values_to = "Precip")

# Reorder Model Factor Levels and Assign Line Weights ---------------------------
yr_pr_r_zs_mean_long$Model <- factor(yr_pr_r_zs_mean_long$Model,
                                     levels = c("  EMO-1", " E-OBS", models[1:18]))

yr_pr_r_zs_mean_long$line_weight <- ifelse(yr_pr_r_zs_mean_long$Model %in% c("  EMO-1", " E-OBS"), 
                                           1.25, 0.5)

# Plot Annual Precipitation Trends ----------------------------------------------
ggplot(data = yr_pr_r_zs_mean_long, aes(x = Year, y = Precip, color = Model, size = line_weight)) +
  geom_line() +
  scale_size_identity() +
  facet_wrap(~ basins, ncol = 2, scales = "free_y") +
  labs(
    title = "Annual Mean Precipitation in the Danube and Pilot Basins (1990–2014)",
    y = "Precipitation [mm/year]"
  ) +
  theme_minimal() +
  theme(
    legend.position = c(0.8, 0.25),
    legend.justification = c(0.75, 1),  
    legend.box.just = "top",
    legend.key.height = unit(0.5, "cm"),
    legend.key.width = unit(1, "cm"),
    plot.margin = margin(10, 10, 10, 10),
    legend.text = element_text(size = 12),
    plot.title = element_text(hjust = 0.5, size = 16, face = "bold"),
    text = element_text(size = 12, face = "bold"),
    strip.text = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 12, face = "bold")
  ) +
  guides(
    color = guide_legend(
      ncol = 3, nrow = 7, byrow = TRUE,
      override.aes = list(size = 4, linetype = "solid")
    ),
    size = "none"
  )

# Export Zonal Statistics to CSV ------------------------------------------------
write.csv(yr_pr_r_zs_mean, "annual_precip_models.csv", row.names = FALSE)

# End of script ----------------------------------------------------------------
