# TrustIsRisk.js
A Javascript implementation of TrustIsRisk

## Development

**To start a dockerized bitcoin node with the TrustIsRisk service**:

Assuming you have Docker and npm installed:

1. **Run `npm install`** to install dependencies for your local machine. This will install [Babel](https://babeljs.io/) with some presets and plugins and [Flow](https://flowtype.org/).
2. If docker daemon is not running yet, **Run `sudo dockerd`** to start docker daemon.
3. **Run `sudo ./run.sh`**, which will compile the `src/` directory to `build/` and start a docker container named "bitcoin" running [Bitcore](https://bitcore.io/) with the TrustIsRisk service plugged in.

If everything goes well, the above commands and `docker logs bitcoin` should give no errors, the docker "bitcoin" container should be running, and you should be able to access the blockchain explorer UI at port 3001 on your local host machine. 

To typecheck the code, run `npm run-script typecheck` (after running npm install).
