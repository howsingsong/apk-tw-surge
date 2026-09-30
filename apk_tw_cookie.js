/*
 * APK.TW Cookie Manager V3
 * Author: howsingsong
 *
 * 功能：
 * 1. 擷取 Safari / 私密模式完整 Cookie
 * 2. 支援多個 Cookie Header
 * 3. 自動保存 User-Agent
 * 4. 自動保存 formhash
 * 5. 接收所有 Set-Cookie 自動更新
 * 6. 登入 Cookie 成功時通知
 */

const COOKIE_KEY = "APK_TW_COOKIE_V3";
const AUTH_KEY = "APK_TW_AUTH_V3";
const UA_KEY = "APK_TW_UA_V3";
const FORMHASH_KEY = "APK_TW_FORMHASH_V3";
const NOTICE_KEY = "APK_TW_LOGIN_NOTICE_V3";


/* ==============================
 * Arguments
 * ============================== */

const ARG =
  typeof $argument !== "undefined"
    ? String($argument)
    : "";

const LOGIN_NOTIFY =
  !/login_notify=(false|0|off|no)/i.test(ARG);


/* ==============================
 * Header
 * ============================== */

function getHeaderValues(headers, name) {
  const result = [];

  if (!headers) {
    return result;
  }

  /*
   * full-header-mode
   */
  if (Array.isArray(headers)) {
    headers.forEach(function (item) {
      if (
        item &&
        item.field &&
        String(item.field).toLowerCase() ===
          name.toLowerCase()
      ) {
        result.push(
          String(item.value || "")
        );
      }
    });

    return result;
  }

  /*
   * 一般模式 fallback
   */
  Object.keys(headers).forEach(function (key) {
    if (
      key.toLowerCase() !==
      name.toLowerCase()
    ) {
      return;
    }

    const value = headers[key];

    if (Array.isArray(value)) {
      value.forEach(function (v) {
        result.push(String(v || ""));
      });
    } else {
      result.push(String(value || ""));
    }
  });

  return result;
}


/* ==============================
 * Cookie
 * ============================== */

function cookieValuesToObject(values) {
  const result = {};

  values.forEach(function (value) {
    String(value || "")
      .split(/;\s*/)
      .forEach(function (part) {
        const pos = part.indexOf("=");

        if (pos <= 0) {
          return;
        }

        const name =
          part.substring(0, pos).trim();

        const val =
          part.substring(pos + 1);

        if (name) {
          result[name] = val;
        }
      });
  });

  return result;
}


function cookieStringToObject(cookie) {
  return cookieValuesToObject([
    String(cookie || "")
  ]);
}


function cookieObjectToString(obj) {
  return Object.keys(obj)
    .map(function (key) {
      return (
        key +
        "=" +
        obj[key]
      );
    })
    .join("; ");
}


function findAuthCookie(cookie) {
  const map =
    cookieStringToObject(cookie);

  const names =
    Object.keys(map);

  for (
    let i = 0;
    i < names.length;
    i++
  ) {
    const name = names[i];

    if (
      /_auth$/i.test(name) &&
      map[name]
    ) {
      return (
        name +
        "=" +
        map[name]
      );
    }
  }

  return "";
}


function hasAuth(cookie) {
  return !!findAuthCookie(cookie);
}


/* ==============================
 * Set-Cookie 合併
 * ============================== */

function mergeSetCookies(
  oldCookie,
  setCookieHeaders
) {
  const map =
    cookieStringToObject(oldCookie);

  setCookieHeaders.forEach(
    function (line) {
      if (!line) {
        return;
      }

      const first =
        String(line).split(";")[0];

      const pos =
        first.indexOf("=");

      if (pos <= 0) {
        return;
      }

      const name =
        first
          .substring(0, pos)
          .trim();

      const value =
        first.substring(pos + 1);

      const deleted =
        /^deleted$/i.test(value) ||
        /max-age\s*=\s*0/i.test(line) ||
        /expires\s*=\s*.*1970/i.test(line);

      if (deleted) {
        delete map[name];
      } else {
        map[name] = value;
      }
    }
  );

  return cookieObjectToString(map);
}


/* ==============================
 * formhash
 * ============================== */

