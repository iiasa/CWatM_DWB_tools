# ============================================================
# FULL PIPELINE (2 datasets) ??? Soil moisture theta1/theta2
#
# Main tasks:
# - runs for BOTH directories: isimip + restore4life
# - plot titles come from Excel metadata: "River at Station"
# - stacked extremes plots:
#     ONLY 2 facets (ssp245, ssp585)
#     historical is OVERLAID in BOTH facets as background
# - also builds COMPARISON outputs: ISIMIP vs RESTORE4LIFE
#     for monthly, annual, boxplots, and extremes
# ============================================================

# Hide package startup messages to keep console output clean.
suppressPackageStartupMessages({
  library(terra)      # raster / NetCDF handling / polygon extraction
  library(sf)         # vector spatial data (shapefile reading)
  library(dplyr)      # data wrangling
  library(stringr)    # string operations
  library(ggplot2)    # plotting
  library(purrr)      # iteration helpers (map, map_dfr, etc.)
  library(ncdf4)      # low-level NetCDF reading, especially time dimension
  library(lubridate)  # date handling
  library(glue)       # readable string interpolation
  library(readr)      # CSV writing/reading
  library(readxl)     # Excel reading
  library(tidyr)      # pivoting, completion of missing combinations
})

# ---------------- USER PARAMETERS ----------------
# This section is intended for the user to edit easily.

# Path to the shapefile of the subcarchments.
shp_path <- ""

# Root directory containing input folders including a folder for each CC scenario
# output folders will be generated automatically to this path as well.
base_root <- ""

# Dataset directories.
# The code expects two subfolders under base_root:
#   - isimip
#   - restore4life
dataset_dirs <- c(
  isimip = file.path(base_root, "isimip"),
  restore4life = file.path(base_root, "restore4life")
)

# Expected NetCDF filenames present in BOTH dataset directories.
nc_filenames <- c(
  "hist_theta1[1]_monthavg.nc",
  "hist_theta2[1]_monthavg.nc",
  "wd1_ssp245_theta1[1]_monthavg.nc",
  "wd1_ssp245_theta2[1]_monthavg.nc",
  "wd1_ssp585_theta1[1]_monthavg.nc",
  "wd1_ssp585_theta2[1]_monthavg.nc"
)

# Optional variable name to select from NetCDF
# Only needed if a file contains multiple variables and you know which one to use.
var_name <- NULL

# Output folders:
# - out_root stores per-dataset results by subcatchment
# - compare_out_dir stores dataset comparison results
out_root <- file.path(base_root, "outputs_by_subcatchment__by_dataset")
compare_out_dir <- file.path(base_root, "outputs_compare__isimip_vs_restore4life")

# Last historical year, used for the dashed separator line in annual plots.
hist_end <- 2015

# Baseline period used for anomaly calculations in the extremes analysis.
baseline_start <- 1995
baseline_end   <- 2015

# Percentile thresholds for extremes.
# lower_pct = 0.05 means the lower 5% threshold
# upper_pct = 0.95 means the upper 95% threshold
lower_pct <- 0.05
upper_pct <- 1 - lower_pct

# ---- Excel lookup (ID -> River, Station) ----
# Excel metadata file path.
meta_xlsx  <- file.path(base_root, "qgis_76tisa_02res.xlsx")

# Excel sheet index or name.
meta_sheet <- 1

# Optional manual override for the ID field in the shapefile attribute table.
# Example: "ID", "Code", "SUB_ID"
id_field_override <- NULL

# ---------------- HELPER FUNCTIONS ----------------

sanitize_filename <- function(x) {
  # Convert an arbitrary text label into a file-safe string:
  # - replace invalid characters with "_"
  # - collapse repeated "_" characters
  # - remove leading/trailing "_"
  x %>%
    str_replace_all("[^A-Za-z0-9_\\-]+", "_") %>%
    str_replace_all("_+", "_") %>%
    str_replace("^_|_$", "")
}

theme_pub <- function() {
  # Shared plot theme used across all figures.
  theme_bw(base_size = 11) +
    theme(
      plot.title       = element_text(size = 13, face = "bold"),
      legend.position  = "bottom",
      panel.grid.minor = element_blank()
    )
}

