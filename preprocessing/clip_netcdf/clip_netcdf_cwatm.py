
"""

Script which clip input maps (and meteo maps) from the whole danube settings to a defined mask map.
-	Input maps are all netcdf (.nc) files
-	Mask map can be defined as .map or .tif map or specified by columns/rows, resolution, lat max, lon min

"""


from osgeo import gdal
from osgeo import gdal
from osgeo import osr
import numpy as np

import time as timex
import netCDF4 as nc
from netCDF4 import num2date, date2num
from datetime import datetime, date, timedelta
import calendar

import os, sys
#import arcpy

import rasterio
import glob
# ----------------------



class ConvertMapsToNetCDF4():

    def __init__(self, attribute=None,transform=[],dimnew=None):

        # latitudes and longitudes
        if transform.size == 0:
            reso = 0.016666666666667
            reso2 = reso / 2.0
            lat1 = 72.25 - reso2
            lon1 = -25.25 + reso2
            self.latitudes = np.arange(lat1, 22.75, -reso)
            self.longitudes = np.arange(lon1, 50.25, reso)

        else:
            reso = transform[1]
            reso2 = reso / 2.0
            lat1 = transform[3] - reso2
            lat2 = lat1 - (dimnew[0] * reso) + 0.0000001
            lon1 = transform[0] + reso2
            lon2 = lon1 + (dimnew[1] * reso) - 0.0000001

            self.latitudes = np.arange(lat1, lat2, -reso)
            self.longitudes = np.arange(lon1, lon2, reso)


        # netCDF format and attributes:
        self.format = 'NETCDF4_CLASSIC'
        self.attributeDictionary = {}

        if attribute == None:
            # general Attributes
            ii = 1
        else:
            self.attributeDictionary = attribute



    def createNetCDF(self,rootgrp , varName, varStandard, varLong, varUnit,varDtype,varTime,inattrs,nf1,timelen):

        #rootgrp = Dataset(ncFileName, 'w', format=self.format)

        # general Attributes
        rootgrp.history = 'Created ' + timex.ctime(timex.time())
        rootgrp.Conventions = 'CF-1.6'
        rootgrp.source_software = "Python netCDF4 Classic"
        rootgrp.institution = 'IIASA BNR WAT'
        rootgrp.title = "CWatM Maps Danube"

        # -create dimensions - time is unlimited, others are fixed
        rootgrp.createDimension('lon', len(self.longitudes))
        rootgrp.createDimension('lat', len(self.latitudes))


        lon = rootgrp.createVariable('lon', 'f8', ('lon',))
        lon.standard_name = 'longitude'
        lon.long_name = 'longitude'
        lon.units = 'degrees_east'

        lat = rootgrp.createVariable('lat', 'f8', ('lat',))
        lat.long_name = 'latitude'
        lat.units = 'degrees_north'
        lat.standard_name = 'latitude'


        lon[:] = self.longitudes
        lat[:] = self.latitudes

        timeflag = True
        if timelen == 0:
            timeflag = False

        if timeflag:
            rootgrp.createDimension('time', timelen)  # 1981 -2016
            date_time = rootgrp.createVariable('time', 'f4', ('time',))
            date_time.standard_name = varTime[0]
            date_time.units =  varTime[1]
            date_time.calendar =  varTime[2]
            date_time.long_name =  varTime[3]

        for iVar in range(0, len(varName)):
            # ~ for iVar in range(1,1+1):

            if varDtype[iVar]=="float32":
                vartype = "f4"
                fillv = 1e20
            if varDtype[iVar]=="float64":
                vartype = "f8"
                fillv = 1e20
            if varDtype[iVar]=="int32":
                vartype = "i4"
                fillv = -2147483648
            if varDtype[iVar]=="int16":
                vartype = "i2"
                fillv = -2147483648
            if varDtype[iVar]=="int8":
                vartype = "i1"
                fillv = 0


            if timeflag:
                var = rootgrp.createVariable(varName[iVar], vartype, ('time','lat', 'lon',),  chunksizes=(1,len(lat),len(lon)), fill_value=fillv, zlib=True)
            else:
                var = rootgrp.createVariable(varName[iVar], vartype, ('lat', 'lon',), chunksizes=(len(lat), len(lon)), fill_value=fillv, zlib=True)
            var.standard_name = varStandard[iVar]
            var.long_name = varLong[iVar]
            var.units = varUnit[iVar]

        attributeDictionary = self.attributeDictionary
        #for k, v in attributeDictionary.items():
        #    setattr(rootgrp, k, v)
        #attributeDictionary = self.attributeDictionary
        for attr in inattrs:
            rootgrp.setncattr(attr, nf1.getncattr(attr) )

        #rootgrp.sync()
        #rootgrp.close()

    #-------------------------------------------
    def write2NetCDF(self, ncFileName, varName, varField, posCnt):

        # -write data to netCDF
        rootgrp = nc.Dataset(ncFileName, 'a')
        rootgrp.variables[varName][posCnt, :, :] = (varField)

        rootgrp.sync()
        rootgrp.close()

