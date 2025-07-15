# ==============================================================================
# Title      : Multiannual Mean Monthly Precipitation
# Description: This script calculates and visualizes the multiannual monthly 
#              precipitation over the Danube and pilot basins based on multiple 
#              climate models.
# Author: NIHWM RO
# ==============================================================================

# Load Required Libraries -------------------------------------------------------
library(terra)
library(sf)
library(ggplot2)
library(dplyr)
library(tidyr)
library(RColorBrewer)

# Set Working Directory and Load Basin Shapefile --------------------------------
setwd("path_to_data")
basins <- st_read("path_to_pilot_basins")

# Load Monthly Precipitation Raster Files ---------------------------------------
ympr <- list.files(full.names = TRUE, pattern = ".nc$")
ympr_r <- rast(ympr[c(1:19, 21)])  # Excluding one problematic file

# Define Model Names and Assign to Raster Layers --------------------------------
models <- c("R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", "R4F:IPSL-CM6A-LR", 
            "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", "R4F:MPI-ESM-1-2-LR",
            "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5",         
            "CNRM-CM-6", "CNRM-ESM-2", "EC-EARTH3", "  EMO-1", " E-OBS", 
            "GFDL-ESM-4", "IPSL-CM-6-ALR", "MIROC-6", "MPI-ESM-1-HR",     
            "MRI-ESM-2-0", "UK-ESM-1")

replicated_models <- rep(models, each = 12)  # 12 months per model
names(ympr_r) <- replicated_models

# Convert Raster Stack to Long Data Frame ---------------------------------------
ympr_r_df <- as.data.frame(ympr_r, xy = TRUE, na.rm = TRUE) %>%
  pivot_longer(cols = models, names_to = "Model", values_to = "Precip")

# Extract Zonal Mean Monthly Precipitation Per Basin ----------------------------
yrm_pr_r_zs_mean <- round(terra::extract(ympr_r, basins, fun = mean, na.rm = TRUE), 1)
yrm_pr_r_zs_mean <- as.data.frame(t(yrm_pr_r_zs_mean))[2:241, ]  # Remove ID row
colnames(yrm_pr_r_zs_mean) <- c("DanubeRB", "TisaRB", "MoravaRB", "Upper SavaRB", "DrinaRB")
yrm_pr_r_zs_mean$Model <- replicated_models
yrm_pr_r_zs_mean$Month <- rep(month.abb, times = length(models))
rownames(yrm_pr_r_zs_mean) <- NULL

# Reshape to Long Format for Plotting -------------------------------------------
yrm_pr_r_zs_mean_long <- yrm_pr_r_zs_mean %>%
  pivot_longer(cols = c("DanubeRB", "TisaRB", "MoravaRB", "Upper SavaRB", "DrinaRB"),
               names_to = "Basins", values_to = "Precip")

# Reorder Model Factor Levels for Consistent Plotting ---------------------------
yrm_pr_r_zs_mean_long$Model <- factor(yrm_pr_r_zs_mean_long$Model,
                                      levels = c("  EMO-1", " E-OBS", "R4F:CNRM-ESM2-1", "R4F:EC-EARTH3-VEG", 
                                                 "R4F:IPSL-CM6A-LR", "R4F:MIROC-6", "R4F:MPI-ESM-1-2-HR", 
                                                 "R4F:MPI-ESM-1-2-LR", "R4F:NOR-ESM-2", "R4F:UK-ESM-1", "CAN-ESM-5", 
                                                 "CNRM-CM-6", "CNRM-ESM-2", "EC-EARTH3", "GFDL-ESM-4", "IPSL-CM-6-ALR", 
                                                 "MIROC-6", "MPI-ESM-1-HR", "MRI-ESM-2-0", "UK-ESM-1"))

# Reorder Months to Hydrological Year Format ------------------------------------
yrm_pr_r_zs_mean_long$Month <- factor(yrm_pr_r_zs_mean_long$Month,
                                      levels = c("Sep", "Oct", "Nov", "Dec", "Jan", "Feb", 
                                                 "Mar", "Apr", "May", "Jun", "Jul", "Aug"),
                                      ordered = TRUE)

# Highlight Observed and Reference Models with Line Thickness -------------------
yrm_pr_r_zs_mean_long$line_weight <- ifelse(yrm_pr_r_zs_mean_long$Model %in% c("  EMO-1", " E-OBS"), 
                                            1.25, 0.5)

# Plot Multiannual Monthly Precipitation Trends ---------------------------------
ggplot(data = yrm_pr_r_zs_mean_long, 
       aes(x = Month, y = Precip, color = Model, size = line_weight,
           group = interaction(Model, Basins))) +
  geom_line() +
  scale_size_identity() +
  scale_x_discrete(expand = c(0, 0)) +
  scale_y_continuous(breaks = function(x) seq(0, ceiling(max(x, na.rm = TRUE) / 10) * 10, by = 10),
                     expand = expansion(mult = c(0, 0.05))) +
  facet_wrap(~ Basins, ncol = 2, scales = "free_y") +
  labs(
    title = "Multiannual Mean Monthly Precipitation in the Danube and Pilot Basins (1990–2014)",
    y = "Precipitation [mm/month]"
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

# Export Data to CSV ------------------------------------------------------------
write.csv(yrm_pr_r_zs_mean_long, "multiannual_mean_monthly_precipitation.csv", row.names = FALSE)

# End of script ----------------------------------------------------------------