function saveFormhash(url) {
  const match =
    String(url || "").match(
      /[?&]formhash=([^&#]+)/i
    );

  if (
    !match ||
    !match[1]
  ) {
    return;
  }

  let hash =
    match[1];

  try {
    hash =
      decodeURIComponent(hash);
  } catch (_) {}

  if (hash) {
    $persistentStore.write(
      hash,
      FORMHASH_KEY
    );

    console.log(
      "APK.TW：formhash 已更新"
    );
  }
}


/* ==============================
 * 通知
 * ============================== */

function loginNotification(
  oldAuth,
  newAuth,
  cookieCount
) {
  if (!LOGIN_NOTIFY) {
    return;
  }

  const now =
    Date.now();

  const lastNotice =
    parseInt(
      $persistentStore.read(
        NOTICE_KEY
      ) || "0",
      10
    );

  let shouldNotify = false;
  let subtitle = "";

  /*
   * 第一次取得
   */
  if (!oldAuth) {
    shouldNotify = true;
    subtitle = "登入資料擷取成功";
  }

  /*
   * auth 更新
   */
  else if (
    oldAuth !== newAuth
  ) {
    shouldNotify = true;
    subtitle = "登入憑證已更新";
  }

  /*
   * 新 V3 第一次確認，
   * 或超過 24 小時才再次通知。
   */
  else if (
    !lastNotice ||
    now - lastNotice >
      24 * 60 * 60 * 1000
  ) {
    shouldNotify = true;
    subtitle = "登入狀態已確認";
  }

  if (!shouldNotify) {
    return;
  }

  $persistentStore.write(
    String(now),
    NOTICE_KEY
  );

  $notification.post(
    "✅ APK.TW",
    subtitle,
    "已儲存完整登入 Cookie，共 " +
      cookieCount +
      " 項。"
  );
}


/* ==============================
 * Request
 * ============================== */

function handleRequest() {
  const cookieHeaders =
    getHeaderValues(
      $request.headers,
      "cookie"
    );

  console.log(
    "APK.TW：偵測到 " +
      cookieHeaders.length +
      " 個 Cookie Header"
  );

  if (
    cookieHeaders.length > 0
  ) {
    const map =
      cookieValuesToObject(
        cookieHeaders
      );

    const fullCookie =
      cookieObjectToString(map);

    const newAuth =
      findAuthCookie(
        fullCookie
      );

    const oldAuth =
      $persistentStore.read(
        AUTH_KEY
      ) || "";

    /*
     * 只有真正登入狀態
     * 才允許更新主 Cookie。
     */
    if (
      fullCookie &&
      newAuth
    ) {
      $persistentStore.write(
        fullCookie,
        COOKIE_KEY
      );

      $persistentStore.write(
        newAuth,
        AUTH_KEY
      );

      console.log(
        "APK.TW：完整登入 Cookie 已擷取，共 " +
          Object.keys(map).length +
          " 項"
      );

      loginNotification(
        oldAuth,
        newAuth,
        Object.keys(map).length
      );
    } else {
      console.log(
        "APK.TW：本次請求沒有 auth Cookie，不覆蓋已保存登入資料"
      );
    }
  }

  /*
   * User-Agent
   */
  const userAgents =
    getHeaderValues(
      $request.headers,
      "user-agent"
    );

  if (userAgents[0]) {
    $persistentStore.write(
      userAgents[0],
      UA_KEY
    );
  }

  saveFormhash(
    $request.url
  );

  /*
   * 完全不修改原始 request
   */
  $done({});
}


/* ==============================
 * Response
 * ============================== */

function handleResponse() {
  let cookie =
    $persistentStore.read(
      COOKIE_KEY
    ) || "";

  const setCookies =
    getHeaderValues(
      $response.headers,
      "set-cookie"
    );

  if (
    setCookies.length > 0
  ) {
    const beforeAuth =
      findAuthCookie(cookie);

    const merged =
      mergeSetCookies(
        cookie,
        setCookies
      );

    /*
     * 如果原本已有登入資料，
     * 不讓一般匿名 Response
     * 無故覆蓋掉完整 Cookie。
     */
    if (merged) {
      cookie = merged;

      $persistentStore.write(
        cookie,
        COOKIE_KEY
      );

      const auth =
        findAuthCookie(cookie);

      if (auth) {
        $persistentStore.write(
          auth,
          AUTH_KEY
        );
      }

      console.log(
        "APK.TW：收到 " +
          setCookies.length +
          " 筆 Set-Cookie，已合併更新"
      );

      if (
        beforeAuth &&
        !auth
      ) {
        console.log(
          "APK.TW：注意，伺服器已移除 auth Cookie"
        );
      }
    }
  }

  $done({});
}


/* ==============================
 * Main
 * ============================== */

try {
  if (
    typeof $response !==
    "undefined"
  ) {
    handleResponse();
  } else {
    handleRequest();
  }
} catch (error) {
  console.log(
    "APK.TW Cookie V3 錯誤：" +
      error
  );

  $done({});
}