save_plot <- function(p, path, w = 10, h = 5, dpi = 200) {
  # Save a ggplot object to disk.
  # The output directory is created automatically if needed.
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  ggsave(filename = path, plot = p, width = w, height = h, dpi = dpi)
}

parse_meta_from_filename <- function(nc_name) {
  # Extract metadata from each NetCDF filename:
  # - theta variable (theta1[1] or theta2[1])
  # - scenario (historical, ssp245, ssp585)
  tibble(
    nc_name   = nc_name,
    theta     = case_when(
      str_detect(nc_name, "theta1\\[1\\]") ~ "theta1[1]",
      str_detect(nc_name, "theta2\\[1\\]") ~ "theta2[1]",
      TRUE ~ NA_character_
    ),
    scenario  = case_when(
      str_detect(nc_name, "^hist_")  ~ "historical",
      str_detect(nc_name, "ssp245")  ~ "ssp245",
      str_detect(nc_name, "ssp585")  ~ "ssp585",
      TRUE ~ NA_character_
    )
  )
}

# NetCDF time reader ??? stable Date conversion (IMPORTANT)
get_nc_time_from_file <- function(nc_path) {
  # This function reads the time dimension directly from the NetCDF file
  # and converts it to proper Date objects.
  #
  # This is important because different NetCDF files may store time in
  # different units such as:
  #   - days since ...
  #   - hours since ...
  #   - seconds since ...
  #   - months since ...
  #   - years since ...
  
  nc <- nc_open(nc_path)
  on.exit(nc_close(nc))
  
  # Find the first dimension whose name contains "time".
  time_dim_name <- names(nc$dim)[grepl("time", names(nc$dim), ignore.case = TRUE)][1]
  if (is.na(time_dim_name)) stop("No time dimension found in: ", basename(nc_path))
  
  time_dim  <- nc$dim[[time_dim_name]]
  t_vals    <- as.vector(time_dim$vals)
  units_str <- time_dim$units
  
  # Expect unit strings like:
  #   "days since 1900-01-01"
  #   "months since 1950-01-01"
  if (is.null(units_str) || !grepl("since", units_str, ignore.case = TRUE)) {
    stop("Time units do not contain 'since' in: ", basename(nc_path), " | units='", units_str, "'")
  }
  
  # Split into:
  #   unit_part   = "days", "months", etc.
  #   origin_part = the origin date/time
  parts <- strsplit(units_str, "(?i)\\s+since\\s+", perl = TRUE)[[1]]
  unit_part   <- trimws(parts[1])
  origin_part <- trimws(parts[2])
  
  # Take the first token from the origin part as the date.
  origin_date_str <- strsplit(origin_part, "\\s+")[[1]][1]
  origin_date <- as.Date(origin_date_str)
  if (is.na(origin_date)) {
    stop("Could not parse origin date in: ", basename(nc_path), " | units='", units_str, "'")
  }
  
  # Convert raw time values into actual dates according to unit type.
  dates <- if (grepl("day", unit_part, ignore.case = TRUE)) {
    origin_date + as.integer(round(t_vals))
  } else if (grepl("hour", unit_part, ignore.case = TRUE)) {
    origin_date + as.integer(floor(t_vals / 24))
  } else if (grepl("sec", unit_part, ignore.case = TRUE)) {
    origin_date + as.integer(floor(t_vals / 86400))
  } else if (grepl("month", unit_part, ignore.case = TRUE)) {
    origin_date %m+% months(as.integer(round(t_vals)))
  } else if (grepl("year", unit_part, ignore.case = TRUE)) {
    origin_date %m+% years(as.integer(round(t_vals)))
  } else {
    # Fallback: treat values as days
    origin_date + as.integer(round(t_vals))
  }
  
  dates <- as.Date(dates)
  attr(dates, "dim") <- NULL
  dates
}

preload_nc_stack <- function(nc_paths, var_name = NULL) {
  # Read and preload all NetCDF files into memory once.
  # For each file, store:
  #   - file path
  #   - file name
  #   - raster stack
  #   - time vector
  #   - parsed metadata from filename
  map(nc_paths, function(p) {
    r <- terra::rast(p)
    
    # If a specific variable name is requested and exists, subset to it.
    if (!is.null(var_name) && var_name %in% names(r)) {
      r <- r[[var_name]]
    }
    
    # Read the time coordinate from the NetCDF file.
    tvec <- get_nc_time_from_file(p)
    
    # Safety check: number of time steps must match number of raster layers.
    if (length(tvec) != terra::nlyr(r)) {
      stop("Time length mismatch in ", basename(p),
           ": time=", length(tvec), " layers=", terra::nlyr(r))
    }
    
    meta <- parse_meta_from_filename(basename(p))
    list(path = p, name = basename(p), r = r, time = tvec, meta = meta)
  })
}

