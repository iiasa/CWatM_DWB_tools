Tool to correct LDD
-----
PB 2/12/22

P:\watmodel\CWATM\cwatm_input_danube\TOOL_to_correct_Danube

cor_Danube.mxd  -> arcmap

1) right click ldd_points_danube -> selection -> Make this the only selecteble layer
2) customize -> toolbars -> editor
3) Editor -> start editing _> ldd_points_danube

4.1) select single point -> open attribute table
4.2) change grid_code (eg. from 1 (SW) to 2 (South)
	after selecting the next - check if the arrow point in the right direction
4.3) select next point (arrow) and change

5.) Editor -> save edits (will take some time)

6.) load ../TOOL_to_correct_Danube/Correct_LDD.tbx into the toolbox 
    - open ArcToolbox, right click on ArcToolbox -> Add toolbox

7) run 2_correct_LDD_tiff_shape

8.1 load ldd_lines.shp from ../TOOL_to_correct_Danube\LDD_corrected2/ldd_lines.shp
8.2 run 3_create_river_layer (put in new names if the old names already have a dataset)

9 import symbol from river_from_LDD into river_from_LDD2

-----
remarks:
1) sort ldd_points_danube biggest first then lowest first to see if you put in a number >9 or <1
2) the ldd at the delta (Black sea looks weird, but I tried to capture all cells in the delta mentioned by the ICPDB shape

