###############################################
# Batch processing for CSV files:
# - Water-year discharge heatmaps (Oct???Sep water year)
# - FDC curves (per CSV)
# - Daily-statistics hydrographs (per CSV)
# + Combined FDC comparison plots:
#   isimip3b vs restore4life vs measured vs modelled
#
###############################################

# ---- Libraries ----
library(dplyr)
library(tidyr)
library(lubridate)
library(ggplot2)
library(scales)
library(tibble)

# ---- Input / output directories, you can find the details and example in the base data for tisa folder ----


base_root <- ""

input_dir <- file.path(base_root, "discharge_in")

out_dir_heatmap_base <- file.path(base_root, "water_year_heatmaps_log10")
fdc_dir_base         <- file.path(base_root, "fdc_plots")
hydro_stat_dir_base  <- file.path(base_root, "daily_stats_hydrographs")

dir.create(out_dir_heatmap_base, recursive = TRUE, showWarnings = FALSE)
dir.create(fdc_dir_base,         recursive = TRUE, showWarnings = FALSE)
dir.create(hydro_stat_dir_base,  recursive = TRUE, showWarnings = FALSE)

# ---- List CSV files for the batch-processing block ----
csv_files <- list.files(
  input_dir,
  pattern    = "\\.csv$",
  full.names = TRUE
)

message("CSV files found (for batch processing):")
print(basename(csv_files))

# ---- Station labels and filename identifiers for G1..G13 ----

# Human-readable station names used in plot titles
#you should carry out this for your pilot, if you have the same situation with names of subcatchments
station_labels <- c(
  "Szamos (V??s??rosnam??ny)",     # G1
  "Kraszna (V??s??rosnam??ny)",    # G2
  "Laborec (Obor??n)",           # G3
  "Ondava (Zempl??n)",           # G4
  "Bodrog (Tokaj)",             # G5
  "B??dva (Boldva)",             # G6
  "Hern??d (Saj??h??dv??g)",        # G7
  "Saj?? (Tisza??jv??ros)",        # G8
  "Zagyva (Szolnok)",           # G9
  "Beretty?? (Szeghalom)",       # G10
  "H??rmas-K??r??s (Csongr??d)",    # G11
  "Maros (Szeged)",             # G12
  "Tisza (Senta)"               # G13
)

# ASCII / filename-safe identifiers used in output filenames
station_ids <- c(
  "Szamos_Vasarosnameny",
  "Kraszna_Vasarosnameny",
  "Laborec_Oborin",
  "Ondava_Zemplin",
  "Bodrog_Tokaj",
  "Bodva_Boldva",
  "Hernad_Sajohidveg",
  "Sajo_Tiszaujvaros",
  "Zagyva_Szolnok",
  "Berettyo_Szeghalom",
  "Harmas-Koros_Csongrad",
  "Maros_Szeged",
  "Tisza_Senta"
)

# Global objects reused by plotting functions inside the batch loop.
# These are refreshed for each CSV file.
station_lookup      <- NULL   # station metadata for the current file
data_long           <- NULL   # long-format raw time series
data_long_wy        <- NULL   # long-format data extended with water-year fields
daily_stats         <- NULL   # daily statistics summary table
current_file_label  <- NULL   # current CSV filename without extension

