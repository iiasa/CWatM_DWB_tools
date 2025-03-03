# -*- coding: utf-8 -*-
"""Please refer to quick_guide.pdf for usage instructions"""

import os
import sys
import pdb
import pandas
import string
import datetime
import time
import numpy as np
import re
from configparser import ConfigParser
import array
import logging
import random
from shutil import copyfile

import rasterio
import pyflwdir


import warnings
warnings.filterwarnings("ignore")

if __name__=="__main__":

    ########################################################################
    #   Read settings file
    ########################################################################

    #iniFile = os.path.normpath(sys.argv[1])
    iniFile = "settings1.txt"
    print ("=================== START ===================")
    print (iniFile)

    if not (os.path.isfile(iniFile)):
        print("No inifile found or error reading")
        sys.exit()

    #iniFile = os.path.normpath(settings)

    parser = ConfigParser()
    parser.read(iniFile)

    root = parser.get('DEFAULT', 'Root')
    rootbasin = parser.get('DEFAULT', 'Rootbasin')
    root = root + "/"+ rootbasin

    path_maps = os.path.join(root,os.path.join(parser.get('Path', 'CatchmentDataPath')))
    path_result = os.path.join(root,parser.get('Path', 'Result'))

    ForcingStart = datetime.datetime.strptime(parser.get('DEFAULT','ForcingStart'),"%d/%m/%Y")  # Start of forcing
    ForcingEnd = datetime.datetime.strptime(parser.get('DEFAULT','ForcingEnd'),"%d/%m/%Y")  # Start of forcing

    Qtss_csv =  os.path.join(root,parser.get('ObservedData', 'Qtss'))
    Qgis_csv =  os.path.join(root,parser.get('ObservedData', 'Qgis'))
    Qgis_out = os.path.join(root,parser.get('ObservedData', 'QgisOut'))

    ########################################################################
    #   Make stationdata array from the qgis csv
    ########################################################################

    print (">> Reading Qgis2.csv file...")
    stationdata = pandas.read_csv(os.path.join(Qgis_csv),sep=",",index_col=0)

    
    ########################################################################
    #   Make map with station locations
    ########################################################################
  
    print (">> Make map with station locations (outlet.map)...")

    # clone map for the area
    ldd_map = os.path.join(path_maps,"ldd.tif")


    with rasterio.open(ldd_map, 'r') as src:
        ldd = src.read(1)
        shapeinter = src.shape
        transform1 = src.transform
        crs1 = src.crs
        latlon = src.crs.to_epsg()



    # create folders
    if not os.path.exists(path_result): os.makedirs(path_result)

    station_map = os.path.join(path_result,"outlet.tif")
    station = np.zeros((shapeinter[0],shapeinter[1])).astype("int")
    stationinfo = {}

    for index, row in stationdata.iterrows():
        y,x = src.index(row['lon'],row['lat'])
        stationinfo[row['ID']] = [row['lat'],row['lon'],y,x]
        station[y,x] = index


    z = station
    with rasterio.open(station_map, 'w', driver='GTiff',
                       height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype, crs=latlon,
                       transform=transform1, ) as dst:
        dst.write(z, 1)



    ########################################################################
    #     Check for station location conflicts (stations with same coordinates)
    ########################################################################
    
    print (">> Check for station conflicts...")
    counter = 0
    for index1 in stationinfo:
        y1 = stationinfo[index1][2]
        x1 = stationinfo[index1][3]
        for index2 in stationinfo:
            if index1 != index2:
                y2 = stationinfo[index2][2]
                x2 = stationinfo[index2][3]
                if (y1==y2) and (x1==x2):
                    counter += 1
                    print ("station", index1, "has the same location as station", index2)

    if counter>0:
        print ("Number of station location conflicts: "+str(counter))
        sys.exit()
    else:
        print ("all stations have differewnt location , all fine")


    ########################################################################
    #   Compute catchment mask maps and write to temporary directory and
    #   make array with catchment upstream number of pixels
    ########################################################################
  
    sys.stdout.write(">> Compute catchment masks (catchmaskXXXXX.map)")
  
    stationdata['CatchmentArea'] = np.nan

    # flwdir library
    flw = pyflwdir.from_array(ldd, ftype="ldd", transform=transform1, latlon=latlon)
    accufluxkm2 = flw.upstream_area('km2')
    accufluxcell = flw.upstream_area('cell')

    for index, row in stationdata.iterrows():
        subbasin = flw.basins(xy=(row['lon'],row['lat']))
        #y, x = src.index(row['lon'], row['lat'])
        #value = accufluxcell[y,x]
        value = np.sum(subbasin)
        stationdata.loc[index, 'CatchmentArea'] = float(value)
        """
        z = subbasin.astype('int16')
        catchment_map = os.path.join(path_result, "catchmask%05d.tif" % float(index))
        with rasterio.open(catchment_map, 'w', driver='GTiff',
                           height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype, crs=latlon,
                           transform=transform1, ) as dst:
            dst.write(z, 1)
        """
  
    ########################################################################
    #   Make map with IDs for interstation regions
    #   Make map with sampling frequency for interstation regions
    #   The map indicates how many times a particular pixel is included in a
    #   catchment
    ########################################################################
  
    sys.stdout.write("\n>> Compute interstation regions (interstation_regions.tif)")

    interstation_regions = np.zeros((shapeinter[0], shapeinter[1])).astype("int")
    sampling_frequency = np.zeros((shapeinter[0], shapeinter[1])).astype("int")

    stationdata_sorted = stationdata.sort_values(by=['CatchmentArea'],ascending=True)
    for index, row in stationdata_sorted.iterrows():
        subbasin = flw.basins(xy=(row['lon'], row['lat']))
        interstation_regions = np.where(interstation_regions==0,subbasin * index,interstation_regions)
        sampling_frequency = sampling_frequency + subbasin



    z = interstation_regions.astype('int16')
    interstation_regions_map = os.path.join(path_result,"interstation_regions.tif")
    with rasterio.open(interstation_regions_map, 'w', driver='GTiff',
                       height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype, crs=latlon,
                       transform=transform1, ) as dst:
        dst.write(z, 1)


    max_val = np.max(sampling_frequency)
    z = sampling_frequency.astype('int16')
    sampling_frequency_map = os.path.join(path_result, "sampling_frequency.tif")
    with rasterio.open(sampling_frequency_map, 'w', driver='GTiff',
                       height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype, crs=latlon,
                       transform=transform1, ) as dst:
        dst.write(z, 1)




    ########################################################################
    #   Make csv listing for each catchment 1) the directly connected
    #   subcatchments and 2) the corresponding inflow locations
    ########################################################################

    sys.stdout.write("\n>> Compute links and inflow locations (inlets.map and direct_links.csv)")

    stationdata['SamplingFrequency'] = np.nan
    stationdata['Inflow'] = np.nan
    stationdata['Inflow_ID'] = np.nan


    for index, row in stationdata.iterrows():
        y, x = src.index(row['lon'], row['lat'])
        value = sampling_frequency[y,x]
        stationdata.loc[index, 'SamplingFrequency'] = float(value)


    direct_links_csv = os.path.join(path_result, "direct_links1.csv")
    f2 = open(direct_links_csv, "w")
    f2.write("ID,IDs of directly connected nested subcatchments,,,,,,,,,,,,,,,,,,,\n")

    inlets_map = np.zeros((shapeinter[0], shapeinter[1])).astype("int")

    for index, row in stationdata.iterrows():

        text2 = row['ID']
        s = ""
        count = 0
        sampling = int(row['SamplingFrequency'])

        subbasin = flw.basins(xy=(row['lon'], row['lat']))
        # station
        stationsub = np.where(subbasin==0,0,station)

        stationsub = np.unique(stationsub)
        d1 = np.where(stationsub==0)
        stationsub = np.delete(stationsub,d1)
        commas = 20
        # loop over subcatchments
        for subcatchment in stationsub:
            # check if directly connected subcatchment
            # if SamplingFrequency of subcatchment is 1 higher than catchment,
            # then they are directly connected
            samplingtest = stationdata.loc[subcatchment, 'SamplingFrequency']
            if (sampling + 1) == samplingtest:
                text2 += "," + stationdata.loc[subcatchment, 'ID']
                commas -= 1
                if count > 0:
                    s = s + " "
                count = count + 1
                s = s + stationdata.loc[subcatchment, 'ID']

        for cc in range(commas):  # Add commas because the number of commas must be the same for each
            text2 += ","
        text2 += "\n"
        f2.write(text2)

        stationdata.loc[index, 'Inflow'] = count
        stationdata.loc[index, 'Inflow_ID'] = s

    f2.close()

    # save dataframe with catchment area and cal val period columns
    print("\n>> Saving Qgis file including CatchmentArea, columns (Qgis2.csv)...")
    stationdata_sorted = stationdata.sort_values(by=['CatchmentArea'], ascending=True)
    stationdata_sorted.to_csv(os.path.join(Qgis_out), ',')
    print("==================== END ====================")