extract_one_polygon_all <- function(poly_idx, polys_v, nc_objs, dataset_name) {
  # Extract mean raster values for ONE polygon across ALL preloaded NetCDF objects.
  #
  # Inputs:
  #   poly_idx      = row index of the polygon
  #   polys_v       = polygon vector object
  #   nc_objs       = output from preload_nc_stack()
  #   dataset_name  = label such as "isimip" or "restore4life"
  #
  # Output:
  #   A long-format tibble with time series values for that polygon.
  
  poly <- polys_v[poly_idx, ]
  
  map_dfr(nc_objs, function(obj) {
    r <- obj$r
    
    # Reproject the polygon to match the raster CRS before extraction.
    poly_r <- terra::project(poly, terra::crs(r, proj = TRUE))
    
    # Extract polygon mean value for every raster layer.
    ex <- terra::extract(
      r, poly_r,
      fun   = mean,
      na.rm = TRUE,
      df    = TRUE
    )
    
    # Drop the first column (polygon ID returned by terra::extract)
    # and keep only the extracted values.
    vals <- as.numeric(ex[1, -1])
    time_date <- obj$time
    
    # Safety check: value vector length must match time vector length.
    if (length(time_date) != length(vals)) {
      stop("Extracted values length mismatch in ", obj$name,
           " (vals=", length(vals), ", time=", length(time_date), ")")
    }
    
    tibble(
      dataset   = dataset_name,
      time_date = time_date,
      value     = vals,
      nc_name   = obj$name
    ) %>%
      left_join(obj$meta, by = "nc_name") %>%
      mutate(
        month_date = floor_date(time_date, unit = "month"),
        year  = year(month_date),
        month = month(month_date)
      )
  })
}

# ---------------- EXCEL METADATA ----------------
# Expected columns in Excel:
#   ID, River, Station
# These are used to generate plot titles like:
#   "SomeRiver at SomeStation"
meta_tbl <- readxl::read_excel(meta_xlsx, sheet = meta_sheet) %>%
  transmute(
    ID      = as.character(ID),
    River   = as.character(River),
    Station = as.character(Station),
    title_label = glue("{River} at {Station}")
  )

# ---------------- SHAPEFILE LOADING ----------------
polys_sf <- st_read(shp_path, quiet = TRUE)
polys_v  <- terra::vect(polys_sf)
attr_tbl <- polys_sf %>% st_drop_geometry()

# Determine which shapefile attribute field should be used as the ID.
if (!is.null(id_field_override) && id_field_override %in% names(attr_tbl)) {
  id_field <- id_field_override
} else {
  # Candidate field names to try automatically.
  cand <- c("code","Code","CODE","id","ID","subcatch","subcatchment","Name","NAME","name","station","Station")
  id_field <- cand[cand %in% names(attr_tbl)][1]
  
  # Fallback:
  # - use first character column if available
  # - otherwise use the first column of the attribute table
  if (is.na(id_field)) {
    char_cols <- names(attr_tbl)[sapply(attr_tbl, is.character)]
    if (length(char_cols) > 0) id_field <- char_cols[1] else id_field <- names(attr_tbl)[1]
  }
}

# Build a polygon label table with:
#   poly_index = row number
#   poly_id    = value from selected ID field
#   poly_slug  = file-safe version
#   poly_tag   = unique file-safe label
#   plot_label = metadata-based title if available, otherwise poly_id
poly_labels <- tibble(
  poly_index = seq_len(nrow(attr_tbl)),
  poly_id    = as.character(attr_tbl[[id_field]])
) %>%
  mutate(
    poly_id = if_else(is.na(poly_id) | poly_id == "", paste0("poly_", poly_index), poly_id),
    poly_slug = sanitize_filename(poly_id)
  ) %>%
  group_by(poly_slug) %>%
  mutate(poly_tag = if_else(n() > 1, paste0(poly_slug, "__idx", poly_index), poly_slug)) %>%
  ungroup() %>%
  left_join(meta_tbl, by = c("poly_id" = "ID")) %>%
  mutate(
    plot_label = if_else(is.na(title_label) | title_label == "", poly_id, title_label)
  )