#-------------------------------------------
def makever(dirPath):
    path = ''
    for d in dirPath.split('\\'):
       # handle instances of // in string
       if not d: continue

       path += d + '/'
       if not os.path.isdir(path):
          os.mkdir(path)

#-------------------------------------------------------------
"""
copy manually:
- Danube1/input/landcover/crops/Crop_List_Danube_MAPSPAM2020.xlsx  -> input\landcover\crops
- Danube1/input/RCP_CO2  -> input/RCP_CO2 

run CWatM
- option: savebasinmap = True
- put the lon/lat of the last discharge station or last grid cell you want to have included
- run CWatM


"""
# ---------------------------------------------
dirIn =  "P:/watmodel/CWATM/Regions/Danube_1min/Danube1/input/"
dirOut = "P:/watmodel/CWATM/Regions/Danube_1min/Tisa/input/"


# ----------------------------------------------
mask = "P:/watmodel/CWATM/Regions/Danube_1min/Tisa/tisa_square.map"

"""
Use a mask map (can also be a geotif)
or
type in the dimension, the lon/lat and the resolution manually

"""


# ---------------------


# get the dimesion and lat,lon from mask

nf2 = gdal.Open(mask)
dimnew = [nf2.RasterYSize,nf2.RasterXSize]
transformmask = np.array(nf2.GetGeoTransform())
lonnew = transformmask[0]
latnew = transformmask[3]
reso = transformmask[1]

"""

dimnew = [90,180]
# transform = [ lon min, reso lon, 0, lat max, 0, - reso lat]
transformmask = np.array([ 13.5,  1.66667e-02,  0.0,  47.0,  0.0, -1.66667e-02])
lonnew  = 13.5
latnew  = 47.0
reso = 0.0166667

"""

# -------------------------