# ----------------------------------------------------------
# Plotting function: Water-year heatmap + 10/90 percentile contours
# Uses:
#   - data_long_wy
#   - station_lookup
#   - current_file_label
# ----------------------------------------------------------
plot_wateryear_heatmap <- function(series_name) {
  
  # Subset the currently active dataset to the selected station/series.
  df_sub <- data_long_wy |> dplyr::filter(series == series_name)
  if (nrow(df_sub) == 0) return(NULL)
  
  # Because the colour scale is log10-transformed,
  # replace non-positive values with a very small positive number.
  df_sub <- df_sub |>
    mutate(value_plot = ifelse(value <= 0 | is.na(value), 1e-6, value))
  
  # Compute the 10th and 90th percentile thresholds.
  qs_all <- quantile(
    df_sub$value_plot,
    probs = c(0.10, 0.90),
    na.rm = TRUE
  )
  
  q10 <- qs_all[1]
  q90 <- qs_all[2]
  
  # Build a quantile-based colour scale across the full value range.
  # The colour positioning is based on log10-transformed quantiles.
  qs_probs <- c(0, 0.10, 0.25, 0.50, 0.75, 0.90, 1)
  qs_vals  <- quantile(df_sub$value_plot, probs = qs_probs, na.rm = TRUE)
  
  qs_vals_log <- log10(qs_vals)
  vals_scaled <- rescale(qs_vals_log, to = c(0, 1))
  
  base_cols <- c("#B2182B", "#EF8A62", "#FFFFFF", "#67A9CF", "#2166AC")
  col_pal   <- grDevices::colorRampPalette(base_cols)(length(qs_vals))
  
  # Station label for the title.
  station_label <- station_lookup$label[station_lookup$series == series_name]
  
  # Current file label appended to the title.
  file_label <- if (is.null(current_file_label)) "" else paste0(" ??? ", current_file_label)
  
  ggplot(df_sub, aes(x = wy_doy, y = wy_year, fill = value_plot)) +
    geom_tile() +
    
    # ====== Highlight 10% and 90% contours (white halo + coloured line) ======
  geom_contour(
    aes(z = value_plot),
    breaks    = q10,
    colour    = "white",
    linewidth = 1.6
  ) +
    geom_contour(
      aes(z = value_plot, linetype = "10%"),
      breaks    = q10,
      colour    = "#8B0000",    # dark red
      linewidth = 0.8
    ) +
    geom_contour(
      aes(z = value_plot),
      breaks    = q90,
      colour    = "white",
      linewidth = 1.6
    ) +
    geom_contour(
      aes(z = value_plot, linetype = "90%"),
      breaks    = q90,
      colour    = "#08306B",    # dark blue
      linewidth = 0.8
    ) +
    scale_linetype_manual(
      name = "Percentile contours",
      values = c(
        "10%" = "solid",
        "90%" = "solid"
      )
    ) +
    
    # Log10 colour scale using quantile-based spacing and log tick labels.
    scale_fill_gradientn(
      colours = col_pal,
      values  = vals_scaled,
      trans   = "log10",
      name    = "Discharge (m3/s)",
      breaks = 10^seq(
        floor(log10(min(df_sub$value_plot, na.rm = TRUE))),
        ceiling(log10(max(df_sub$value_plot, na.rm = TRUE))),
        by = 1
      ),
      labels = scales::comma
    ) +
    
    scale_x_continuous(
      breaks = c(1, 32, 62, 93, 121, 152, 182, 213, 244, 274, 305, 335),
      labels = c("Oct","Nov","Dec","Jan","Feb","Mar",
                 "Apr","May","Jun","Jul","Aug","Sep"),
      expand = c(0, 0)
    ) +
    scale_y_reverse(expand = c(0, 0)) +
    
    labs(
      title = paste0(
        station_label,
        file_label,
        " ??? Discharge (m3/s)"
      ),
      x = "Water Year Day",
      y = "Water Year"
    ) +
    theme_minimal(base_size = 12) +
    theme(panel.grid = element_blank())
}

# ----------------------------------------------------------
# FLOW DURATION CURVE (FDC) FOR ONE STATION (FROM ONE CSV)
# ----------------------------------------------------------
plot_fdc <- function(series_name) {
  
  station_label <- station_lookup$label[station_lookup$series == series_name]
  
  df_sub <- data_long |>
    dplyr::filter(series == series_name, !is.na(value))
  
  n <- nrow(df_sub)
  if (n == 0) return(NULL)
  
  # FDC preparation:
  # - remove non-positive values because the y-axis will be log10
  # - sort descending by discharge
  # - compute exceedance probability
  df_fdc <- df_sub |>
    dplyr::mutate(value = ifelse(value <= 0, NA_real_, value)) |>
    dplyr::filter(!is.na(value)) |>
    dplyr::arrange(dplyr::desc(value)) |>
    dplyr::mutate(
      rank            = dplyr::row_number(),
      prob_exceed     = rank / (n + 1),           # 0???1
      prob_exceed_pct = 100 * prob_exceed         # 0???100%
    )
  
  file_label <- if (is.null(current_file_label)) "" else paste0(" ??? ", current_file_label)
  
  ggplot(df_fdc, aes(x = prob_exceed_pct, y = value)) +
    geom_line() +
    scale_y_log10(
      name = "Discharge (m3/s, log10)"
    ) +
    scale_x_reverse(
      name   = "Exceedance probability (%)",
      limits = c(100, 0)
    ) +
    labs(
      title = paste0(station_label, file_label, " ??? Exceedance probability")
    ) +
    theme_minimal(base_size = 11) +
    theme(
      panel.grid.minor = element_blank()
    )
}

