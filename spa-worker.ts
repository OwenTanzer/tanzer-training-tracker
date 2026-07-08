interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

// The site is a client-side-routed SPA mounted at /trainingtracker, so any
// path under it that isn't a static file (e.g. /trainingtracker/dog/123)
// falls back to index.html and lets React Router take over.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    const url = new URL(request.url);
    url.pathname = '/trainingtracker/index.html';
    return env.ASSETS.fetch(new Request(url, request));
  },
};
