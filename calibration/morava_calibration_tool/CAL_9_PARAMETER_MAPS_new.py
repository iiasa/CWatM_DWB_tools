# -*- coding: utf-8 -*-
"""Please refer to quick_guide.pdf for usage instructions"""

import os
import sys

import pandas
import datetime
import time as timex
import numpy as np
from configparser import ConfigParser
import rasterio
from netCDF4 import Dataset

# -------------------------------------------------------
def writenet(reso,lon1,lon2,lat1,lat2,inputmap,netfile,value_name,value_standard_name, value_long_name,value_unit,fillval,description):

    xcoord='lon'
    ycoord='lat'

    lats = np.arange(lat1, lat2, -reso)
    lons = np.arange(lon1, lon2, reso)



    nf1 = Dataset(netfile, 'w', format='NETCDF4_CLASSIC')
    digit=2

    #general Attributes
    nf1.history = 'Created ' + timex.ctime(timex.time())
    nf1.conventions = 'CF-1.6'
    nf1.source_software = 'Python netCDF4 Classic'
    nf1.title = description
    nf1.keywords ='CWATM, Danube, 1arcmin WGS84'
    nf1.source = 'CWATM calibration parameter maps for Danube 1min'
    nf1.institution ="IIASA Water Security"


    # Dimension
    lon = nf1.createDimension(xcoord, inputmap.shape[1])
    lat = nf1.createDimension(ycoord, inputmap.shape[0])
    # time = nf1.createDimension('time', None)

    # Variables
    longitude = nf1.createVariable(xcoord, 'f8', (xcoord))
    latitude = nf1.createVariable(ycoord, 'f8', (ycoord))

    longitude.standard_name = 'longitude'
    longitude.long_name = 'longitude'
    longitude.units = 'degrees_east'

    latitude.long_name = 'latitude'
    latitude.units = 'degrees_north'
    latitude.standard_name = 'latitude'


    mv = 1e20
    if fillval == "i2" or fillval == "i4":
        mv = -2147483648
    if fillval == "i1":
        mv = 0


    # value and maybe packing
    value = nf1.createVariable(value_name, fillval, ('lat', 'lon',),chunksizes=(len(lats),len(lons)), fill_value=mv, zlib=True)

    value.standard_name= value_standard_name
    value.long_name= value_long_name
    value.units = value_unit
    value.__FillValue =  1e20

    value.esri_pe_string = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]'

    if fillval=="i2" or fillval=="i4":
        value.missing_value=-2147483648
    if fillval=="i1":
        value.missing_value=0

    # Fill variables
    latitude[:] = lats
    longitude[:] = lons

    value[:,:] = inputmap

    nf1.close()
#-------------------------------------------------------------



