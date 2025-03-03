

import os, sys
import shutil
import glob
from os import listdir
from os.path import isfile, join

# ----------------------

#-------------------------------------------------------------
dirIn =  "calibration1/"


for i in range(100):
    s = "G%04d" % (i)
    dir = dirIn+ s
    dirOut = dir + "/out"
    print (dir)

    try:
        onlyfiles = [f for f in listdir(dir) if isfile(join(dir, f))]
        for f in onlyfiles:
            os.remove(dir + "/" + f)
        shutil.rmtree(dirOut)
        os.mkdir(dirOut)

        dirinflow = dir + "/inflow/"
        file = dirinflow + "inflow_last_run.tss"
        if os.path.isfile(file):
            os.remove(file)
        file = dirinflow + "inflow.tss"
        if os.path.isfile(file):
            os.remove(file)
    except:
        print ("not found")


    ii = 1
print("done")
ii =1