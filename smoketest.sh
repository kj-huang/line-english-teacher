#!/bin/bash

# Stop any existing container with the same name
docker stop demo-line-teacher || true

# Build the Docker image
docker build -t demo-line-teacher .

# Run the Docker container with the --rm flag
docker run --rm -d -p 3000:3000 --name demo-line-teacher demo-line-teacher

# Wait for the container to start
sleep 5

# Run the smoke test
curl http://localhost:3000/health-check

# Check the exit code of the curl command
if [ $? -eq 0 ]; then
  echo "\nSmoke test passed"
else
  echo "\nSmoke test failed"
  # Stop and remove the container
  docker stop $(docker ps -q --filter ancestor=demo-line-teacher) && docker rm $(docker ps -aq --filter ancestor=demo-line-teacher)
  exit 1
fi