# ---------------- PLOTS (PER DATASET) ----------------

make_plots_and_save_dataset <- function(df, out_base, folder_label, plot_label) {
  # Create all per-dataset plots for one polygon and save them to disk.
  #
  # Input:
  #   df           = long time series table for one polygon and one dataset
  #   out_base     = polygon output folder
  #   folder_label = file-safe polygon label
  #   plot_label   = human-readable plot title label
  
  sc_levels <- c("historical","ssp245","ssp585")
  
  # ---- Monthly time series ----
  for (th in c("theta1[1]", "theta2[1]")) {
    dth <- df %>% filter(theta == th, scenario %in% sc_levels)
    if (nrow(dth) == 0) next
    
    p_month <- ggplot(dth, aes(x = month_date, y = value, color = scenario)) +
      geom_line(linewidth = 0.7, alpha = 0.9) +
      labs(
        title = glue("{plot_label} ??? {th} monthly time series"),
        x = "Time",
        y = "Soil moisture (polygon mean)",
        color = "Scenario"
      ) +
      theme_pub()
    
    save_plot(
      p_month,
      file.path(out_base, "timeseries_monthly",
                glue("{folder_label}__{th}__monthly_timeseries.png")),
      w = 11, h = 5
    )
  }
  
  # ---- Annual means ----
  for (th in c("theta1[1]", "theta2[1]")) {
    dth <- df %>% filter(theta == th, scenario %in% sc_levels, is.finite(year))
    if (nrow(dth) == 0) next
    
    annual <- dth %>%
      group_by(scenario, year) %>%
      summarise(value = mean(value, na.rm = TRUE), .groups = "drop")
    
    if (nrow(annual) < 2) next
    
    p_ann <- ggplot(annual, aes(x = year, y = value, color = scenario)) +
      geom_line(linewidth = 0.9) +
      geom_vline(xintercept = hist_end, linetype = "dashed") +
      labs(
        title = glue("{plot_label} ??? {th} annual means (historical vs future)"),
        x = "Year",
        y = "Annual mean soil moisture",
        color = "Scenario"
      ) +
      theme_pub()
    
    save_plot(
      p_ann,
      file.path(out_base, "timeseries_annual",
                glue("{folder_label}__{th}__annual_means.png")),
      w = 11, h = 5
    )
  }
  
  # ---- Boxplots by scenario ----
  for (th in c("theta1[1]", "theta2[1]")) {
    dth <- df %>%
      filter(theta == th, scenario %in% sc_levels) %>%
      mutate(scenario = factor(scenario, levels = sc_levels))
    if (nrow(dth) == 0) next
    
    p_box <- ggplot(dth, aes(x = scenario, y = value, fill = scenario)) +
      geom_boxplot(outlier.alpha = 0.25, width = 0.65) +
      labs(
        title = glue("{plot_label} ??? {th}: distribution by scenario"),
        x = "Scenario",
        y = "Soil moisture (monthly, polygon mean)",
        fill = "Scenario"
      ) +
      theme_pub()
    
    save_plot(
      p_box,
      file.path(out_base, "boxplots",
                glue("{folder_label}__{th}__scenario_boxplot.png")),
      w = 7.5, h = 5.5
    )
  }
  
  # ==========================================================
  # EXTREMES: ONLY 2 facets (ssp245, ssp585)
  #
  # Steps:
  # 1) Compute historical thresholds (p5 and p95)
  # 2) For each year, count how many months are:
  #      - below historical p5
  #      - above historical p95
  # 3) Plot in 2 facets:
  #      - ssp245
  #      - ssp585
  #    while historical is duplicated into both facets as a background layer
  # ==========================================================
  
  cc_levels <- c("ssp245","ssp585")
  
  for (th in c("theta1[1]", "theta2[1]")) {
    dth <- df %>% filter(theta == th, scenario %in% c("historical", cc_levels), is.finite(year))
    if (nrow(dth) == 0) next
    
    # Historical values define the reference thresholds.
    hist_vals <- dth %>% filter(scenario == "historical") %>% pull(value)
    if (length(hist_vals) < 10) next
    
    thr_low  <- quantile(hist_vals, probs = lower_pct, na.rm = TRUE, names = FALSE)
    thr_high <- quantile(hist_vals, probs = upper_pct, na.rm = TRUE, names = FALSE)
    
    # For each year and scenario, count months below / above threshold.
    yearly <- dth %>%
      group_by(scenario, year) %>%
      summarise(
        below = sum(value < thr_low,  na.rm = TRUE),
        above = sum(value > thr_high, na.rm = TRUE),
        .groups = "drop"
      )
    
    # Convert from wide format (below/above columns) to long format.
    yearly_long <- yearly %>%
      pivot_longer(c(below, above), names_to = "tail_raw", values_to = "months") %>%
      mutate(
        tail = recode(
          tail_raw,
          below = glue("Below historical p{lower_pct*100}"),
          above = glue("Above historical p{upper_pct*100}")
        ),
        tail = factor(
          tail,
          levels = c(
            glue("Below historical p{lower_pct*100}"),
            glue("Above historical p{upper_pct*100}")
          )
        )
      ) %>%
      select(-tail_raw)
    
    # Duplicate historical data into both climate-change facets.
    hist_long <- yearly_long %>%
      filter(scenario == "historical") %>%
      tidyr::crossing(cc = cc_levels)
    
    # Future scenarios go only into their own facet.
    fut_long <- yearly_long %>%
      filter(scenario %in% cc_levels) %>%
      transmute(cc = scenario, scenario = scenario, year, tail, months)
    
    plot_long <- bind_rows(hist_long, fut_long) %>%
      mutate(
        cc = factor(cc, levels = cc_levels),
        scenario = factor(scenario, levels = c("historical", cc_levels))
      )
    
    # Fill missing years with zero counts to keep visual rhythm consistent.
    yr_min <- min(plot_long$year, na.rm = TRUE)
    yr_max <- max(plot_long$year, na.rm = TRUE)
    
    plot_long <- plot_long %>%
      tidyr::complete(
        cc, scenario, year = seq(yr_min, yr_max), tail,
        fill = list(months = 0)
      )
    
    # Plot: historical bars in background (transparent),
    # future scenario bars in foreground.
    p_stack2 <- ggplot() +
      geom_col(
        data = plot_long %>% filter(scenario == "historical"),
        aes(x = year, y = months, fill = tail),
        width = 0.85,
        alpha = 0.30
      ) +
      geom_col(
        data = plot_long %>% filter(scenario != "historical"),
        aes(x = year, y = months, fill = tail),
        width = 0.85,
        alpha = 1.00
      ) +
      facet_wrap(~ cc, ncol = 1) +
      scale_y_continuous(breaks = 0:12, limits = c(0, 12)) +
      labs(
        title = glue("{plot_label} ??? {th}: extreme months/year"),
        x = "Year",
        y = "Months (count, 0???12)",
        fill = "Threshold side"
      ) +
      theme_pub()
    
    save_plot(
      p_stack2,
      file.path(out_base, "threshold_month_counts_stacked_2cc",
                glue("{folder_label}__{th}__stacked_2cc__p{lower_pct*100}_and_p{upper_pct*100}.png")),
      w = 12, h = 7.5
    )
    
    # ---- Anomaly version ----
    # Compute baseline mean number of extreme months using historical data only.
    baseline_tbl <- plot_long %>%
      filter(scenario == "historical", year >= baseline_start, year <= baseline_end) %>%
      group_by(tail) %>%
      summarise(baseline = mean(months, na.rm = TRUE), .groups = "drop")
    
    # Fallback: if the selected baseline period has no usable values,
    # use the full historical period instead.
    if (nrow(baseline_tbl) == 0 || any(is.na(baseline_tbl$baseline))) {
      baseline_tbl <- plot_long %>%
        filter(scenario == "historical") %>%
        group_by(tail) %>%
        summarise(baseline = mean(months, na.rm = TRUE), .groups = "drop")
    }
    
    # Anomaly = yearly count - historical baseline mean
    anom_long <- plot_long %>%
      left_join(baseline_tbl, by = "tail") %>%
      mutate(anomaly = months - baseline)
    
    p_stack2_anom <- ggplot() +
      geom_hline(yintercept = 0, linetype = "dashed") +
      geom_col(
        data = anom_long %>% filter(scenario == "historical"),
        aes(x = year, y = anomaly, fill = tail),
        width = 0.85,
        alpha = 0.30
      ) +
      geom_col(
        data = anom_long %>% filter(scenario != "historical"),
        aes(x = year, y = anomaly, fill = tail),
        width = 0.85,
        alpha = 1.00
      ) +
      facet_wrap(~ cc, ncol = 1) +
      labs(
        title = glue("{plot_label} ??? {th}: anomaly of extreme months (baseline {baseline_start}-{baseline_end})"),
        x = "Year",
        y = "Anomaly (months/year)",
        fill = "Threshold side"
      ) +
      theme_pub()
    
    save_plot(
      p_stack2_anom,
      file.path(out_base, "threshold_month_counts_stacked_2cc",
                glue("{folder_label}__{th}__stacked_2cc_anomaly__p{lower_pct*100}_and_p{upper_pct*100}__baseline_{baseline_start}-{baseline_end}.png")),
      w = 12, h = 7.5
    )
  }
  
  invisible(TRUE)
}

