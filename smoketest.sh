#!/bin/bash

# Build the Docker image
docker build -t demo-line-teacher .

# Run the Docker container
docker run --rm -d -p 3000:3000 demo-line-teacher

# Wait for the container to start
sleep 5

# Run the smoke test
curl http://localhost:3000/health-check

# Check the exit code of the curl command
if [ $? -eq 0 ]; then
  echo "\nSmoke test passed"
  # Stop and remove the container
  docker stop $(docker ps -q --filter ancestor=demo-line-teacher) && docker rm $(docker ps -aq --filter ancestor=demo-line-teacher)
else
  echo "\nSmoke test failed"
  # Stop and remove the container
  docker stop $(docker ps -q --filter ancestor=demo-line-teacher) && docker rm $(docker ps -aq --filter ancestor=demo-line-teacher)
  exit 1
fi
