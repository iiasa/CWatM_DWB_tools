# ====================================================
# Title      : Precipitation Error Metrics
# Description: Calculates RMSE, MBE, MAE, and KGE for each model 
#              compared to EMO-1 precipitation reference.
# Author     : NIHWM RO
# ====================================================

# Load required libraries
library(terra)
library(sf)
library(dplyr)

# Set working directory
setwd("path_to_data")

# Load model files (excluding specific indices)
files <- list.files(full.names = TRUE, pattern = ".nc$")
files <- files[c(1:12,15:19,21)]

# Extract model names from file names
model_names <- gsub("./regr05_|.nc$", "", files)

# Load EMO-1 reference data
ref_model <- rast("./regr05_pr_EMO-1arcmin_1990_2014.nc")

# Define Kling-Gupta Efficiency function
kge_fun <- function(v) {
  sim <- v[1:nt]
  obs <- v[(nt+1):(2*nt)]
  if (all(is.na(sim)) || all(is.na(obs))) return(NA)
  r     <- cor(sim, obs, use = "pairwise.complete.obs")
  beta  <- mean(sim, na.rm = TRUE) / mean(obs, na.rm = TRUE)
  gamma <- (sd(sim, na.rm = TRUE) / mean(sim, na.rm = TRUE)) /
    (sd(obs, na.rm = TRUE) / mean(obs, na.rm = TRUE))
  1 - sqrt((r - 1)^2 + (beta - 1)^2 + (gamma - 1)^2)
}

# Loop through each model
for (g in 1:length(files)) {
  model <- rast(files[g])
  nt <- nlyr(model)
  
  # Root Mean Square Error
  rmse <- sqrt(app((model - ref_model)^2, fun = mean, na.rm = TRUE))
  writeRaster(rmse, paste0("./RMSE/rmse_", model_names[g], ".tif"), overwrite = TRUE)
  
  # Mean Bias Error
  mbe <- app(model - ref_model, fun = mean, na.rm = TRUE)
  writeRaster(mbe, paste0("./MBE/mbe_", model_names[g], ".tif"), overwrite = TRUE)
  
  # Mean Absolute Error
  mae <- app(abs(model - ref_model), fun = mean, na.rm = TRUE)
  writeRaster(mae, paste0("./MAE/mae_", model_names[g], ".tif"), overwrite = TRUE)
  
  # Kling-Gupta Efficiency
  kge <- app(c(model, ref_model), fun = kge_fun)
  writeRaster(kge, paste0("./KGE_error/KGE_", model_names[g], ".tif"), overwrite = TRUE)
}

# End of script ----------------------------------------------------------------