# CWatM Multiscale Water Balance Compiler & Plotter (v20)

## ENGLISH DESCRIPTION

This application is a portable, dynamic post-processing tool developed to evaluate the results of **CWatM (Community Water Model)** hydrological simulations performed within the **Danube Water Balance** project.

The program processes spatially averaged and point-based time-series outputs from the Community Water Model (CWatM), and checks and visualizes catchment-scale mass-balance (water-balance) closure at daily, monthly, and annual time scales. It reads CWatM settings files (`settings___.ini`), resolves paths and variables from the selected file, analyses the catchment's GeoTIFF mask, performs a mass-balance analysis using the saved time-series simulation results, and generates a multiscale Excel workbook containing embedded native charts.

### Main features

* **Dynamic grid and area detection:** Using Pillow, the program reads the number of active cells, coordinate system, and resolution directly from the `basin.tif` or `MaskMap` GeoTIFF file. For geographic grids, it applies a latitude-dependent distortion correction to every grid cell to calculate the exact physical area.

* **Consistent units:**
	CWatM saves different processes in different physical dimensions, such as discharge in m^3/s, volume in m^3, or cell-average water depth in metres or millimetres. To calculate the mass balance, the program dynamically converts every variable to millimetres, expressed as an equivalent water-column depth over the catchment area:
	- Precipitation and evapotranspiration (Area Average): outputs in metres per day are multiplied by 1,000 to obtain millimetres.
	- Channel and lake evaporation and storage (Area Sum / State Sum): volumes in m^3 are divided by the average grid-cell area in m^2 and then converted to millimetres.
	- Outflow discharge: discharge saved at the outlet in m^3/s is converted to daily volume in m^3 using the number of seconds per day (86,400 s), and is then divided by the total catchment area in m^2, automatically integrated from the GeoTIFF, to obtain runoff leaving the catchment in millimetres.

* **Signed-value convention:**
	The chart separates incoming and outgoing fluxes and displays them with signs that reflect the nature of the hydrological processes:
	- Negative fluxes (inflows; downward bars): rain, snow, and groundwater inflow (`unmetDemand`). The more intense the precipitation, the farther downward the bars extend, resembling falling precipitation.
	- Positive fluxes (outflows; upward bars): evapotranspiration, channel and lake evaporation, human water abstractions, and discharge leaving the catchment at its outlet. The more intense the evaporation or outflow, the higher the bars extend.
	- Storage-change line (black solid line): to ensure perfect balance closure, the combined storage change (S) of groundwater, soil moisture, snow, river channels, and lakes is shown as net storage depletion (dS). This ensures that the value of the black line at every time step equals the net height of the coloured bars (dS = inflows + outflows).

* **Native and editable Excel charts:**
	The program inserts interactive MS Excel combination water-balance charts into the daily, monthly, and annual worksheets. Users can subsequently edit and format these charts as required.

* **Lagged cross-correlation analysis:** The program calculates the cross-correlation between the daily closure error and the storage components over a lag range of -5 to +5 days.
	Because there is a natural routing lag between channel storage and outlet discharge, the cross-correlation between daily closure error and storage changes is calculated over lags ranging from -5 to +5 days. This helps identify temporal displacement in the model, such as channel-wave propagation that is too fast or too slow.

### Instructions for use

1. Copy `cwatm_tss_water_balance_compiler_EN.exe` directly into the directory containing the CWatM `settings___.ini` files.
2. In the `OPTIONS` section of `settings___.ini`, make sure that `savebasinmap = True` and `reportTss = True` are set.
3. In the `OUTPUT` section of `settings___.ini`, make sure that the following time series are configured for output:
	`OUT_TSS_AreaAvg_Daily = Rain, Snow, totalET, EvapWaterBodyM, act_totalIrrConsumption, act_nonIrrConsumption, unmetDemand, unmet_lost, storGroundwater, totalSto`
	`OUT_TSS_AreaSum_Daily = channelStorage, lakeResStorage, EvapoChannel`
	`OUT_TSS_Daily = discharge`
4. Ensure that the simulation has run with these settings and that either `basin.tif` or the configured `MaskMap` is present in the output directory as a valid, unmodified GeoTIFF file.
5. Run the `.exe` file. If the directory contains multiple `settings___.ini` files, the program will prompt you to select the appropriate one.
6. The generated results are saved in the output directory as `Overall_Water_Balance_Multiscale_Signed.xlsx`.
