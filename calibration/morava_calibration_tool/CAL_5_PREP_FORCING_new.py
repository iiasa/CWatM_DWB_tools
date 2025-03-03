# -*- coding: utf-8 -*-
"""Please refer to quick_guide.pdf for usage instructions"""

import os
import sys
import random
import numpy as np
import pandas
import time
import struct
from configparser import ConfigParser

import shutil
import rasterio
import pyflwdir

import warnings
warnings.filterwarnings("ignore")

########################################################################
#   Read settings file
########################################################################



def resize_min(array,transform):
    # Identify rows and columns that are not all zeros
    non_zero_rows = np.any(array != 0, axis=1)  # Check for non-zero rows
    non_zero_cols = np.any(array != 0, axis=0)  # Check for non-zero columns
    first_row = np.argmax(non_zero_rows)
    first_col = np.argmax(non_zero_cols)

    r_array = array[non_zero_rows][:, non_zero_cols]
    shape1 = r_array.shape
    # change transform
    xs = transform[2] + transform[0] *  first_col
    ys = transform[5] - transform[0] *  first_row
    transform_new = transform._replace(c=xs,f=ys)

    return r_array,transform_new

def downstream(lat,lon):

    ldd_x = [0, -1, 0, 1,  -1, 0, 1,  -1, 0, 1]
    ldd_y = [0, 1, 1, 1,    0, 0, 0,  -1, -1, -1]

    y, x = src.index(lon, lat)
    ldd1 = ldd[y, x]
    y1 = y + ldd_y[ldd1]
    x1 = x + ldd_x[ldd1]
    lat1 = lat - ldd_y[ldd1] * transform1[0]
    lon1 = lon + ldd_x[ldd1] * transform1[0]

    return y1,x1,lat1,lon1






#iniFile = os.path.normpath(sys.argv[1])
iniFile = "settings1.txt"
print("=================== START ===================")
print(iniFile)

if not (os.path.isfile(iniFile)):
    print("No inifile found or error reading")
    sys.exit()


CatchmentArea = "CatchmentArea"
# iniFile = os.path.normpath(settings)

parser = ConfigParser()
parser.read(iniFile)

root = parser.get('DEFAULT', 'Root')
rootbasin = parser.get('DEFAULT', 'Rootbasin')
root = root + "/" + rootbasin

path_maps = os.path.join(root, os.path.join(parser.get('Path', 'CatchmentDataPath')))
path_result = os.path.join(root, parser.get('Path', 'Result'))

CatchmentDataPath = os.path.join(root,parser.get('Path','CatchmentDataPath'))
SubCatchmentPath = os.path.join(root,parser.get('Path','SubCatchmentPath'))

Qtss_csv = os.path.join(root, parser.get('ObservedData', 'Qtss'))
Qgis_csv = os.path.join(root, parser.get('ObservedData', 'Qgis'))
Qgis_out = os.path.join(root, parser.get('ObservedData', 'QgisOut'))

#switch_SubsetMeteoData = int(parser.get('DEFAULT', 'SubsetMeteoData'))

########################################################################
#   Make stationdata array from the qgis csv
########################################################################

print (">> Reading Qgis2.csv file...")
stationdata = pandas.read_csv(os.path.join(Qgis_csv),sep=",",index_col=0)
stationdata_sorted = stationdata.sort_values(by=[CatchmentArea],ascending=True)

# ------------------------------------
ldd_map = os.path.join(path_maps,"ldd.tif")
with rasterio.open(ldd_map, 'r') as src:
    ldd = src.read(1)
src.close()




interstation_regions_map = os.path.join(path_result, "interstation_regions.tif")
with rasterio.open(interstation_regions_map, 'r') as src:
    interstation_regions = src.read(1)
    shapeinter = src.shape
    transform1 = src.transform
    crs1 = src.crs
    latlon = src.crs.to_epsg()