# ----------------------------------------------------------
# DAILY STATISTICS:
# min, max, 5???95, 25???75, mean, median
# ----------------------------------------------------------
plot_daily_stats_hydrograph <- function(series_name) {
  
  df <- daily_stats |> dplyr::filter(series == series_name)
  if (nrow(df) == 0) return(NULL)
  
  station_label <- station_lookup$label[station_lookup$series == series_name]
  file_label <- if (is.null(current_file_label)) "" else paste0(" ??? ", current_file_label)
  
  ggplot(df, aes(x = doy)) +
    # minimum???maximum band (lightest ribbon)
    geom_ribbon(aes(ymin = min, ymax = max, fill = "Minimum???Maximum"), alpha = 0.4) +
    # 5???95%
    geom_ribbon(aes(ymin = q05, ymax = q95, fill = "5???95 percentile"), alpha = 0.5) +
    # 25???75%
    geom_ribbon(aes(ymin = q25, ymax = q75, fill = "25???75 percentile"), alpha = 0.8) +
    
    # mean and median lines
    geom_line(aes(y = mean, colour = "Mean"), linewidth = 0.6) +
    geom_line(aes(y = q50,  colour = "Median"), linewidth = 0.6) +
    
    scale_y_log10(
      name = "Discharge [m3/s]"
    ) +
    
    scale_x_continuous(
      name = "Day of Year",
      breaks = c(1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335),
      labels = c("jan.", "feb.", "mar.", "apr.", "may.", "jun.",
                 "jul.", "aug.", "sep.", "oct.", "nov.", "dec.")
    ) +
    
    scale_fill_manual(
      name = "Daily Statistics",
      values = c(
        "25???75 percentile" = "#4B6A88",
        "5???95 percentile"  = "#7399B8",
        "Minimum???Maximum"  = "#B9D6EA"
      )
    ) +
    scale_colour_manual(
      name = "Daily Statistics",
      values = c(
        "Mean"   = "#7FDBFF",
        "Median" = "#001f3f"
      )
    ) +
    
    labs(
      title = paste0(station_label, file_label, " ??? Hydrograph")
    ) +
    theme_minimal(base_size = 11) +
    theme(
      panel.grid.minor = element_blank(),
      legend.position = "right"
    )
}

