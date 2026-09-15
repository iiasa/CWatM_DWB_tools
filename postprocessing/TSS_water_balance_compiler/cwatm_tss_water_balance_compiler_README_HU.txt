# CWatM Multiscale Water Balance Compiler & Plotter (v20)

## MAGYAR NYELVŰ LEÍRÁS

Ez az alkalmazás egy hordozható, dinamikus poszt-processzáló eszköz, amelyet a **Danube Water Balance** projekt keretében futtatott **CWatM (Community Water Model)** hidrológiai szimulációk eredményeinek kiértékelésére fejlesztettünk ki. 

A program a Community Water Model (CWatM) területileg átlagolt és pontszerű idősoros kimeneteit dolgozza fel, és elvégzi a vízgyűjtő-szintű anyagmérleg (vízmérleg) záródásának ellenőrzését és vizualizációját napi, havi és éves léptéken.
Ehhez beolvassa a CWatM beállítási ('settings___.ini') fájljait, a kiválasztott fájlból feloldja az útvonalakat és a változókat, elemzi a vízgyűjtő GeoTIFF maszkját, majd az idősorosan elmentett számítási eredményekből anyagmérleg-elemzést végez, és beágyazott, natív Excel-diagramokkal ellátott multiscale táblázatot generál.

### Főbb jellemzők:
* **Dinamikus rács- és területdetekció:** Pillow segítségével közvetlenül a 'basin.tif' vagy a 'MaskMap' GeoTIFF fájlból olvassa ki az aktív cellák számát, a vetületi rendszert és a felbontást. Földrajzi fokhálózat esetén minden rácscellára latitudinális torzulás-korrekciót végez a pontos fizikai terület kiszámításához.
* **Egységes mértékegységek:** 
	A CWatM a különböző folyamatokat eltérő fizikai dimenziókban menti el (pl. térfogatáram m^3/s-ban, térfogat m^3-ben, vagy cellaátlagos magasság méterben, milliméterben). A program az anyagmérleg kiszámításához minden egyes változót dinamikusan átszámol mm-re (a vízgyűjtő területére vetített egyenértékű vízoszlop-magasságra):
	- Csapadék és párolgás (Area-Average): A méter/nap kimeneteket megszorozza 1000-rel (mm)
	- Meder- és tavi párolgás, tározás (Area-Sum / State-Sum): A m^3-ben megadott térfogatokat elosztja az átlagos rácscella-területtel (m^2), majd átváltja mm-re.
	- Kilépő vízhozam (Discharge): A kifolyási szelvény m^3/s-ban mentett vízhozamát a napi másodpercek számával (86,400s) napi térfogattá (m^3) alakítja, majd elosztja a GeoTIFF-ből automatikusan integrált teljes vízgyűjtő területtel (m^2), így megkapva a vízgyűjtőt elhagyó lefolyás mm-értékét.

* **Signed előjel-konvenció:** 
	A diagramon a beáramló (Incoming) és kiáramló (Outgoing) fluxusokat szétválasztjuk, és a hidrológiai folyamatok jellegének megfelelő előjellel ábrázoljuk:
	- Negatív fluxusok (Inflows - Lefelé mutató oszlopok): Az Eső, Hó és Felszín alatti hozzáfolyások (Unmet demand). Minél intenzívebb a csapadék, annál mélyebbre nyúlnak lefelé az oszlopok (mint a hulló csapadék).
	- Pozitív fluxusok (Outflows - Felfelé mutató oszlopok): Az Evapotranspiráció, a Vízfolyás és tó párolgás, a humán Vízkivételek és a torkolaton kilépő Kilépő vízhozam. Minél intenzívebb a párolgás vagy elfolyás, annál magasabbra törnek az oszlopok.
	- Készletváltozás vonal (Storage Change, fekete folytonos vonal): A tökéletes mérlegzáródás érdekében a tározók (talajvíz, talajnedvesség, hó, folyómeder és tavak) együttes készletváltozását (S) nettó készletcsökkenésként (dS) ábrázoljuk. Ez garantálja, hogy a fekete vonal pontértéke minden egyes időlépésben megegyezik a színes oszlopok nettó magasságával (dS = Inflows + Outflows).

* **Natív és szerkeszthető Excel diagramok:** 
	A napi, havi és éves munkalapokra interaktív MS Excel kombinált vízmérleg diagramokat szúr be, amit a felhasználó igényei szerint tovább tud szerkeszteni, formázni.

* **Lag keresztkorrelációs elemzés:** Kiszámítja a napi záródási hiba és a tározó-komponensek közötti keresztkorrelációt $-5$ és $+5$ napos késleltetési tartományban.
	Mivel a folyómeder-tározás és a kifolyási vízhozam között természetes terjedési időkésleltetés (routing lag) van, a napi záródási hiba és a tározók változása között keresztkorrelációt számolunk ki -5 és +5 napos késleltetési tartományban. Ez segít azonosítani, ha a modellben valamilyen időbeli eltolódás (pl. túl gyors vagy túl lassú mederbeli hullámterjedés) lép fel.

### Használati útmutató:
1. Másold a 'cwatm_tss_water_balance_compiler_HU.exe' fájlt közvetlenül a CWatM settings___.ini fájlja mellé.
2. A settings___.ini fájl OPTIONS szekciójában mindenképp állíts be a 'savebasinmap = True' és 'reportTss = True' értékeket.
2. A settings___.ini fájl OUTPUT szekciójában mindenképp állíts be az alábbi mentendő idősorokat:
	OUT_TSS_AreaAvg_Daily = Rain, Snow, totalET, EvapWaterBodyM, act_totalIrrConsumption, act_nonIrrConsumption, unmetDemand, unmet_lost, storGroundwater, totalSto
	OUT_TSS_AreaSum_Daily = channelStorage, lakeResStorage, EvapoChannel
	OUT_TSS_Daily = discharge
3. Győződj meg róla, hogy a szimuláció ezekkel a beállításokkal lefutott, és a kimeneti mappában megtalálható a 'basin.tif' vagy a beállított 'MaskMap' tiszta GeoTIFF formátumú.
3. Indítsd el az '.exe' fájlt. Ha több settings___.ini fájl is van a mappában, a program felkínálja, hogy kiválaszd a megfelelőt.
4. Az elkészült eredményeket a kimeneti mappában a 'Overall_Water_Balance_Multiscale_Signed.xlsx' fájl alatt találod.