lendirIn = len(dirIn)
for name in glob.glob(dirIn+"**/*.nc", recursive=True):  # +'*.nc'
    print(name)
    path, name1 = os.path.split(name)

    # do not look into RCP_CO2
    if not("RCP_CO2" in path):
        #if not ("meteo" in path):
        new_path = dirOut + path[lendirIn:]
        if not(os.path.isdir(new_path)):
            #os.mkdir(new_path)
            makever(new_path)
            print("Directory '% s' created" % new_path)


        # make new netcdf
        new_name = new_path +"/"+name1
        if os.path.exists(new_name):
            print (new_name +" exists")
        else:

            nf1 = nc.Dataset(name, 'r')
            varname = list(nf1.variables.keys())[-1]
            dimension = nf1[varname].shape
            for name in list(nf1.variables.keys()):  # copy dimensions
                if name in ["time","Time"]:  # because some nc, files have Time instead of time. Latitude, Longitude instead of...
                    timedim = nf1[varname].shape
                if name in ["lat", "Lat"]:
                    lat = nf1.variables[name][:]
                    latstart = lat[0] - (lat[1]-lat[0])/2
                if name in ["lon", "Lon"]:
                    lon = nf1.variables[name][:]
                    lonstart = lon[0] - (lon[1]-lon[0])/2

            # resolution from the current netcdf
            #resonew = round((lon[1]-lon[0])/2,6)
            #resonew = reso
            #transformmask[1] = resonew
            #transformmask[5]= -resonew
            #dimnew1 = [round(dimnew[0]/resonew * reso,0),round(dimnew[1]/resonew * reso,0)]
            resonew = round((lon[1]-lon[0]),6)
            transformmask[1] = resonew
            transformmask[5]= -resonew
            dimnew1 = [round(dimnew[0]/resonew * reso,0),round(dimnew[1]/resonew * reso,0)]



            # array of mask map inside netcdf
            x1 = int(round((lonnew-lonstart)/resonew,0))
            x2 = int(x1 + dimnew1[1])
            y1 = int(round((latstart-latnew)/resonew,0))
            y2 = int(y1 + dimnew1[0])

            ## copy the global attributes to the new file
            inattrs = nf1.ncattrs()

            varName =[]
            varLong = []
            varUnit =[]
            varStandard =[]
            varDtype = []
            for name2, variable in nf1.variables.items():
                if not(name2 in ["lat","lon","laea","time","crs"]):
                    print (name2)
                    varDtype.append(variable.dtype)
                    varName.append(name2)
                    if "units" in variable.ncattrs():
                        varUnit.append(variable.getncattr("units"))
                    else:
                        varUnit.append("-")
                    if "standard_name" in variable.ncattrs():
                        varStandard.append(variable.getncattr("standard_name"))
                    else:
                        varStandard.append(name2)
                    if "long_name" in variable.ncattrs():
                        varLong.append(variable.getncattr("long_name"))
                    else:
                        varLong.append(name2)

            timesize = 0
            varTime=[]
            for name2, variable in nf1.variables.items():
                if name2 in ["time","Time"]:
                    timesize = nf1.dimensions[name2].size
                    if "standard_name" in variable.ncattrs():
                        varTime.append(variable.getncattr("standard_name"))
                    else:
                        varTime.append(name2)
                    if "units" in variable.ncattrs():
                        varTime.append(variable.getncattr("units"))
                    else:
                        varTime.append("days since 1901-01-01")
                    if "calendar" in variable.ncattrs():
                        varTime.append(variable.getncattr("calendar"))
                    else:
                        varTime.append("standard")
                    if "long_name" in variable.ncattrs():
                        varTime.append(variable.getncattr("long_name"))
                    else:
                        varTime.append(name2)



            tssNetCDF = ConvertMapsToNetCDF4(inattrs,transformmask,dimnew1)
            rootgrp = nc.Dataset(new_name, 'w')

            # test if LDD map and change
            #if varName[0] == "ldd":
            #    varDtype[0] = "int8"


            tssNetCDF.createNetCDF(rootgrp , varName, varStandard, varLong, varUnit,varDtype,varTime,inattrs,nf1,timesize)

            # -------------------
            if timesize > 0:
                timedate = nf1.variables['time'][:].data
                rootgrp.variables['time'][:]= (timedate)
            for name in varName:
                print(name)
                if timesize == 0:
                    z = nf1.variables[name][:, :].data[y1:y2, x1:x2]

                    if varName[0] == "ldd":
                        z[z>9] = 0
                        z[z<0] = 0
                        z=z.astype(int)
                        for x in range(z.shape[1]):
                            if z[0,x] > 6:
                                z[0,x] = 5
                            if z[-1, x] < 4:
                                z[0, x] = 5
                        for y in range(z.shape[0]):
                            if z[y,0] in [7,4,1]:
                                z[y,0] = 5
                            if z[y, -1] in [3,6,9]:
                                z[y, -1] = 5


                    rootgrp.variables[name][:, :] = (z)
                else:
                    for i in range(timesize):
                        #z = nf1.variables[name][:,:,:].data[i,y1:y2, x1:x2]
                        z = nf1.variables[name][i,y1:y2, x1:x2]
                        rootgrp.variables[name][i,:,:] = z

            nf1.close()
            rootgrp.sync()
            rootgrp.close()
            ii =1