# ---------------- RUN A SINGLE DATASET FOR ONE POLYGON ----------------

run_dataset_for_polygon <- function(dataset_name, nc_dir, poly_idx, out_dir_dataset, nc_objs) {
  # Process one polygon for one dataset:
  # - extract all time series
  # - save the long table as CSV
  # - generate all plots
  
  lbl <- poly_labels %>% filter(poly_index == poly_idx) %>% slice(1)
  folder_label <- lbl$poly_tag
  plot_label   <- lbl$plot_label
  
  df <- extract_one_polygon_all(poly_idx, polys_v, nc_objs, dataset_name = dataset_name)
  
  out_base <- file.path(out_dir_dataset, folder_label)
  dir.create(out_base, recursive = TRUE, showWarnings = FALSE)
  
  # Save extracted long-format time series table.
  readr::write_csv(df, file.path(out_base, glue("{folder_label}__{dataset_name}__timeseries_long.csv")))
  
  # Create and save plots.
  make_plots_and_save_dataset(df, out_base, folder_label, plot_label)
  
  df
}

run_dataset_all_polygons <- function(dataset_name, nc_dir) {
  # Process all polygons for one dataset.
  message(glue("=== DATASET: {dataset_name} | dir={nc_dir} ==="))
  
  # Build full file paths for expected NetCDF files.
  nc_paths <- file.path(nc_dir, nc_filenames)
  
  # Stop immediately if any required file is missing.
  missing <- nc_paths[!file.exists(nc_paths)]
  if (length(missing) > 0) {
    stop("Missing nc files in ", dataset_name, ":\n", paste(missing, collapse = "\n"))
  }
  
  # Preload raster/time stacks once.
  nc_objs <- preload_nc_stack(nc_paths, var_name = var_name)
  
  out_dir_dataset <- file.path(out_root, dataset_name)
  dir.create(out_dir_dataset, recursive = TRUE, showWarnings = FALSE)
  
  all_df <- vector("list", nrow(polys_v))
  
  # Loop over all polygons.
  for (i in seq_len(nrow(polys_v))) {
    message(glue("  polygon {i}/{nrow(polys_v)}"))
    all_df[[i]] <- tryCatch(
      run_dataset_for_polygon(dataset_name, nc_dir, i, out_dir_dataset, nc_objs),
      error = function(e) { message("    ERROR: ", e$message); NULL }
    )
  }
  
  bind_rows(all_df)
}