# ==========================================================
#               MAIN BATCH LOOP FOR ALL CSV FILES
# ==========================================================
for (file_path in csv_files) {
  
  current_file_label <- tools::file_path_sans_ext(basename(file_path))
  message("Processing: ", basename(file_path))
  
  # ---- 1. Detect headers and delimiter ----
  header_lines <- readLines(file_path, n = 3)
  
  # If the first header line contains ';', use ';', otherwise ','.
  sep_guess <- if (grepl(";", header_lines[1])) ";" else ","
  
  meta_line <- header_lines[1]
  xloc_line <- header_lines[2]
  yloc_line <- header_lines[3]
  
  # Split x/y coordinate lines using the detected delimiter.
  xloc <- strsplit(xloc_line, sep_guess)[[1]][-1] |> as.numeric()
  yloc <- strsplit(yloc_line, sep_guess)[[1]][-1] |> as.numeric()
  
  # ---- 2. Read the actual data using the same delimiter ----
  raw_data <- read.csv(
    file_path,
    skip = 3,
    stringsAsFactors = FALSE,
    check.names = FALSE,
    sep = sep_guess,
    na.strings = c("NA", "#NA", "")
  )
  
  # Convert Date column.
  if (!"Date" %in% names(raw_data)) {
    stop("The file does not contain a 'Date' column: ", basename(file_path),
         "\nAvailable columns: ", paste(names(raw_data), collapse = ", "))
  }
  raw_data$Date <- as.Date(raw_data$Date, format = "%d/%m/%Y")
  
  # Time-series columns (typically G1..G13)
  series_cols <- setdiff(names(raw_data), "Date")
  
  # Refresh station lookup for the current file.
  station_lookup <- tibble(
    series  = series_cols,
    label   = station_labels[seq_along(series_cols)],
    file_id = station_ids[seq_along(series_cols)]
  )
  
  # ---- 2. Long format (data_long) ----
  data_long <- raw_data |>
    tidyr::pivot_longer(
      cols = dplyr::all_of(series_cols),
      names_to  = "series",
      values_to = "value"
    )
  
  # ---- 3. Water year and water-year day (Oct???Sep water year) ----
  data_long_wy <- data_long |>
    mutate(
      mon = month(Date),
      yr  = year(Date),
      # If month is October or later, assign it to the next water year.
      wy_year = yr + ifelse(mon >= 10, 1, 0),
      wy_start_year = ifelse(mon >= 10, yr, yr - 1),
      wy_start = as.Date(paste0(wy_start_year, "-10-01")),
      wy_doy   = as.integer(Date - wy_start + 1)
    )
  
  # ---- 4. DAILY STATISTICS: min, max, 5???95, 25???75, mean, median ----
  daily_stats <- data_long |>
    mutate(
      mon = lubridate::month(Date),
      day = lubridate::mday(Date),
      # Use a fixed 365-day reference year (2001 is not a leap year),
      # so leap years are folded consistently into a common day-of-year scale.
      doy = lubridate::yday(as.Date(sprintf("2001-%02d-%02d", mon, day)))
    ) |>
    group_by(series, doy) |>
    summarise(
      q05   = quantile(value, 0.05, na.rm = TRUE),
      q25   = quantile(value, 0.25, na.rm = TRUE),
      q50   = quantile(value, 0.50, na.rm = TRUE),   # median
      q75   = quantile(value, 0.75, na.rm = TRUE),
      q95   = quantile(value, 0.95, na.rm = TRUE),
      min   = min(value, na.rm = TRUE),
      max   = max(value, na.rm = TRUE),
      mean  = mean(value, na.rm = TRUE),
      .groups = "drop"
    )
  
  # =======================================================
  # 4/a) Save WATER YEAR HEATMAPS (per CSV)
  # =======================================================
  for (s in series_cols) {
    
    p <- plot_wateryear_heatmap(s)
    if (is.null(p)) next
    
    station_file_id <- station_lookup$file_id[station_lookup$series == s]
    filename <- paste0(
      current_file_label, "_",
      s, "_",
      station_file_id,
      "_wy_heatmap_log10.png"
    )
    
    message("  Saving heatmap: ", filename)
    
    ggsave(
      filename = file.path(out_dir_heatmap_base, filename),
      plot     = p,
      width    = 11,
      height   = 8,
      dpi      = 300
    )
  }
  
  # =======================================================
  # 4/b) Save FDC curves (per CSV)
  # =======================================================
  for (s in series_cols) {
    p_fdc <- plot_fdc(s)
    if (is.null(p_fdc)) next
    
    station_file_id <- station_lookup$file_id[station_lookup$series == s]
    filename <- paste0(
      current_file_label, "_",
      s, "_",
      station_file_id,
      "_FDC.png"
    )
    
    message("  Saving FDC: ", filename)
    
    ggsave(
      filename = file.path(fdc_dir_base, filename),
      plot     = p_fdc,
      width    = 7,
      height   = 5,
      dpi      = 300
    )
  }
  
  # =======================================================
  # 4/c) Save daily-statistics hydrographs (per CSV)
  # =======================================================
  for (s in series_cols) {
    p_h <- plot_daily_stats_hydrograph(s)
    if (is.null(p_h)) next
    
    station_file_id <- station_lookup$file_id[station_lookup$series == s]
    filename <- paste0(
      current_file_label, "_",
      s, "_",
      station_file_id,
      "_daily_stats_hydrograph.png"
    )
    
    message("  Saving daily-stats hydrograph: ", filename)
    
    ggsave(
      filename = file.path(hydro_stat_dir_base, filename),
      plot     = p_h,
      width    = 8,
      height   = 5,
      dpi      = 300
    )
  }
  
  message("Finished file: ", basename(file_path))
}

message("All CSV files processed (batch heatmap / FDC / hydrograph block).")

