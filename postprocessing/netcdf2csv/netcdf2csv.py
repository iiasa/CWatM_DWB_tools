import xarray as xr
import pandas as pd

def netcdf_to_csv_timeseries(netcdf_file, output_csv, lon, lat, variable_name):
    """
    Extracts a timeseries from a NetCDF file at a given location and saves it to a CSV.

    Args:
        netcdf_file (str): Path to the NetCDF file.
        output_csv (str): Path to the output CSV file.
        lon (float): Longitude of the location.
        lat (float): Latitude of the location.
        variable_name (str): Name of the variable to extract.
    """

    try:
        ds = xr.open_dataset(netcdf_file)
    except FileNotFoundError:
        print(f"Error: File not found: {netcdf_file}")
        return

    try:
        # Select the data at the given location
        timeseries = ds[variable_name].sel(lon=lon, lat=lat, method='nearest')
    except KeyError:
        print(f"Error: Variable '{variable_name}' or coordinates not found in the NetCDF file.")
        ds.close()
        return

    # Convert to Pandas DataFrame
    df = timeseries.to_dataframe()

    # Reset index to make 'time' a column
    df = df.reset_index()

    # Save to CSV
    df.to_csv(output_csv, index=False)

    ds.close()
    print(f"Timeseries extracted and saved to {output_csv}")

# Example usage:
netcdf_file = "P:\watmodel\CWATM\Regions\Danube_1min\Morava\meteo\emo-1/tas_EMO-1_1990_2022_degC.nc"
output_csv = 'tas.csv'
lon = 15.806  # Replace with your desired longitude
lat = 48.91    # Replace with your desired latitude
variable_name = 'tas' # Replace with your variable name

netcdf_to_csv_timeseries(netcdf_file, output_csv, lon, lat, variable_name)