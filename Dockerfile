FROM node:alpine
RUN apt-get update -y
RUN apt-get upgrade -y
RUN apt-get install ffmpeg -y

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
