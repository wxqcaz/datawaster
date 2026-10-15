# Data Waster

A real bandwidth dashboard inspired by [hletrd/data-waster](https://github.com/hletrd/data-waster). The Node.js server streams cryptographically random bytes for downloads and accepts generated random bytes for uploads. Choose a direction, a finite data limit, and the number of concurrent connections.

## Run locally

Install Node.js 18 or newer, then run:

```sh
npm start
```

Open <http://localhost:3000>. Do not open `index.html` directly: the page needs the server API to perform real transfers. No third-party packages are required.

## GitHub Pages and backend hosting

GitHub Pages serves static files only; it cannot run the Node.js transfer API. The GitHub Pages build in this repository is configured to use `https://datawaster-api.onrender.com` automatically, so visitors do not need to enter a server URL.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wxqcaz/datawaster)

Click **Deploy to Render**, sign in or authorize GitHub if prompted, then deploy the `datawaster-api` service. Render creates the server from `render.yaml` and allows browser requests from `https://wxqcaz.github.io`. The GitHub Pages frontend and Render service URL must match; if Render assigns a different service URL, update `API_BASE_URL` in `index.html` and push the change. If your Pages site uses a different origin, update the server's `ALLOWED_ORIGINS` environment variable to that exact origin, with no path or trailing slash, then redeploy.

To run the frontend and backend together locally, use `npm start` and open <http://localhost:3000>; the app automatically uses the local server outside GitHub Pages.

The server checks the browser's `Origin` against `ALLOWED_ORIGINS` (a comma-separated list). This is a browser CORS policy, **not authentication**: anyone able to reach the server can call its API directly. Do not expose a public server unless you accept the possibility of bandwidth and hosting charges.

## Data use and hosting

Every run is capped at 1,000 MiB, the default is 100 MiB, and the Stop button aborts active transfers. Uploads and downloads transfer real payload bytes; HTTP overhead is additional. When the app runs on `localhost`, the data stays on the same device and does not use cellular data. To transfer data over a mobile or internet connection, access the app from a remote server. Your carrier may count that traffic, and the host may charge for received traffic or download egress.

Set `HOST` and `PORT` as appropriate for your environment. The server binds to `0.0.0.0` by default so cloud hosts can route traffic to it. Static-only hosting such as GitHub Pages cannot run the required Node.js transfer server.
