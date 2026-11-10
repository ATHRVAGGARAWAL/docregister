/** Next may construct request.url using its bound host behind a local proxy. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  return origin === `${url.protocol}//${host}`;
}