# ---------------- COMPARISON PLOTS (ISIMIP vs RESTORE4LIFE) ----------------

make_compare_plots <- function(df_both, out_base_compare, folder_label, plot_label) {
  # Create comparison plots between datasets for one polygon.
  #
  # Input:
  #   df_both          = combined long-format data for the polygon
  #   out_base_compare = comparison output folder
  #   folder_label     = file-safe polygon label
  #   plot_label       = human-readable label
  
  sc_levels <- c("historical","ssp245","ssp585")
  cc_levels <- c("ssp245","ssp585")
  
  # ---- Monthly time series ----
  # Same content as dataset plots, but faceted by dataset.
  for (th in c("theta1[1]", "theta2[1]")) {
    dth <- df_both %>% filter(theta == th, scenario %in% sc_levels)
    if (nrow(dth) == 0) next
    
    p <- ggplot(dth, aes(x = month_date, y = value, color = scenario)) +
      geom_line(linewidth = 0.6, alpha = 0.9) +
      facet_wrap(~ dataset, ncol = 1) +
      labs(
        title = glue("{plot_label} ??? {th} monthly time series"),
        x = "Time",
        y = "Soil moisture (polygon mean)",
        color = "Scenario"
      ) +
      theme_pub()
    
    save_plot(
      p,
      file.path(out_base_compare, "timeseries_monthly",
                glue("{folder_label}__{th}__monthly__COMPARE.png")),
      w = 12, h = 8
    )
  }
  
  # ---- Annual means ----
  for (th in c("theta1[1]", "theta2[1]")) {
    dth <- df_both %>% filter(theta == th, scenario %in% sc_levels, is.finite(year))
    if (nrow(dth) == 0) next
    
    annual <- dth %>%
      group_by(dataset, scenario, year) %>%
      summarise(value = mean(value, na.rm = TRUE), .groups = "drop")
    
    p <- ggplot(annual, aes(x = year, y = value, color = scenario)) +
      geom_line(linewidth = 0.8) +
      geom_vline(xintercept = hist_end, linetype = "dashed") +
      facet_wrap(~ dataset, ncol = 1) +
      labs(
        title = glue("{plot_label} ??? {th} annual means"),
        x = "Year",
        y = "Annual mean soil moisture",
        color = "Scenario"
      ) +
      theme_pub()
    
    save_plot(
      p,
      file.path(out_base_compare, "timeseries_annual",
                glue("{folder_label}__{th}__annual__COMPARE.png")),
      w = 12, h = 8
    )
  }
  
  # ---- Boxplots ----
  for (th in c("theta1[1]", "theta2[1]")) {
    dth <- df_both %>%
      filter(theta == th, scenario %in% sc_levels) %>%
      mutate(scenario = factor(scenario, levels = sc_levels))
    if (nrow(dth) == 0) next
    
    p <- ggplot(dth, aes(x = scenario, y = value, fill = scenario)) +
      geom_boxplot(outlier.alpha = 0.25, width = 0.65) +
      facet_wrap(~ dataset, ncol = 1) +
      labs(
        title = glue("{plot_label} ??? {th} scenario distributions"),
        x = "Scenario",
        y = "Soil moisture (monthly, polygon mean)",
        fill = "Scenario"
      ) +
      theme_pub()
    
    save_plot(
      p,
      file.path(out_base_compare, "boxplots",
                glue("{folder_label}__{th}__boxplot__COMPARE.png")),
      w = 10, h = 8
    )
  }
  
  # ---- Extremes comparison ----
  # Facet by:
  #   rows = dataset
  #   cols = climate scenario (ssp245 / ssp585)
  #
  # Important:
  # Thresholds are computed separately for each dataset using that dataset's
  # own historical values.
  for (th in c("theta1[1]", "theta2[1]")) {
    dth <- df_both %>% filter(theta == th, scenario %in% c("historical", cc_levels), is.finite(year))
    if (nrow(dth) == 0) next
    
    build_extreme_long <- function(dsub) {
      # Compute extremes table for one dataset subset.
      hv <- dsub %>% filter(scenario == "historical") %>% pull(value)
      if (length(hv) < 10) return(NULL)
      
      thr_low  <- quantile(hv, probs = lower_pct, na.rm = TRUE, names = FALSE)
      thr_high <- quantile(hv, probs = upper_pct, na.rm = TRUE, names = FALSE)
      
      yearly <- dsub %>%
        group_by(scenario, year) %>%
        summarise(
          below = sum(value < thr_low,  na.rm = TRUE),
          above = sum(value > thr_high, na.rm = TRUE),
          .groups = "drop"
        )
      
      yearly_long <- yearly %>%
        pivot_longer(c(below, above), names_to = "tail_raw", values_to = "months") %>%
        mutate(
          tail = recode(
            tail_raw,
            below = glue("Below historical p{lower_pct*100}"),
            above = glue("Above historical p{upper_pct*100}")
          ),
          tail = factor(
            tail,
            levels = c(
              glue("Below historical p{lower_pct*100}"),
              glue("Above historical p{upper_pct*100}")
            )
          )
        ) %>%
        select(-tail_raw)
      
      hist_long <- yearly_long %>%
        filter(scenario == "historical") %>%
        tidyr::crossing(cc = cc_levels)
      
      fut_long <- yearly_long %>%
        filter(scenario %in% cc_levels) %>%
        transmute(cc = scenario, scenario = scenario, year, tail, months)
      
      bind_rows(hist_long, fut_long) %>%
        mutate(
          cc = factor(cc, levels = cc_levels),
          scenario = factor(scenario, levels = c("historical", cc_levels))
        )
    }
    
    ext <- dth %>%
      group_by(dataset) %>%
      group_modify(~{
        out <- build_extreme_long(.x)
        if (is.null(out)) return(tibble())
        out
      }) %>%
      ungroup()
    
    if (nrow(ext) == 0) next
    
    yr_min <- min(ext$year, na.rm = TRUE)
    yr_max <- max(ext$year, na.rm = TRUE)
    
    ext <- ext %>%
      tidyr::complete(
        dataset, cc, scenario, year = seq(yr_min, yr_max), tail,
        fill = list(months = 0)
      )
    
    p <- ggplot() +
      geom_col(
        data = ext %>% filter(scenario == "historical"),
        aes(x = year, y = months, fill = tail),
        width = 0.85,
        alpha = 0.30
      ) +
      geom_col(
        data = ext %>% filter(scenario != "historical"),
        aes(x = year, y = months, fill = tail),
        width = 0.85,
        alpha = 1.00
      ) +
      facet_grid(dataset ~ cc) +
      scale_y_continuous(breaks = 0:12, limits = c(0, 12)) +
      labs(
        title = glue("{plot_label} ??? {th}: extreme months/year"),
        x = "Year",
        y = "Months (count, 0???12)",
        fill = "Threshold side"
      ) +
      theme_pub()
    
    save_plot(
      p,
      file.path(out_base_compare, "threshold_month_counts_stacked_2cc",
                glue("{folder_label}__{th}__extremes_2cc__COMPARE.png")),
      w = 14, h = 8
    )
  }
  
  invisible(TRUE)
}

