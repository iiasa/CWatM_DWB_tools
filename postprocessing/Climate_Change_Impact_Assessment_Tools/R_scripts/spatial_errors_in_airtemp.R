# ====================================================
# Title      : Temperature Error Metrics
# Description: Calculates RMSE, MBE, MAE, and KGE for daily temperature
#              compared to EMO-1 reference model.
# Author     : NIHWM RO
# ====================================================

# Load Required Libraries
library(terra)
library(sf)
library(dplyr)

# Set working directory and list NetCDF files
setwd("path_to_data")
fisiere_nc <- list.files(full.names = TRUE, pattern = ".nc$")
fisiere_nc <- fisiere_nc[c(1:17, 20)]
names <- gsub("./|.nc$", "", fisiere_nc)

# Load EMO-1 reference model
tas_emo <- rast("tas_EMO-1-regr05_1990_2014.nc")

# Define Kling-Gupta Efficiency function
kge_fun <- function(v) {
  sim <- v[1:nt]
  obs <- v[(nt + 1):(2 * nt)]
  if (all(is.na(sim)) || all(is.na(obs))) return(NA)
  r     <- cor(sim, obs, use = "pairwise.complete.obs")
  beta  <- mean(sim, na.rm = TRUE) / mean(obs, na.rm = TRUE)
  gamma <- (sd(sim, na.rm = TRUE) / mean(sim, na.rm = TRUE)) / 
    (sd(obs, na.rm = TRUE) / mean(obs, na.rm = TRUE))
  1 - sqrt((r - 1)^2 + (beta - 1)^2 + (gamma - 1)^2)
}

# Loop through models
for (g in 1:length(fisiere_nc)) {
  tas_model <- rast(fisiere_nc[g])
  nt <- nlyr(tas_model)
  
  # RMSE
  rmse_map <- sqrt(app((tas_model - tas_emo)^2, mean, na.rm = TRUE))
  writeRaster(rmse_map, paste0("./RMSE/rmse_", names[g], ".tif"), overwrite = TRUE)
  
  # MBE
  mbe_map <- app(tas_model - tas_emo, mean, na.rm = TRUE)
  writeRaster(mbe_map, paste0("./MBE/mbe_", names[g], ".tif"), overwrite = TRUE)
  
  # MAE
  mae_map <- app(abs(tas_model - tas_emo), mean, na.rm = TRUE)
  writeRaster(mae_map, paste0("./MAE/mae_", names[g], ".tif"), overwrite = TRUE)
  
  # KGE
  stack_all <- c(tas_model, tas_emo)
  kge_map <- app(stack_all, kge_fun)
  writeRaster(kge_map, paste0("./KGE_error/KGE_", names[g], ".tif"), overwrite = TRUE)
}

# Compare spatial structure
compareGeom(tas_model, tas_emo)

# End of script ----------------------------------------------------------------
