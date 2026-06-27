# AlphaForge MLOps image — builds the C++ engine and runs the Python stack.
# Build context is the repo root so it can access both native/ and ml/.
FROM python:3.12-slim

WORKDIR /app

# Toolchain for the native C++ feature/inference engine
RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ make \
    && rm -rf /var/lib/apt/lists/*

# Python deps first (better layer caching)
COPY ml/requirements.txt ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt

# Build the native engine -> native/bin/alphaforge_engine
COPY native/ native/
RUN cd native && make

# App code
COPY ml/ ml/

ENV PYTHONUNBUFFERED=1 \
    BACKEND_URL=http://backend:8080 \
    ALPHAFORGE_HOST=0.0.0.0 \
    ALPHAFORGE_PORT=8090

EXPOSE 8090
CMD ["python", "-m", "ml.serving.app"]
