# Data Waster

A real bandwidth dashboard inspired by [hletrd/data-waster](https://github.com/hletrd/data-waster). The Node.js server streams cryptographically random bytes for downloads and accepts generated random bytes for uploads. Choose a direction, a finite data limit, and the number of concurrent connections.

## Run locally

Install Node.js 18 or newer, then run:

```sh
npm start
```

Open <http://localhost:3000>. Do not open `index.html` directly: the page needs the server API to perform real transfers. No third-party packages are required.

## Data use and hosting

Every run is capped at 1,000 MiB, the default is 100 MiB, and the Stop button aborts active transfers. Uploads and downloads transfer real payload bytes; HTTP overhead is additional. When the app runs on `localhost`, the data stays on the same device and does not use cellular data. To transfer data over a mobile or internet connection, access the app from a remote server. Your carrier may count that traffic, and the host may charge for received traffic or download egress.

The server binds to `127.0.0.1` by default. To bind it to another interface, set `HOST` and `PORT` as appropriate for your environment. A publicly reachable instance can incur bandwidth charges; deploy it only on a host you control and add access controls and usage limits before exposing it publicly. Static-only hosting such as GitHub Pages cannot run the required Node.js transfer server.
