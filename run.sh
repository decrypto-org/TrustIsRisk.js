#!/bin/bash

node_modules/babel-cli/bin/babel.js src --out-dir build --copy-files

if [ $? -ne 0 ]; then
  echo "Compilation failed, exiting."
  exit 1
fi

cp package.json build/
cp bitcore-node.json build/
cp Dockerfile build/

cd build
mkdir -p data
docker stop bitcoin
docker rm bitcoin
docker build -t bitcoin .
docker run -d -p 3001:3001 -v data:/usr/bitcoin-node/data/ --name bitcoin bitcoin
