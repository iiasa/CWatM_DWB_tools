# ============================================================
# Tisza/Danube subcatchments: selection by ID + publication-quality map
# EPSG:3035 (ETRS89 / LAEA Europe)
# - study area outline: light grey
# - non-selected polygons: light grey fill + outline
# - selected polygons: green fill + red outline
# - legend labels in English: "Shown catchment" vs "Not shown catchment"
# - no x/y axis labels
# ============================================================

# ---- packages ----
required_pkgs <- c("sf", "dplyr", "ggplot2", "ggspatial", "units")
to_install <- required_pkgs[!required_pkgs %in% installed.packages()[,"Package"]]
if (length(to_install) > 0) install.packages(to_install, dependencies = TRUE)

library(sf)
library(dplyr)
library(ggplot2)
library(ggspatial)
library(units)

# ---- input your path to the polygon of your subcatchments (you can find the example in the base fata folder) ----
shp_path <- ""

# ID field name in the attribute table
id_field <- "ID"

# selected IDs (character codes)
selected_ids <- c("G0058","G0010","G0037", "G0100", "G0005", "G0051")

# outputs
out_pdf <- "selected_subcatchments_EPSG3035.pdf"
out_png <- "selected_subcatchments_EPSG3035.png"

# ---- read + prep ----
sf_use_s2(FALSE)
catch <- st_read(shp_path, quiet = TRUE) |> st_make_valid()
catch_3035 <- st_transform(catch, 3035)

# ---- attribute check ----
if (!id_field %in% names(catch_3035)) {
  stop(sprintf(
    "Cannot find ID field: '%s'. Available fields: %s",
    id_field, paste(names(catch_3035), collapse = ", ")
  ))
}

# ---- robust matching: always compare as character ----
id_vals <- as.character(catch_3035[[id_field]])
selected_ids_cast <- as.character(selected_ids)

# quick diagnostic (useful if everything turns grey)
cat("Matches found:", sum(id_vals %in% selected_ids_cast), "\n")
cat("First 10 IDs in shapefile:", paste(head(id_vals, 10), collapse = ", "), "\n")

# ---- classes for legend (English) ----
catch_3035$MAP_CLASS <- ifelse(
  id_vals %in% selected_ids_cast,
  "Shown catchment",
  "Not shown catchment"
)
catch_3035$MAP_CLASS <- factor(
  catch_3035$MAP_CLASS,
  levels = c("Not shown catchment", "Shown catchment")
)

sel <- catch_3035 %>% filter(MAP_CLASS == "Shown catchment")
if (nrow(sel) == 0) warning("Selection is empty (0 polygons). Check id_field and selected_ids.")

# ---- study area outline ----
study_outline <- st_union(catch_3035) |> st_make_valid()

# ---- optional projected grid (sf-version compatible) ----
grid_spacing_m <- 50000  # 50 km (set 25000 for denser grid)
bb_poly <- st_as_sfc(st_bbox(catch_3035))
grid_polygons <- st_make_grid(bb_poly, cellsize = grid_spacing_m, square = TRUE)
grid_lines <- st_boundary(grid_polygons)
grid_sf <- st_sf(geometry = grid_lines)

# ---- publication theme ----
base_theme <- theme_minimal(base_size = 10) +
  theme(
    panel.background = element_rect(fill = "white", color = NA),
    plot.background  = element_rect(fill = "white", color = NA),
    panel.grid       = element_blank(),
    axis.title       = element_blank(),     # no x/y labels
    axis.text        = element_text(size = 9),
    axis.ticks       = element_line(linewidth = 0.3),
    axis.ticks.length = unit(2, "mm"),
    panel.border     = element_rect(fill = NA, color = "black", linewidth = 0.4),
    legend.title     = element_blank(),
    legend.text      = element_text(size = 9)
  )

# ---- plot ----
p <- ggplot() +
  # grid (delete this line if you don't want it)
  geom_sf(data = grid_sf, color = "grey88", linewidth = 0.2, show.legend = FALSE) +
  
  # study area outline
  geom_sf(data = study_outline, fill = NA, color = "grey65", linewidth = 0.45, show.legend = FALSE) +
  
  # polygons with legend
  geom_sf(
    data = catch_3035,
    aes(fill = MAP_CLASS, color = MAP_CLASS),
    linewidth = 0.25
  ) +
  
  scale_fill_manual(
    values = c(
      "Not shown catchment" = "grey92",
      "Shown catchment"     = "#2CA25F"
    )
  ) +
  scale_color_manual(
    values = c(
      "Not shown catchment" = "grey75",
      "Shown catchment"     = "grey75"
    )
  ) +
  guides(
    fill = guide_legend(
      override.aes = list(linewidth = 0.8),
      keywidth = unit(10, "mm"),
      keyheight = unit(6, "mm")
    ),
    color = "none"
  ) +
  
  coord_sf(crs = st_crs(3035), expand = FALSE) +
  
  annotation_scale(location = "bl", width_hint = 0.25, line_width = 0.35, text_cex = 0.7) +
  annotation_north_arrow(
    location = "tl",
    which_north = "true",
    style = north_arrow_fancy_orienteering(line_col = "grey10", fill = c("grey10", "white")),
    height = unit(18, "mm"),
    width  = unit(18, "mm")
  ) +
  
  labs(
    title = "Sub-catchment selection for soil moisture analyses",
    subtitle = sprintf("Projection: EPSG:3035 | Selected catchments: %d", nrow(sel))
  ) +
  
  base_theme +
  theme(
    legend.position = c(0.75, 0.1),
    legend.background = element_rect(fill = "white", color = "grey60", linewidth = 0.3),
    legend.box.background = element_rect(color = "grey60", linewidth = 0.3)
  )

print(p)

# ---- save ----
# Note: on some Windows setups cairo_pdf may be unavailable. If this errors, use device = "pdf".
#please fill with your out directory in the paste0
ggsave(paste0("",out_pdf), p, width = 180, height = 140, units = "mm", dpi = 300, device = cairo_pdf)
ggsave(paste0("",out_png), p, width = 180, height = 140, units = "mm", dpi = 600, bg = "white")

message("Done. Outputs: ", out_pdf, " and ", out_png)