############################################################
# FDC COMPARISON BLOCK ??? isimip3b vs restore4life
# + measured + modelled + historical
# - independent input reading
# - independent combined_long_fdc object
############################################################

fdc_input_dir <- file.path(base_root, "discharge_in")

# Only files matching discharge_daily_*.csv
fdc_csv_files <- list.files(
  fdc_input_dir,
  pattern    = "^discharge_daily_.*\\.csv$",
  full.names = TRUE
)

message("CSV files used for FDC comparison (", length(fdc_csv_files), "):")
print(basename(fdc_csv_files))

# Expected G columns
fdc_series_cols <- paste0("G", 1:13)

all_long_fdc <- list()

for (file_path in fdc_csv_files) {
  
  scenario_name <- tools::file_path_sans_ext(basename(file_path))
  message("  Reading for FDC comparison: ", basename(file_path))
  
  # --- 1) Read header and detect delimiter (, or ;) ---
  header_lines <- readLines(file_path, n = 1)
  sep_guess <- if (grepl(";", header_lines[1])) ";" else ","
  
  # --- 2) Read data starting from row 4 (first 3 rows are metadata) ---
  raw_data <- read.csv(
    file_path,
    skip = 3,
    stringsAsFactors = FALSE,
    check.names = FALSE,
    sep = sep_guess,
    na.strings = c("NA", "#NA", "")
  )
  
  # --- 3) Date conversion: the file must contain a Date column ---
  if (!"Date" %in% names(raw_data)) {
    stop("The file does not contain a 'Date' column: ", basename(file_path),
         "\nAvailable columns: ", paste(names(raw_data), collapse = ", "))
  }
  
  raw_data$Date <- as.Date(raw_data$Date, format = "%d/%m/%Y")
  
  # --- 4) Keep only Date + G1..G13 columns ---
  keep_cols <- intersect(names(raw_data), c("Date", fdc_series_cols))
  raw_data  <- raw_data[, keep_cols]
  
  # --- 5) Convert to long format and add scenario label ---
  data_long_tmp <- raw_data |>
    tidyr::pivot_longer(
      cols = dplyr::all_of(setdiff(keep_cols, "Date")),
      names_to  = "series",
      values_to = "value"
    ) |>
    dplyr::mutate(
      scenario = scenario_name
    )
  
  all_long_fdc[[scenario_name]] <- data_long_tmp
}

combined_long_fdc <- dplyr::bind_rows(all_long_fdc)

############################################################
# SCENARIO CLASSIFICATION: FAMILY AND ROLE
############################################################

scenario_meta_fdc <- combined_long_fdc |>
  dplyr::distinct(scenario) |>
  dplyr::mutate(
    family = dplyr::case_when(
      grepl("isimip3b",     scenario, ignore.case = TRUE) ~ "isimip3b",
      grepl("restore4life", scenario, ignore.case = TRUE) ~ "restore4life",
      grepl("measured",     scenario, ignore.case = TRUE) ~ "measured",
      grepl("modelled",     scenario, ignore.case = TRUE) ~ "modelled",
      TRUE                                                ~ "other"
    ),
    role = dplyr::case_when(
      grepl("historical", scenario, ignore.case = TRUE) ~ "historical",
      grepl("wd",         scenario, ignore.case = TRUE) ~ "future",
      TRUE                                              ~ "other"
    )
  )

message("Scenario metadata (FDC):")
print(scenario_meta_fdc)

combined_long_fdc <- combined_long_fdc |>
  dplyr::left_join(scenario_meta_fdc, by = "scenario")

############################################################
# HELPER FUNCTION: COMPUTE FDC
############################################################

compute_fdc <- function(df, group_cols = NULL) {
  
  # Remove non-positive values because log-scale discharge plots
  # cannot represent them meaningfully.
  df <- df |>
    dplyr::mutate(value = ifelse(value <= 0, NA_real_, value)) |>
    dplyr::filter(!is.na(value))
  
  if (nrow(df) == 0) return(df)
  
  if (is.null(group_cols)) {
    # Compute one FDC over the entire input table.
    df |>
      dplyr::arrange(dplyr::desc(value)) |>
      dplyr::mutate(
        rank            = dplyr::row_number(),
        prob_exceed     = rank / (dplyr::n() + 1),
        prob_exceed_pct = 100 * prob_exceed
      )
  } else {
    # Compute FDC separately within each group.
    df |>
      dplyr::group_by(dplyr::across(dplyr::all_of(group_cols))) |>
      dplyr::arrange(dplyr::desc(value), .by_group = TRUE) |>
      dplyr::mutate(
        rank            = dplyr::row_number(),
        prob_exceed     = rank / (dplyr::n() + 1),
        prob_exceed_pct = 100 * prob_exceed
      ) |>
      dplyr::ungroup()
  }
}