j =0
for index, row in stationdata_sorted.iterrows():

    print ("=================== "+row['ID']+" ====================")
    print (">> Starting map subsetting for catchment "+row['ID']+", size "+str(row[CatchmentArea])+" pixels...")

    path_subcatch = os.path.join(SubCatchmentPath,row['ID'])

    # Delete all files in catchment directory
    for root, dirs, files in os.walk(path_subcatch, topdown=False):
         
        for name in files:
            os.remove(os.path.join(root, name))
            #print "   Deleting "+name
        for name in dirs:
            #print "   Deleting "+os.path.join(root, name)
            os.rmdir(os.path.join(root, name))
    if not os.path.exists(path_subcatch):
        os.makedirs(path_subcatch)
    if not os.path.exists(os.path.join(path_subcatch,'maps')):
        os.makedirs(os.path.join(path_subcatch,'maps'))
    if not os.path.exists(os.path.join(path_subcatch,'inflow')):
        os.makedirs(os.path.join(path_subcatch,'inflow'))
    if not os.path.exists(os.path.join(path_subcatch,'out')):
        os.makedirs(os.path.join(path_subcatch,'out'))
    
    # Make mask map for subcatchment
    subcatchment = np.where(interstation_regions == index,1,0)
    #PB  small mask needed
    smallsubcatchmask,transform2 = resize_min(subcatchment, transform1)

    subcatchmask_map = os.path.join(path_subcatch,"maps","mask.tif")
    z = subcatchment.astype('int16')
    with rasterio.open(subcatchmask_map, 'w', driver='GTiff',
                       height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype, crs=latlon,
                       transform=transform1, ) as dst:
        dst.write(z, 1)

    smallsubcatchmask_map = os.path.join(path_subcatch, "maps", "masksmall.tif")
    z = smallsubcatchmask.astype('int16')
    with rasterio.open(smallsubcatchmask_map, 'w', driver='GTiff',
                       height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype, crs=latlon,
                       transform=transform2, ) as dst:
        dst.write(z, 1)
    with rasterio.open(smallsubcatchmask_map, 'r') as src2:
        crs2 = src2.crs




    # Ensure that there is only one outlet pixel in outlet map
    outlet = subcatchment * 0
    y, x = src.index(row['lon'], row['lat'])
    outlet[y,x] = 1

    outletsmall = smallsubcatchmask * 0
    y, x = src2.index(row['lon'], row['lat'])
    outletsmall[y,x] = 1

    outlet_map = os.path.join(path_subcatch,"maps","outlet.tif")
    z = outlet.astype('int16')
    with rasterio.open(outlet_map, 'w', driver='GTiff',
                       height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype, crs=latlon,
                       transform=transform1, ) as dst:
        dst.write(z, 1)
    outletsmall_map = os.path.join(path_subcatch,"maps","outlet.tif")
    z = outletsmall.astype('int16')
    with rasterio.open(outletsmall_map, 'w', driver='GTiff',
                       height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype, crs=latlon,
                       transform=transform2, ) as dst:
        dst.write(z, 1)

    outlet_txt = os.path.join(path_subcatch, "maps", "gaugeloc.txt")
    with open(outlet_txt, 'w') as file:
        s = str(row['lon']) + " " + str(row['lat']) + " 1\n"
        file.write(s)
    file.close()





    # Make inlet map
    inlet = subcatchment * 0
    if row['Inflow'] > 0:
        inflows = row['Inflow_ID'].split(" ")

        inflowdict = {}
        for inflow in inflows:
            lat = stationdata.loc[int(inflow[1:]), 'lat']
            lon = stationdata.loc[int(inflow[1:]), 'lon']

            y1,x1,lat1,lon1 = downstream(lat,lon)
            for j in range(10):
                unique = True
                for dic in inflowdict:
                    y = inflowdict[dic][0]
                    x = inflowdict[dic][1]
                    if (y==y1) and (x==x1):
                        unique = False
                        y1, x1, lat1, lon1 = downstream(lat1, lon1)
                if unique:
                    break
            inflowdict[inflow] = [y1,x1,lat1,lon1]
            inlet[y1, x1] = int(inflow[1:])


        inflow_txt = os.path.join(path_subcatch, "inflow", "inflowloc.txt")
        s1 = ""
        with open(inflow_txt, 'w') as file:
            for dic in inflowdict:
                lat = inflowdict[dic][2]
                lon = inflowdict[dic][3]
                s = str(lon) + " " + str(lat) + " " + str(int(dic[1:])) + "\n"
                s1 = s1 + " " + str(lon) + " " + str(lat)
                file.write(s)
        file.close()

        inflow_txt = os.path.join(path_subcatch, "inflow", "inflowloc2.txt")
        f = open(inflow_txt, "w")
        f.write(s1 + "\n")
        f.close()


        inlets_map = os.path.join(path_subcatch,"inflow","inflow.tif")
        z = inlet.astype('int16')
        with rasterio.open(inlets_map, 'w', driver='GTiff',
                           height=z.shape[0], width=z.shape[1], count=1, dtype=z.dtype, crs=latlon,
                           transform=transform1, ) as dst:
            dst.write(z, 1)



# Write stationdata dataframe to Qgis3.csv in results directory
#stationdata.to_csv(Qgis_out,',')

print ("==================== END ====================")