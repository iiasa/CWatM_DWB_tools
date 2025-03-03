# -*- coding: utf-8 -*-
"""Please refer to quick_guide.pdf for usage instructions"""

import os
import sys
import numpy as np
import pandas
import re
import pdb
import time
from datetime import datetime
from configparser import ConfigParser
import glob
import datetime
import random
import platform as plat
from sys import platform
import pickle

########################################################################
#   Read settings file
########################################################################
if __name__ == "__main__":

    text = "Hi\nThis is the automatic calibration of CWatM\n\n"
    print (text)

    iniFile = os.path.normpath(sys.argv[1])
    #iniFile = "P:/watmodel/calibration/danube_1min/morava_calibration_tool/settings1_MB.txt"

    if not(os.path.isfile(iniFile)):
        print(iniFile)
        print("No inifile found or error reading")
        sys.exit()

    #file_CatchmentsToProcess = os.path.normpath(sys.argv[2])
    #file_CatchmentsToProcess ="P:/watmodel/CWATM/calibration/multi_calibration/calibration-master/CatchmentsToProcess_All.txt"

    parser = ConfigParser()
    parser.read(iniFile)

    #iniFile = os.path.basename(iniFile)

    if platform == "win32":
        root = parser.get('DEFAULT','Root')
    else:
        root = parser.get('DEFAULT','RootLinux')
    rootbasin = parser.get('DEFAULT', 'Rootbasin')
    root = os.path.join(root, rootbasin)

    path_result = os.path.join(root,parser.get('Path', 'Result'))
    SubCatchmentPath = os.path.join(root,parser.get('Path','SubCatchmentPath'))

    #forcing_start=parser.get('DEFAULT', 'ForcingStart')
    try:
        ForcingStart = datetime.datetime.strptime(parser.get('DEFAULT', 'ForcingStart'),"%d/%m/%Y %H:%M")  # Start of forcing
        ForcingEnd = datetime.datetime.strptime(parser.get('DEFAULT', 'ForcingEnd'), "%d/%m/%Y %H:%M")  # Start of forcing
    except:
        ForcingStart = datetime.datetime.strptime(parser.get('DEFAULT', 'ForcingStart'),"%d/%m/%Y")  # Start of forcing
        ForcingEnd = datetime.datetime.strptime(parser.get('DEFAULT', 'ForcingEnd'), "%d/%m/%Y")

    spinoffyears = int(parser.get('DEFAULT','SpinoffYears'))

    timeperiod = parser.get('DEFAULT', 'timeperiod')
    if timeperiod == "monthly":
        monthly = 1
        dischargetss = 'discharge_monthavg.tss'
        frequen = 'MS'
    else:
        monthly = 0
        dischargetss = 'discharge_daily.tss'
        frequen = 'd'

    Qgis_csv = os.path.join(root, parser.get('ObservedData', 'Qgis'))

    # Multi computer as executable runs
    listPC = os.path.join(root,parser.get('MultiComputer', 'listPC'))

    if platform == "win32":
        Run1 = parser.get('MultiComputer', 'RunCalib')
        RunCalib = Run1.split(" ")
        if len(RunCalib) > 1:
            RunCalib = Run1.split(" ")[0] + " " + os.path.join(root, Run1.split(" ")[1])
        else:
            RunCalib = os.path.join(root,RunCalib[0])

    else:
        Run1 = parser.get('MultiComputer', 'RunCalibLinux')
        RunCalib = Run1.split(" ")[0] + " " + os.path.join(root, Run1.split(" ")[1])


    ########################################################################
    #   Loop through catchments and perform calibration
    ########################################################################

    print (">> Reading Qgis file...")
    stationdata = pandas.read_csv(Qgis_csv,sep=",",index_col=0)
    #stationdata_sorted = stationdata.sort_index(by=['CatchmentArea'],ascending=True)
    stationdata_sorted = stationdata.sort_values(by=['CatchmentArea'],ascending=True)

    # run a few round to catch up all loose ends
    for round in range(100):
        addrun = []
        for index, row in stationdata_sorted.iterrows():
            #print 'cal_start',row['Cal_Start']

            print ("=================== "+row['ID']+" ====================")
            path_subcatch = os.path.join(root,SubCatchmentPath,row['ID'])
            if os.path.exists(os.path.join(path_subcatch,"streamflow_simulated_best.csv")):
                print ("streamflow_simulated_best.csv already exists! Moving on...")
                if row['ID'] == list(stationdata_sorted.iterrows())[-1][1][0]:
                    # test if last one is done
                    print ("==================== LAST ONE DONE!")
                    sys.exit()

                continue

            # Test if other computers run something
            can_run = True
            can_run1 = False
            file = os.path.join(listPC, row['ID'] + "_list.txt")
            if os.path.isfile(file):
                with open(file, 'r',encoding='utf8') as f:
                    l = f.readlines()[-1]
                tt = l.split(",")[0]
                user = l.split(",")[1][:-1]

                now = datetime.datetime.now()
                timeflag = datetime.datetime.strptime(tt, "%Y-%m-%d %H:%M")

                timeflag = timeflag + datetime.timedelta(hours=3)
                if timeflag > now:
                    s = row["ID"] + " is run by " + user + " already! Moving on..."
                    print(s)
                    can_run = False
                    addrun.append(row["ID"])

            if can_run:
                can_run1 = True
                # test if inflows in:
                if row['Inflow'] > 0:
                    inflows = row['Inflow_ID'].split(" ")
                    for subcatchment in inflows:
                        path_subcatch1 = os.path.join(SubCatchmentPath, subcatchment)
                        if not(os.path.exists(os.path.join(path_subcatch1, "streamflow_simulated_best.csv"))):
                            can_run1 = False
                            s = "streamflow_simulated_best.csv of " + subcatchment + " is not ready! Moving on..."
                            print (s)

                checkpoint = os.path.join(path_subcatch, "checkpoint.pkl")
                if os.path.exists(os.path.join(checkpoint)):
                    try:
                        with open(checkpoint, "rb") as cp_file:
                            cp = pickle.load(cp_file)
                        cp_file.close()
                    except:
                        print("cannot read pickle  -wrong platform - previous run was not done with: ", platform)
                        can_run1 = False


            if can_run1:

                print (">> Starting calibration of catchment "+row['ID']+", size "+str(row['CatchmentArea'])+" pixels...")
                inflowflag = False
                if row['Inflow'] > 0:
                    inflowflag = True

                # Copy simulated streamflow from upstream catchments
                # Change inlet map by replacing the numeric ID's with 1, 2, ...
                sys.stdout.write("Upstream station(s): ")

                if inflowflag:
                    cnt = 0
                    header = ""
                    inflows = row['Inflow_ID'].split(" ")
                    inflow_tss = os.path.join(path_subcatch, "inflow", "inflow.tss")
                    # inflow_tss_lastrun is for when after the optimal combination of parameters is found , when we run the full forcing period
                    inflow_tss_last_run = os.path.join(path_subcatch, "inflow", "inflow_last_run.tss")


                    for subcatchment in inflows:
                        cnt += 1
                        header = header + " " + subcatchment
                        # loop here till previous catchment on the list is done
                        sys.stdout.write(subcatchment+" ")
                        Qsim_tss = SubCatchmentPath + "/"+subcatchment+"/"+"streamflow_simulated_best.csv"

                        #timer = 0
                        #while not os.path.exists(Qsim_tss) and timer<=720000:
                        #    time.sleep(1)
                        #    timer+=1

                        #start and end days of normal and long run
                        Cal_S = datetime.datetime.strptime(row['Cal_Start'], '%d/%m/%Y')
                        Cal_rstart =  datetime.datetime(Cal_S.year - spinoffyears, Cal_S.month, Cal_S.day, 0, 0)
                        Cal_Realstart = Cal_rstart.strftime('%d/%m/%Y')    # normal run
                        #Cal_Realstart1 = datetime.datetime(Cal_S.year - spinoffyears * 3, Cal_S.month, Cal_S.day, 0, 0).strftime('%d/%m/%Y')  # long run
                        #Cal_Realstart1 = datetime.datetime(1985, 1,1, 0,0).strftime('%d/%m/%Y')
                        Cal_Realstart1 = ForcingStart.strftime('%d/%m/%Y')
                        Cal_e1 = datetime.datetime.strptime(row['Cal_End'], '%d/%m/%Y')
                        Cal_End1 = Cal_e1.strftime('%d/%m/%Y')
                        #Cal_End2 = datetime.datetime(2022, 12,31, 0,0).strftime('%d/%m/%Y')
                        Cal_End2 = ForcingEnd.strftime('%d/%m/%Y')


                        shift_time = datetime.datetime.strptime(Cal_Realstart, "%d/%m/%Y") - datetime.datetime.strptime(Cal_Realstart, "%d/%m/%Y")
                        # difference in days between long run and normal run
                        #shift_time = datetime.datetime.strptime(row['Cal_Start'], "%d/%m/%Y %H:%M") - datetime.datetime.strptime(datetime.datetime.strftime(ForcingStart, "%d/%m/%Y %H:%M"),"%d/%m/%Y %H:%M")


                        print ('load inflow.tss')
                        try:
                            simulated_streamflow_last = pandas.read_csv(Qsim_tss, sep=",", parse_dates=True, index_col=0, header=None,skiprows=1)
                        except:
                            print ("Could not find streamflow_simulated_best.csv for upstream catchment "+subcatchment+", hence cannot run this catchment...")
                            raise Exception("Stopping...")

                        simulated_streamflow_last.columns = [subcatchment]
                        simulated_streamflow = simulated_streamflow_last[Cal_rstart:Cal_e1][Cal_rstart:Cal_e1]
                        simulated_streamflow_last = simulated_streamflow_last[ForcingStart:ForcingEnd]

                        if cnt==1: # first inflow
                            inflow_last = simulated_streamflow_last.copy()
                            inflow = simulated_streamflow.copy()
                        else:
                            inflow_last = inflow_last.join(simulated_streamflow_last)
                            inflow = inflow.join(simulated_streamflow)

                    inflow_last.to_csv(inflow_tss_last_run, sep=' ', header=False)
                    inflow.to_csv(inflow_tss, sep=' ', header=False)

                    header = "timeseries scalar  Inflows from:" + header +"\n"
                    header = header + str(cnt+1) +"\ntimestep\n"
                    for i in range(cnt):
                        header = header + str(i+1) + "\n"



                    f = open(inflow_tss_last_run,'r+',encoding='utf8')
                    content = f.read()
                    content = header + content
                    f.seek(0,0)
                    f.write(content)
                    f.close()

                    f = open(inflow_tss,'r+',encoding='utf8')
                    content = f.read()
                    content = header + content
                    f.seek(0,0)
                    f.write(content)
                    f.close()


                    # save inflow coordinate in another format
                    inflow_txt = os.path.join(path_subcatch, "inflow", "inflowloc.txt")
                    inflowloc = {}
                    f = open(inflow_txt, "r",encoding='utf8')
                    for line in f.readlines():
                        (x, y, id) = line.split()
                        inflowloc[id]= [x,y]
                    f.close()

                    gaugetext =""
                    for subcatchment in inflows:
                        station = stationdata.loc[stationdata["ID"] == subcatchment].iloc[0]
                        #stationID = str(station['ID_numeric'])
                        stationID = str(int(station['ID'][1:]))
                        x = inflowloc[stationID][0]
                        y = inflowloc[stationID][1]
                        gaugetext = gaugetext + " " + x + " " + y

                    inflow_txt = os.path.join(path_subcatch, "inflow", "inflowloc2.txt")
                    f = open(inflow_txt, "w",encoding='utf8')
                    f.write(gaugetext)
                    f.close()


                else:
                    sys.stdout.write("none")
                sys.stdout.write("\n")
                sbc=str(row["ID"])

                cmd = RunCalib + " " + iniFile + " " + str(row["ID"])
                #cmd = RunCalib
                #cmd1 = iniFile + " " + str(row["ID"])
                print (cmd)


                #file = os.path.join(listPC, "set_" + plat.uname()[1] +".txt")
                #file = "set_" + plat.uname()[1] + ".txt"
                #f = open(file, "w")
                #f.write(cmd1)
                #f.close()


                t = os.system(cmd)
                ii =1




        print ("==================== END Round No " + str(round+1) + " ====================")


        print("==================== wait 10 min " + str(round + 1) + " ====================")
        time.sleep(600) # sleep 10 min
        
    print ("==================== THIS IS THE END ====================")