if __name__=="__main__":

	########################################################################
	#   Read settings file
	########################################################################

	#iniFile = os.path.normpath(sys.argv[1])
	iniFile = "settings1.txt"
	print ("=================== START ===================")
	print (">> Reading settings file ("+iniFile+")...")

	if not (os.path.isfile(iniFile)):
		print("No inifile found or error reading")
		sys.exit()

	parser = ConfigParser()
	parser.read(iniFile)

	root = parser.get('DEFAULT', 'Root')
	rootbasin = parser.get('DEFAULT', 'Rootbasin')
	root = os.path.join(root, rootbasin)

	#path_temp = os.path.join(root, parser.get('Path', 'Temp'))
	#path_maps = os.path.join(root, os.path.join(parser.get('Path', 'CatchmentDataPath'), "maps_pcraster"))
	path_result = os.path.join(root, parser.get('Path', 'Result'))
	ParamRangesPath = os.path.join(root, parser.get('Path', 'ParamRanges'))

	CatchmentDataPath = os.path.join(root, parser.get('Path', 'CatchmentDataPath'))
	SubCatchmentPath = os.path.join(root, parser.get('Path', 'SubCatchmentPath'))
	
	ForcingStart = datetime.datetime.strptime(parser.get('DEFAULT','ForcingStart'),"%d/%m/%Y")  # Start of forcing
	ForcingEnd = datetime.datetime.strptime(parser.get('DEFAULT','ForcingEnd'),"%d/%m/%Y")  # Start of forcing

	Qtss_csv = os.path.join(root, parser.get('ObservedData', 'Qtss'))
	Qgis_csv = os.path.join(root, parser.get('ObservedData', 'Qgis'))
	Qgis_out = os.path.join(root, parser.get('ObservedData', 'QgisOut'))


	########################################################################
	#   Make stationdata array from the qgis csv
	########################################################################

	print (">> Reading Qgis2.csv file...")
	stationdata = pandas.read_csv(os.path.join(Qgis_csv), sep=",", index_col=0)

	
	########################################################################
	#   Assign calibrated parameter values to maps
	########################################################################

	# Load paramranges file
	ParamRanges = pandas.read_csv(ParamRangesPath,sep=",",index_col=0)

	# Initialize parameter maps
	#interstation_regions_map = os.path.join(path_result,"interstation_regions.map")

	# new
	interstation_file = os.path.join(path_result, "interstation_regions.tif")
	with rasterio.open(interstation_file, 'r') as src:
		interstation_regions = src.read(1).astype(int)
		shapeinter = src.shape
		transform1 = src.transform
		crs1 = src.crs
		latlon = src.crs.to_epsg()

	lenparas = len(ParamRanges)
	paraKGE = np.zeros((shapeinter[0],shapeinter[1]))
	paras = np.zeros((lenparas, shapeinter[0],shapeinter[1]))

	# Assign calibrated parameter values to maps
	count_front = 0

	for index, row in stationdata.iterrows():
		
		#if np.isnan(row["CatchmentArea"]):
		#	continue
		
		print ("Assigning values for catchment "+row['ID']+", size "+str(int(row['CatchmentArea']))+" cells")
		
		# Load calibrated parameter values for this catchment        
		# We want values on first line, since pareto_front is sorted by overall efficiency 
		# in descending order
		path_subcatch = os.path.join(SubCatchmentPath,row['ID'])
		if os.path.isfile(os.path.join(path_subcatch,"pareto_front.csv")):
			count_front = count_front+1;
			pareto_front = pandas.read_csv(os.path.join(path_subcatch,"pareto_front.csv"))
		
			# Assign these to maps
			paramvalue = pareto_front["effover"][0]
			paraKGE = np.where(interstation_regions==index,paramvalue,paraKGE)
			for ii in range(lenparas):
				paramvalue = pareto_front["param_" + str(ii).zfill(2) + "_" + ParamRanges.index[ii]][0]
				paras[ii] = np.where(interstation_regions==index,paramvalue,paras[ii])

		else: # If pareto_front.csv doesn't exist, put -1
			print ("no pareto front", os.path.isfile(os.path.join(path_subcatch,"pareto_front.csv")))
	# Assign default values to uncalibrated areas
	# Ungauged areas have -1 in the interstation regions map
	# and -9999 in the parameter maps
	for ii in range(lenparas):
		paramvalue = ParamRanges.iloc[ii, 2]
		paras[ii] = np.where(interstation_regions == -1, paramvalue, paras[ii])





	# write files
	reso = np.round(transform1[0],14)
	lon1 = np.round(transform1[2],10)
	lat1 = np.round(transform1[5],10)

	lon2 = lon1 + shapeinter[1] * reso
	lat2 = lat1- shapeinter[0] * reso

	reso2 = reso / 2.0
	lat1 = lat1 - reso2
	lon1 = lon1 + reso2



	z = paraKGE
	name4 = path_result + "/" + "params_KGE.tif"
	with rasterio.open(name4, 'w', driver='GTiff',
					   height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype,crs=latlon,
					   transform=transform1, ) as dst:
		dst.write(z, 1)

	description = "KGE map from calibration result"
	writenet(reso,lon1,lon2,lat1,lat2,paraKGE, path_result + "/" + "params_KGE.nc", "KGE", "KGE", "Kling Gupta Efficiency", "-",
			 "f4", description)


	for ii in range(lenparas):
		z = paras[ii]
		pa = ParamRanges.index[ii]
		name4 = path_result + "/" + "params_"+ pa + ".tif"
		with rasterio.open(name4, 'w', driver='GTiff',
						   height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype,
						   transform=transform1, ) as dst:
			dst.write(z, 1)


		description = ParamRanges.index[ii] + " map"
		writenet(reso, lon1, lon2, lat1, lat2, paras[ii], path_result + "/" + "params_" + pa + ".nc", pa, pa,
				 pa +" map from calibration", "-",
				 "f4", description)



	print ("---------------------------------------------")
	print ("Number of catchments with pareto_front.csv: "+str(count_front)+"!")
	#rint ("Number of catchments with missing pareto_front.csv: "+str(count_nofront)+"!")
	print ("==================== END ====================")