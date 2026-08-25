import { createHash, createHmac } from "node:crypto";

// AWS Signature Version 4, query-string ("presigned URL") flavour.
//
// R2 speaks the S3 API, and the point of presigning is that the browser PUTs
// its file straight to Cloudflare instead of through us. On a 1 vCPU / 2GB
// droplet that is not a nicety: proxying a 200MB video would tie up the box
// that also has to serve every other request during a launch burst.
//
// Hand-rolled rather than pulling in the AWS SDK — it is one signature shape,
// it is fully specified, and AWS publishes a test vector that sigv4.test.ts
// reproduces exactly, which is better evidence than a dependency version.

const ALGORITHM = "AWS4-HMAC-SHA256";

const sha256Hex = (data: string) =>
  createHash("sha256").update(data, "utf8").digest("hex");

const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data, "utf8").digest();

// RFC 3986. encodeURIComponent leaves !'()* alone and AWS does not.
export function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const char of value) {
    if (/[A-Za-z0-9\-._~]/.test(char)) {
      out += char;
    } else if (char === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      for (const byte of Buffer.from(char, "utf8")) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

// 20130524T000000Z / 20130524
function stamps(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export type PresignInput = {
  method: "GET" | "PUT" | "POST" | "DELETE";
  /** Origin only, no path: https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  /** Object path within the endpoint, e.g. "markedfox-media/u/1/a.jpg". */
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  expiresInSeconds: number;
  now: Date;
  /** Extra headers the caller commits to sending, e.g. content-type. */
  signedHeaders?: Record<string, string>;
  /** Extra query parameters, e.g. list-type=2. Signed with the rest. */
  queryParams?: Record<string, string>;
};

export function presignUrl(input: PresignInput): string {
  const service = input.service ?? "s3";
  const { amzDate, dateStamp } = stamps(input.now);
  const url = new URL(input.endpoint);
  const host = url.host;

  // Each path segment is encoded, but the separators are not.
  const canonicalUri =
    "/" +
    input.key
      .replace(/^\/+/, "")
      .split("/")
      .map((segment) => uriEncode(segment))
      .join("/");

  // host is always signed; anything the caller pins is signed too, so a
  // browser that sends a different content-type gets a 403 rather than a
  // silent mismatch between what we authorised and what was stored.
  const headers: Record<string, string> = { host, ...(input.signedHeaders ?? {}) };
  const headerNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders =
    headerNames
      .map((name) => {
        const value = Object.entries(headers).find(
          ([key]) => key.toLowerCase() === name,
        )![1];
        return `${name}:${value.trim().replace(/\s+/g, " ")}\n`;
      })
      .join("") ;
  const signedHeaderList = headerNames.join(";");

  const credentialScope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const query: Record<string, string> = {
    ...(input.queryParams ?? {}),
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaderList,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((key) => `${uriEncode(key)}=${uriEncode(query[key])}`)
    .join("&");

  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderList,
    // The body is not known at signing time — that is the entire point.
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(input.secretAccessKey, dateStamp, input.region, service),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return `${url.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
