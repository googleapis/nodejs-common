FROM node:8.9-alpine
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY package*.json /usr/src/app/
RUN npm install --production
COPY . /usr/src/app
CMD [ "npm", "test" ]
