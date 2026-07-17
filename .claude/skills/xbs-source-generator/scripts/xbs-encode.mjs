#!/usr/bin/env node

/**
 * XXTEA 加密 — 将 JSON 书源文件转为 .xbs 二进制文件。
 * 算法与 src/lib/xxtea.ts 完全一致，放在 skill 内保持 skill 自包含。
 *
 * 用法: node xbs-encode.mjs <input.json> [output.xbs]
 * 默认输出: 同目录下同名 .xbs
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DELTA = 0x9e3779b9;

const KEY_BYTES = new Uint8Array([
  0xe5, 0x87, 0xbc, 0xe8, 0xa4, 0x86, 0xe6, 0xbb, 0xbf, 0xe9, 0x87, 0x91, 0xe6,
  0xba, 0xa1, 0xe5,
]);

function toU32(bytes) {
  const arr = new Uint32Array(Math.ceil(bytes.length / 4));
  for (let i = 0; i < bytes.length; i++)
    arr[i >>> 2] |= bytes[i] << ((i & 3) << 3);
  return arr;
}

function toBytes(arr, len) {
  const b = new Uint8Array(len);
  for (let i = 0; i < len; i++) b[i] = (arr[i >>> 2] >>> ((i & 3) << 3)) & 0xff;
  return b;
}

function mx(sum, y, z, p, e, k) {
  return (
    ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^
      ((sum ^ y) + (k[(p & 3) ^ e] ^ z))) >>>
    0
  );
}

function encrypt(v, k) {
  const n = v.length;
  if (n < 2) return;
  let z = v[n - 1], y, e, sum = 0;
  const q = Math.floor(6 + 52 / n);
  for (let round = 0; round < q; round++) {
    sum = (sum + DELTA) >>> 0;
    e = (sum >>> 2) & 3;
    for (let p = 0; p < n - 1; p++) {
      y = v[p + 1];
      v[p] = (v[p] + mx(sum, y, z, p, e, k)) >>> 0;
      z = v[p];
    }
    y = v[0];
    v[n - 1] = (v[n - 1] + mx(sum, y, z, n - 1, e, k)) >>> 0;
    z = v[n - 1];
  }
}

const KEY = toU32(KEY_BYTES);

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("用法: node xbs-encode.mjs <input.json> [output.xbs]");
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const outputPath = args[1]
    ? path.resolve(args[1])
    : inputPath.replace(/\.json$/i, "") + ".xbs";

  const jsonStr = await readFile(inputPath, "utf8");
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const bufLen = jsonBytes.length;
  const n4 = Math.ceil(bufLen / 4);
  const padded = new Uint8Array(n4 * 4 + 4);
  padded.set(jsonBytes);
  padded[n4 * 4] = (bufLen >>> 0) & 0xff;
  padded[n4 * 4 + 1] = (bufLen >>> 8) & 0xff;
  padded[n4 * 4 + 2] = (bufLen >>> 16) & 0xff;
  padded[n4 * 4 + 3] = (bufLen >>> 24) & 0xff;

  const v = toU32(padded);
  encrypt(v, KEY);
  const result = toBytes(v, padded.length);

  await writeFile(outputPath, result);
  console.log(outputPath);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
