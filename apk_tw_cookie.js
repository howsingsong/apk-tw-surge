/*
 * APK.TW Cookie Manager V2
 * Author: howsingsong
 *
 * 同時支援：
 * - http-request：完整擷取 Safari Cookie / UA
 * - http-response：合併伺服器 Set-Cookie
 */

const COOKIE_KEY = "APK_TW_COOKIE_V2";
const UA_KEY = "APK_TW_UA";
const FORMHASH_KEY = "APK_TW_FORMHASH";

function headerValues(headers, name) {
  const result = [];
  if (!headers) return result;

  if (Array.isArray(headers)) {
    headers.forEach(h => {
      if (
        h &&
        h.field &&
        h.field.toLowerCase() === name.toLowerCase()
      ) {
        result.push(String(h.value || ""));
      }
    });
    return result;
  }

  Object.keys(headers).forEach(key => {
    if (key.toLowerCase() !== name.toLowerCase()) return;

    const v = headers[key];

    if (Array.isArray(v)) {
      v.forEach(x => result.push(String(x || "")));
    } else {
      result.push(String(v || ""));
    }
  });

  return result;
}

function cookieObjectFromValues(values) {
  const map = {};

  values.forEach(value => {
    String(value || "")
      .split(/;\s*/)
      .forEach(part => {
        const pos = part.indexOf("=");

        if (pos <= 0) return;

        const name = part.substring(0, pos).trim();
        const val = part.substring(pos + 1);

        if (name) map[name] = val;
      });
  });

  return map;
}

function cookieObject(cookie) {
  return cookieObjectFromValues([cookie || ""]);
}

function cookieString(map) {
  return Object.keys(map)
    .map(key => `${key}=${map[key]}`)
    .join("; ");
}

function hasAuth(cookie) {
  return /(?:^|;\s*)[^=;]+_auth=[^;]+/i.test(cookie || "");
}

function mergeSetCookies(oldCookie, lines) {
  const map = cookieObject(oldCookie);

  lines.forEach(line => {
    if (!line) return;

    const first = line.split(";")[0];
    const pos = first.indexOf("=");

    if (pos <= 0) return;

    const name = first.substring(0, pos).trim();
    const value = first.substring(pos + 1);

    const deleted =
      /^deleted$/i.test(value) ||
      /max-age\s*=\s*0/i.test(line) ||
      /expires\s*=\s*(?:thu|tue|wed|mon|fri|sat|sun),?\s*0?1[-\s]jan[-\s]1970/i.test(line);

    if (deleted) {
      delete map[name];
    } else {
      map[name] = value;
    }
  });

  return cookieString(map);
}

function saveFormhash(url) {
  const m = String(url || "").match(/[?&]formhash=([^&#]+)/i);

  if (!m || !m[1]) return;

  try {
    $persistentStore.write(
      decodeURIComponent(m[1]),
      FORMHASH_KEY
    );
  } catch (_) {
    $persistentStore.write(m[1], FORMHASH_KEY);
  }
}

/*
 * REQUEST
 */
function handleRequest() {
  const values = headerValues(
    $request.headers,
    "cookie"
  );

  if (values.length) {
    const fullCookie =
      cookieString(cookieObjectFromValues(values));

    /*
     * 只有含登入 auth 才覆寫，
     * 避免訪客 Cookie 蓋掉有效登入。
     */
    if (fullCookie && hasAuth(fullCookie)) {
      $persistentStore.write(
        fullCookie,
        COOKIE_KEY
      );

      console.log(
        `APK.TW：已擷取完整 Cookie，共 ${Object.keys(cookieObject(fullCookie)).length} 項`
      );
    }
  }

  const uas = headerValues(
    $request.headers,
    "user-agent"
  );

  if (uas[0]) {
    $persistentStore.write(
      uas[0],
      UA_KEY
    );
  }

  saveFormhash($request.url);

  /*
   * 不修改任何原始 Request
   */
  $done();
}

/*
 * RESPONSE
 */
function handleResponse() {
  let cookie =
    $persistentStore.read(COOKIE_KEY) || "";

  const sets = headerValues(
    $response.headers,
    "set-cookie"
  );

  if (sets.length) {
    cookie = mergeSetCookies(
      cookie,
      sets
    );

    $persistentStore.write(
      cookie,
      COOKIE_KEY
    );

    console.log(
      `APK.TW：收到 ${sets.length} 筆 Set-Cookie，已更新`
    );
  }

  $done();
}

try {
  if (typeof $response !== "undefined") {
    handleResponse();
  } else {
    handleRequest();
  }
} catch (e) {
  console.log(
    "APK.TW Cookie V2 錯誤：" + e
  );

  $done();
}
