#!/bin/bash

# Build and run the Docker container with Docker Compose
sudo docker-compose down
docker-compose build --no-cache
sudo docker-compose -f "docker-compose.yml" up -d


#remove stopped container
sudo docker container prune

#removing only dangling images:
sudo docker rmi $(docker images --filter "dangling=true" -q --no-trunc)

# Wait for the container to start
sleep 5

# Run the smoke test
curl http://localhost:3000/health

# Check the exit code of the curl command
if [ $? -eq 0 ]; then
  echo "Smoke test passed"
else
  echo "Smoke test failed"
  docker-compose down
  exit 1
fi