############################################################
# HELPER FUNCTION: ENVELOPE (MIN, MAX, MEDIAN) FROM
# FAMILY FUTURE SCENARIOS
############################################################

build_family_envelope <- function(df_family, prob_grid) {
  
  if (nrow(df_family) == 0) return(NULL)
  
  # Compute separate FDCs for each scenario inside the family.
  df_fdc_family <- compute_fdc(df_family, group_cols = "scenario")
  if (nrow(df_fdc_family) == 0) return(NULL)
  
  grid_list <- list()
  
  for (sc in unique(df_fdc_family$scenario)) {
    
    df_sc <- df_fdc_family[df_fdc_family$scenario == sc, ]
    if (nrow(df_sc) < 2) next
    
    # Interpolate each scenario FDC onto a shared exceedance-probability grid.
    appr <- approx(
      x    = df_sc$prob_exceed_pct,
      y    = df_sc$value,
      xout = prob_grid,
      rule = 2
    )
    
    grid_list[[sc]] <- data.frame(
      prob_exceed_pct = appr$x,
      value           = appr$y,
      scenario        = sc
    )
  }
  
  if (length(grid_list) == 0) return(NULL)
  
  grid_all <- dplyr::bind_rows(grid_list)
  
  # Envelope summary across scenarios in the family:
  # minimum, maximum, and median at each exceedance probability.
  grid_all |>
    dplyr::group_by(prob_exceed_pct) |>
    dplyr::summarise(
      q_min = min(value, na.rm = TRUE),
      q_max = max(value, na.rm = TRUE),
      q_med = stats::median(value, na.rm = TRUE),
      .groups = "drop"
    )
}

############################################################
# FDC COMPARISON PLOT PER STATION ??? CLEANED LEGEND
############################################################

