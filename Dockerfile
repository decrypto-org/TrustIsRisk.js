FROM node:4

RUN apt-get update && apt-get install -y libzmq3-dev build-essential
RUN npm install -g bitcore
RUN bitcore create /usr/bitcoin-node --testnet

WORKDIR /usr/bitcoin-node
RUN mkdir -p /usr/src/app

ARG NODE_ENV
ENV NODE_ENV $NODE_ENV

COPY package.json /usr/src/app/
RUN cd /usr/src/app && mkdir -p node_modules && npm install --production && npm cache clean

COPY bitcore-node.json /usr/bitcoin-node/
RUN bitcore install insight-api && bitcore install insight-ui

COPY . /usr/src/app

RUN ln -s /usr/src/app /usr/bitcoin-node/node_modules/service
RUN ln -s /usr/bitcoin-node/node_modules/bitcore-lib/ /usr/src/app/node_modules/

EXPOSE 3001 8332 8333

CMD [ "bitcored" ]
