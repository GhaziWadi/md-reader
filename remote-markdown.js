import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

const limit = 10 * 1024 * 1024;
const denied = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) denied.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) denied.addSubnet(address, prefix, 'ipv6');
const failure = (status, message) => Object.assign(new Error(message), { status });

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
}

export function markdownUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw failure(400, 'Enter a complete http:// or https:// Markdown URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw failure(400, 'Use an HTTP or HTTPS URL without embedded credentials.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname) && !isPublicAddress(hostname)) throw failure(403, 'Remote URLs must point to the public internet. Local and private network addresses are blocked.');
  if (url.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/blob\//.test(url.pathname)) {
    url.hostname = 'raw.githubusercontent.com';
    url.pathname = url.pathname.replace('/blob/', '/');
  }
  url.hash = '';
  return url;
}

export async function readRemoteMarkdown(input, { resolve = lookup, requestHttp = http.request, requestHttps = https.request, timeout = 15000 } = {}) {
  let url = markdownUrl(input);
  const signal = AbortSignal.timeout(timeout);
  function pinnedLookup(hostname, options, callback) {
    // Check every DNS answer, then pass those exact answers to the connection.
    Promise.resolve(resolve(hostname, { all: true, verbatim: true })).then(addresses => {
      if (!addresses.length || addresses.some(result => !isPublicAddress(result.address))) throw failure(403, 'Remote URLs must resolve only to public internet addresses.');
      if (signal.aborted) throw failure(504, 'The remote request timed out.');
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    }).catch(callback);
  }
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await new Promise((resolveResponse, reject) => {
        const request = (url.protocol === 'https:' ? requestHttps : requestHttp)(url, {
          method: 'GET', agent: false, lookup: pinnedLookup, signal,
          headers: { Accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1', 'Accept-Encoding': 'identity', 'User-Agent': 'Local-Markdown-Reader/1.0' },
        }, resolveResponse);
        request.on('error', reject);
        request.end();
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (!response.headers.location) throw failure(502, 'The remote server returned a redirect without a destination.');
        if (redirects === 5) throw failure(502, 'The remote URL redirects too many times.');
        url = markdownUrl(new URL(response.headers.location, url).href);
        continue;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy();
        throw failure(502, `The remote server returned HTTP ${response.statusCode}. Check that the file is public and the URL is correct.`);
      }
      const type = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const textType = ['text/plain', 'text/markdown', 'text/x-markdown', 'application/markdown', 'application/x-markdown'];
      const markdownPath = /\.(md|markdown|mdown)$/i.test(url.pathname);
      if (!textType.includes(type) && !((!type || type === 'application/octet-stream') && markdownPath)) {
        response.destroy();
        throw failure(415, 'This URL does not serve Markdown or plain text. Use the raw file URL instead of a web page.');
      }
      if (Number(response.headers['content-length']) > limit) {
        response.destroy();
        throw failure(413, 'The remote file is larger than the 10 MB reading limit.');
      }
      const encoding = response.headers['content-encoding'];
      const decompressor = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
      if (encoding && encoding !== 'identity' && !decompressor) {
        response.destroy();
        throw failure(415, 'The remote server uses an unsupported content encoding.');
      }
      const stream = decompressor ? response.pipe(decompressor) : response;
      if (decompressor) response.on('error', error => decompressor.destroy(error));
      const chunks = [];
      let size = 0;
      try {
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > limit) throw failure(413, 'The remote file is larger than the 10 MB reading limit.');
          chunks.push(chunk);
        }
      } finally { response.destroy(); stream.destroy(); }
      const source = Buffer.concat(chunks).toString('utf8');
      if (source.includes('\0')) throw failure(415, 'The remote file contains binary data. Choose a Markdown or plain text file.');
      const modified = Date.parse(response.headers['last-modified']);
      return { source, url: url.href, modified: Number.isNaN(modified) ? null : new Date(modified).toISOString() };
    }
  } catch (error) {
    if (error.status) throw error;
    if (signal.aborted) throw failure(504, 'The remote request timed out. Try again or choose another URL.');
    throw failure(502, 'Could not fetch the remote file. Check its URL, internet connection, and public access.');
  }
}