plot_fdc_isimip_restore <- function(series_name) {
  
  df_all <- combined_long_fdc |>
    dplyr::filter(series == series_name, !is.na(value))
  
  if (nrow(df_all) == 0) {
    warning("No data for this station: ", series_name)
    return(NULL)
  }
  
  prob_grid <- seq(0.1, 99.9, by = 0.1)
  
  # isimip3b future envelope
  df_isimip_future <- df_all |>
    dplyr::filter(family == "isimip3b", role == "future")
  env_isimip <- build_family_envelope(df_isimip_future, prob_grid)
  
  # restore4life future envelope
  df_r4l_future <- df_all |>
    dplyr::filter(family == "restore4life", role == "future")
  env_r4l <- build_family_envelope(df_r4l_future, prob_grid)
  
  # measured/modelled FDCs
  df_measured_fdc <- df_all |>
    dplyr::filter(family == "measured") |>
    compute_fdc()
  
  df_modelled_fdc <- df_all |>
    dplyr::filter(family == "modelled") |>
    compute_fdc()
  
  # historical FDCs
  df_isimip_hist_fdc <- df_all |>
    dplyr::filter(family == "isimip3b", role == "historical") |>
    compute_fdc()
  
  df_r4l_hist_fdc <- df_all |>
    dplyr::filter(family == "restore4life", role == "historical") |>
    compute_fdc()
  
  # Station label from G1..G13 mapping
  station_label <- station_labels[match(series_name, paste0("G", seq_along(station_labels)))]
  if (is.na(station_label)) {
    station_label <- series_name
  }
  
  p <- ggplot()
  
  # isimip3b future ribbon + median
  if (!is.null(env_isimip)) {
    p <- p +
      geom_ribbon(
        data = env_isimip,
        aes(x = prob_exceed_pct, ymin = q_min, ymax = q_max,
            fill = "isimip3b future"),
        alpha = 0.25
      ) +
      geom_line(
        data = env_isimip,
        aes(x = prob_exceed_pct, y = q_med,
            colour = "isimip3b median"),
        linewidth = 0.3
      )
  }
  
  # restore4life future ribbon + median
  if (!is.null(env_r4l)) {
    p <- p +
      geom_ribbon(
        data = env_r4l,
        aes(x = prob_exceed_pct, ymin = q_min, ymax = q_max,
            fill = "restore4life future"),
        alpha = 0.25
      ) +
      geom_line(
        data = env_r4l,
        aes(x = prob_exceed_pct, y = q_med,
            colour = "restore4life median"),
        linewidth = 0.3
      )
  }
  
  # measured ??? black solid line
  if (nrow(df_measured_fdc) > 0) {
    p <- p +
      geom_line(
        data = df_measured_fdc,
        aes(x = prob_exceed_pct, y = value,
            colour = "measured"),
        linewidth = 0.3
      )
  }
  
  # modelled ??? grey solid line
  if (nrow(df_modelled_fdc) > 0) {
    p <- p +
      geom_line(
        data = df_modelled_fdc,
        aes(x = prob_exceed_pct, y = value,
            colour = "modelled"),
        linewidth = 0.3
      )
  }
  
  # isimip3b historical ??? same family colour, dashed
  if (nrow(df_isimip_hist_fdc) > 0) {
    p <- p +
      geom_line(
        data = df_isimip_hist_fdc,
        aes(x = prob_exceed_pct, y = value,
            colour = "isimip3b historical"),
        linewidth = 0.3,
        linetype = "dashed"
      )
  }
  
  # restore4life historical ??? same family colour, dashed
  if (nrow(df_r4l_hist_fdc) > 0) {
    p <- p +
      geom_line(
        data = df_r4l_hist_fdc,
        aes(x = prob_exceed_pct, y = value,
            colour = "restore4life historical"),
        linewidth = 0.3,
        linetype = "dashed"
      )
  }
  
  p +
    scale_y_log10(
      name = "Discharge (m3/s, log10)"
    ) +
    scale_x_reverse(
      name   = "Exceedance probability (%)",
      limits = c(100, 0)
    ) +
    scale_fill_manual(
      name   = "Envelopes",
      values = c(
        "isimip3b future"     = "#9ECAE1",
        "restore4life future" = "#A1D99B"
      ),
      guide = guide_legend(order = 1)
    ) +
    scale_colour_manual(
      name   = "Lines",
      values = c(
        "isimip3b median"         = "#08519C",  # dark blue
        "isimip3b historical"     = "#6BAED6",  # lighter blue, dashed
        "restore4life median"     = "#238B45",  # dark green
        "restore4life historical" = "#74C476",  # lighter green, dashed
        "measured"                = "black",
        "modelled"                = "grey40"
      ),
      guide = guide_legend(order = 2)
    ) +
    labs(
      title    = paste0(station_label, " ??? FDC comparison"),
      subtitle = "isimip3b vs restore4life (future envelope + measured/modelled + historical)"
    ) +
    theme_minimal(base_size = 11) +
    theme(
      panel.grid.minor = element_blank(),
      legend.position  = "right"
    )
}

############################################################
# GENERATE AND SAVE THE NEW FDC COMPARISON PLOTS
# FOR EACH STATION
############################################################

out_dir_fdc_isimip_restore <- file.path(base_root, "fdc_isimip_restore_comparison")
dir.create(out_dir_fdc_isimip_restore, recursive = TRUE, showWarnings = FALSE)

# Here the code simply assumes G1..G13 exist.
fdc_series_for_plot <- paste0("G", 1:13)

for (s in fdc_series_for_plot) {
  
  message("Generating combined FDC plot for station: ", s)
  
  p <- plot_fdc_isimip_restore(s)
  if (is.null(p)) next
  
  idx <- match(s, paste0("G", seq_along(station_ids)))
  station_file_id <- if (!is.na(idx)) station_ids[idx] else s
  
  filename <- paste0(
    "FDC_isimip_restore_comparison_",
    s, "_",
    station_file_id,
    ".png"
  )
  
  ggsave(
    filename = file.path(out_dir_fdc_isimip_restore, filename),
    plot     = p,
    width    = 7,
    height   = 5,
    dpi      = 300
  )
}

message("The new FDC comparison plots were created for all stations (isimip3b vs restore4life + measured/modelled + historical).")