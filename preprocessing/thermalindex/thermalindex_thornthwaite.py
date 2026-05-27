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
import pandas as pd
# ----------------------



class ConvertMapsToNetCDF4():

    def __init__(self, attribute=None,transform=[],dimnew=None):

        # latitudes and longitudes
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
        rootgrp.Atitle = "Thermal index of the year for daily modified Thornthwaite ETpot"

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
            years = timelen//365
            rootgrp.createDimension('time', years)  # 1981 -2016
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


            var = rootgrp.createVariable(varName[iVar], vartype, ('time','lat', 'lon',),  chunksizes=(1,len(lat),len(lon)), fill_value=fillv, zlib=True)
            var.standard_name = varStandard[iVar]
            var.long_name = varLong[iVar]
            var.units = varUnit[iVar]

        for attr in inattrs:
            rootgrp.setncattr(attr, nf1.getncattr(attr) )


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
- put the laon/lat of the last sation
- run CWatM


"""
# ---------------------------------------------
inputDir = "P:/watmodel/CWATM/Regions/Danube_1min/Danube1/input/landsurface/topo/"
dirIn =  "P:/watmodel/CWATM/Regions/Danube_1min/Danube/meteo/emo-1/"
dirOut = "P:/watmodel/CWATM/Regions/Danube_1min/Danube/meteo/et_thornthwaite_prerun/"
nameout = dirOut+ "ThermalIndex_EMO-1_1990_2022.nc"

# ----------------------------------------------
tavgfile = dirIn + "tas_EMO-1_1990_2022_degC.nc"
tminfile = dirIn + "tasmin_EMO-1_1990_2022_degC.nc"
tmaxfile = dirIn + "tasmax_EMO-1_1990_2022_degC.nc"
latfile = inputDir +"lat.nc"

mask = latfile

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
dimnew = [100,220]   # number of rows (y), number of cols (x))
# transform = [ lon min, reso lon, 0, lat max, 0, - reso lat]
transformmask = np.array([ 8.0,  0.1,  0.0,  51.0,  0.0, 0.1])
lonnew  = 8.0  # left x
latnew  = 51.0   # upper y
reso = 0.10
"""



## copy the global attributes to the new file
nf1 = nc.Dataset(tavgfile, 'r')
inattrs = nf1.ncattrs()
varTime = []
for name2, variable in nf1.variables.items():
    if name2 in ["time", "Time"]:
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

tssNetCDF = ConvertMapsToNetCDF4(inattrs, transformmask, dimnew)
rootgrp = nc.Dataset(nameout, 'w')

varName= ["thermalindex"]
varStandard =["Thermal Index"]
varLong = ["Thermal index of the year for daily modified Thornthwaite ETpot"]
varUnit =["degCel"]
varDtype =["float32"]
tssNetCDF.createNetCDF(rootgrp, varName, varStandard, varLong, varUnit, varDtype, varTime, inattrs, nf1, timesize)
nf1.close()
ii =1


# -------------------------
# 	k: parameter, found the be 0.69-0.72 (0.72 proposed by Camargo et al.
#   and 0.69 proposed by Pereira et al.)
kCamargo = 0.69


nf1 = nc.Dataset(latfile, 'r')
varname = list(nf1.variables.keys())[-1]
lat = nf1.variables[varname][:,:]
nf1.close()





# FAO 56 - https://www.fao.org/3/x0490E/x0490e07.htm#solar%20radiation  equation 39
# 	radian: local latitude [rad]
radian = np.pi / 180 * lat


ntas = nc.Dataset(tavgfile, 'r')
tasname = list(ntas.variables.keys())[-1]
ntasmin = nc.Dataset(tminfile, 'r')
tasminname = list(ntasmin.variables.keys())[-1]
ntasmax = nc.Dataset(tmaxfile, 'r')
tasmaxname = list(ntasmax.variables.keys())[-1]

timedate = ntas.variables['time'][:].data
dates = num2date(timedate, units=varTime[1], calendar=varTime[2])
dates = pd.to_datetime(dates.astype(str))
doy = dates.dayofyear


thermalsum = np.zeros(dimnew)
teffsum = np.zeros(dimnew)
daysmonth = 0
year = 0

for i in range(timesize):
    #print(i)

    # date2num(dates,units=times.units,calendar=times.calendar)

    tavg = ntas.variables[tasname][i,:,:]
    tmax = ntasmax.variables[tasmaxname][i, :, :]
    tmin = ntasmin.variables[tasminname][i, :, :]

    #distanceSun = 1 + 0.033 * np.cos(2 * np.pi * dateVar['doy'] / 365)
    declin = 0.409 * np.sin(2 * np.pi * doy[i] / 365 - 1.39)
    # 	ws: the hourly angle between sunrise and sunset [rad]
    ws = np.arccos(-np.tan(radian * np.tan(declin)))
    # Photoperiod (daylength)
    N = ws * 24 / np.pi

    # Effective temperature (Camargo et al. 1999 and Pereira et al. 2004)
    # Tmax and Tmin in Celsius !
    Teff = N / (24 - N) * 0.5 * kCamargo * (3 * tmax - tmin)
    Teff = np.where(Teff < tavg, tavg, Teff)
    Teff = np.where(Teff > tmax, tmax, Teff)

    teffsum += Teff
    daysmonth += 1.


    if dates[i].is_month_end:
        print (i)
        teffavg = teffsum / daysmonth
        teffsum = np.zeros(dimnew)
        daysmonth = 0

        # I=∑▒(0.2∙T_(eff,mean) )^1.514
        teffavg =np.where(teffavg<0,0,teffavg)
        thermalsum += (0.2 * teffavg) ** 1.514

    if dates[i].is_year_end:
        print (year,i)
        #timedate = nf1.variables['time'][:].data
        #rootgrp.variables['time'][:] = (timedate)
        rootgrp.variables["time"][year] = timedate[i]
        rootgrp.variables["thermalindex"][year, :, :] = thermalsum
        year += 1
        thermalsum = np.zeros(dimnew)
        teffsum = np.zeros(dimnew)
        daysmonth = 0


ntas.close()
ntasmax.close()
ntasmin.close()
rootgrp.sync()
rootgrp.close()
ii =1