# ---------------- MAIN RUN ----------------

# 1) Run both datasets and keep their results in memory for comparison.
all_by_dataset <- list()

for (nm in names(dataset_dirs)) {
  all_by_dataset[[nm]] <- run_dataset_all_polygons(nm, dataset_dirs[[nm]])
}

df_isimip <- all_by_dataset$isimip
df_restore <- all_by_dataset$restore4life
df_both <- bind_rows(df_isimip, df_restore)

# 2) Build comparison outputs per polygon.
dir.create(compare_out_dir, recursive = TRUE, showWarnings = FALSE)

for (i in seq_len(nrow(polys_v))) {
  lbl <- poly_labels %>% filter(poly_index == i) %>% slice(1)
  folder_label <- lbl$poly_tag
  plot_label   <- lbl$plot_label
  
  dpoly <- df_both %>% filter(dataset %in% c("isimip","restore4life")) %>% filter(TRUE)
  
  # IMPORTANT:
  # We need polygon-specific comparison data.
  #
  # The long tables stored in memory do not explicitly contain poly_index,
  # so instead of trying to reconstruct polygon membership from the combined
  # data frame, the code re-extracts the data for this polygon from both
  # datasets here. This is robust, even if somewhat repetitive.
  
  df_cmp_list <- list()
  for (nm in names(dataset_dirs)) {
    nc_paths <- file.path(dataset_dirs[[nm]], nc_filenames)
    nc_objs <- preload_nc_stack(nc_paths, var_name = var_name)
    df_cmp_list[[nm]] <- extract_one_polygon_all(i, polys_v, nc_objs, dataset_name = nm)
  }
  df_cmp <- bind_rows(df_cmp_list)
  
  out_base_compare <- file.path(compare_out_dir, folder_label)
  dir.create(out_base_compare, recursive = TRUE, showWarnings = FALSE)
  
  # Save combined comparison table.
  readr::write_csv(df_cmp, file.path(out_base_compare, glue("{folder_label}__COMPARE__timeseries_long.csv")))
  
  # Create comparison plots.
  make_compare_plots(df_cmp, out_base_compare, folder_label, plot_label)
}

message("ALL DONE.")