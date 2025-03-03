# Calibration

This folder hold the calibration tool and documentation for calibration
We use here the example of the subbasin Morova, but the tool can be used for any other subbasin, too.

Please see: [https://cwatm.iiasa.ac.at/calibration.html](https://cwatm.iiasa.ac.at/calibration.html).

##Update
PB 08/01/25

- using new format of storing timeseries as .csv
- using .csv format to store best result in out/streamflow_simulated_best.csv
- adding enforcing utf8 and pathnames can have a ".". (lessons from Sofia Dec,2024)
- adding preprocessing without pcraster (and joining scripts)
	- CAL_1_CAL_VAL_PERIODS_new.py  (calculating calibration and validation periods)
	- CAL_2_PREP_new.py (calculating subbsins and completing metadata)
	- CAL_5_PREP_FORCING_new.py (setting up calibration folders and maps)
- adding postprocessing without pcraster 
	- CAL_9_PARAMETER_MAPS_new.py (creating calibration map sets)
	- CAL_10_COMPUTE_STATS_AND_FIGURES_TIME_SERIES.py (creating figures)
- adding a few optionin settings (delruns = True, sharedmem = True)
- deleted a few parts in settings which are not used anymore



## Calibration tool for Hydrological models

using a distributed evolutionary algorithms in python
DEAP library
https://github.com/DEAP/deap/blob/master/README.md

Félix-Antoine Fortin, François-Michel De Rainville, Marc-André Gardner, Marc Parizeau and Christian Gagné, "DEAP: Evolutionary Algorithms Made Easy", Journal of Machine Learning Research, vol. 13, pp. 2171-2175, jul 2012

The calibration tool was created by Hylke Beck 2014 (JRC, Princeton) hylkeb@princeton.edu
Thanks Hylke for making it available for use and modification
Modified by Peter Burek

The submodule Hydrostats was created 2011 by:
Sat Kumar Tomer (modified by Hylke Beck)
Please see his book "Python in Hydrology"   http://greenteapress.com/pythonhydro/pythonhydro.pdf


How it works
============

The calibration tool builds up a single-objective obtimization framework using the Python libray DEAP
For each run it triggers the run of the hydrological model:
- using a template of the settings file
- replacing the output folder in this template file
- replace placeholders with the values of calibration parameters, the limit of the parameter range is given in the file: ParamRanges.csv

After each run the model run is compared to observed values (e.g. observed_data/lobith2006.csv)

After the calibration, statistics and the best run is printed output


What is needed
==============

1.) The template files in ../templates have to be adjusted
1.1) runpy.bat: the path to cwatm.py have to be set correctly (for linux a .sh file has to be created)
1.2) The actual version of a cwatm settings file has to modified:
   - replacing the output folder with the placeholder: %run_rand_id
   - replacing calibration parameter values with a placeholder: e.g. %SnowMelt

2.) the range of parameter space has to be defined in ParamRanges.csv

3.) The observed discharge has to be provided in an .cvs file e.g. observed_data/lobith2006.csv
3.1) In the template settings the date has to be set, so that the period of observed discharge is between SpinUp and StepEnd

4.) And empty ../catchments directory needs to be created

5.) A few option in the settings.txt have to be adjusted (how many runs?, a first run with satndard parameters? etc)

6.) run python calibration_single.py settings.txt


Recommendations
===============

1. Run the model first to store the pot. evaporation results
   Afterwards use the stored evaporation to run the calibration
   calc_evaporation = False
   
2. Run the model and store the last day to be used as initial condition for the calibration runs
   Best is to use a long term run for this.
   load_initial = False
   save_initial = True
   During calibration use:
   load_initial = True
   save_initial = False
   
3. Use a long SpinUp time (> 5years to give groundwater enough time)
   

