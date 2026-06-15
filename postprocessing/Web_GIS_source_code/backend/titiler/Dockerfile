FROM ghcr.io/developmentseed/titiler:latest

# Create app directory
WORKDIR /opt/dwb-titiler

# Copy custom application and colormaps
COPY titiler/app.py /opt/dwb-titiler/app.py
COPY titiler/requirements.txt /tmp/extra-requirements.txt
COPY python/colormaps/ /opt/dwb-titiler/colormaps/

# Install any additional dependencies
RUN pip install --no-cache-dir -r /tmp/extra-requirements.txt && \
    rm /tmp/extra-requirements.txt

# Set colormap directory
ENV DWB_COLORMAP_DIR=/opt/dwb-titiler/colormaps

# Run custom app with uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
