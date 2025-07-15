# ==============================================================================
# Title      : Climate Model Ranking Based on EMO-1 Similarity
# Description: Ranks climate models by their deviation from EMO-1 reference 
#              for each indicator and basin. Computes total rank scores.
# Author     : NIHWM RO
# ==============================================================================

# Load Required Libraries -------------------------------------------------------
library(dplyr)
library(tidyr)

# Load data
ind_ini <- read.csv("path_to_csv_file",
                    header = TRUE, stringsAsFactors = FALSE)

# Reshape data to long format
ind_long <- pivot_longer(ind_ini,
                         cols = Danube.Rive:Drina.River.Basin,
                         names_to = "RiverBasin",
                         values_to = "Indicator_val")

# Rank models by absolute deviation from EMO-1
ind_ranked <- ind_long %>%
  group_by(Indicator, RiverBasin) %>%
  mutate(
    EMO1_val = Indicator_val[ID == "EMO-1"],
    diff_from_EMO1 = abs(Indicator_val - EMO1_val)
  ) %>%
  filter(!ID %in% c("EMO-1", "E-OBS")) %>%
  mutate(rank_to_EMO1 = rank(diff_from_EMO1, ties.method = "min")) %>%
  ungroup()

# Save ranked table
write.csv(ind_ranked, 
          "output_path", 
          row.names = FALSE)

# Summarize ranks per model and basin
ind_summary <- ind_ranked %>%
  group_by(ID, RiverBasin) %>%
  summarise(rank_sum = sum(rank_to_EMO1, na.rm = TRUE))

# View summary
View(ind_summary)

# End of script ----------------------------------------------------------------
