#!/bin/bash

# Build the Docker image
docker build -t line-bot-app .

# Run the Docker container
docker run -d -p 3000:3000 line-bot-app

# Wait for the container to start
sleep 5

# Run the smoke test
curl http://localhost:3000/

# Check the exit code of the curl command
if [ $? -eq 0 ]; then
  echo "Smoke test passed"
else
  echo "Smoke test failed"
fi
