/*
 * APK.TW Login Keep Alive V3
 * Author: howsingsong
 *
 * 功能：
 * - 定時開啟 APK.TW
 * - 更新伺服器 Set-Cookie
 * - 延長可續期的登入 Session
 * - 可在 Surge 手動執行「登入狀態檢查」
 */

const COOKIE_KEY =
  "APK_TW_COOKIE_V3";

const AUTH_KEY =
  "APK_TW_AUTH_V3";

const UA_KEY =
  "APK_TW_UA_V3";


const HOME =
  "https://apk.tw/forum.php";


/* =========================
 * Arguments
 * ========================= */

const ARG =
  typeof $argument !== "undefined"
    ? String($argument)
    : "";

const MODE =
  /mode=status/i.test(ARG)
    ? "status"
    : "keepalive";

const ENABLED =
  !/enabled=(false|0|off|no)/i.test(
    ARG
  );

const NOTIFY =
  !/notify=(false|0|off|no)/i.test(
    ARG
  );


/* =========================
 * Cookie
 * ========================= */

let cookie =
  $persistentStore.read(
    COOKIE_KEY
  ) || "";

const userAgent =
  $persistentStore.read(
    UA_KEY
  ) ||
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";


function cookieObject(str) {
  const result = {};

  String(str || "")
    .split(/;\s*/)
    .forEach(function (part) {
      const pos =
        part.indexOf("=");

      if (pos <= 0) {
        return;
      }

      const name =
        part
          .substring(0, pos)
          .trim();

      const value =
        part.substring(pos + 1);

      if (name) {
        result[name] =
          value;
      }
    });

  return result;
}


function cookieString(map) {
  return Object.keys(map)
    .map(function (key) {
      return (
        key +
        "=" +
        map[key]
      );
    })
    .join("; ");
}


function findAuth(str) {
  const map =
    cookieObject(str);

  const keys =
    Object.keys(map);

  for (
    let i = 0;
    i < keys.length;
    i++
  ) {
    const key =
      keys[i];

    if (
      /_auth$/i.test(key) &&
      map[key]
    ) {
      return (
        key +
        "=" +
        map[key]
      );
    }
  }

  return "";
}


function hasAuth(str) {
  return !!findAuth(str);
}


/* =========================
 * Headers
 * ========================= */

function headerValues(
  headers,
  name
) {
  const result = [];

  if (!headers) {
    return result;
  }

  if (
    Array.isArray(headers)
  ) {
    headers.forEach(
      function (item) {
        if (
          item &&
          item.field &&
          String(
            item.field
          ).toLowerCase() ===
            name.toLowerCase()
        ) {
          result.push(
            String(
              item.value || ""
            )
          );
        }
      }
    );

    return result;
  }

  Object.keys(headers)
    .forEach(function (key) {
      if (
        key.toLowerCase() !==
        name.toLowerCase()
      ) {
        return;
      }

      const value =
        headers[key];

      if (
        Array.isArray(value)
      ) {
        value.forEach(
          function (v) {
            result.push(
              String(v || "")
            );
          }
        );
      } else {
        result.push(
          String(value || "")
        );
      }
    });

  return result;
}


/* =========================
 * Set-Cookie
 * ========================= */

function mergeCookies(headers) {
  const map =
    cookieObject(cookie);

  const lines =
    headerValues(
      headers,
      "set-cookie"
    );

  lines.forEach(
    function (line) {
      const first =
        String(line)
          .split(";")[0];

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
        first.substring(
          pos + 1
        );

      const deleted =
        /^deleted$/i.test(
          value
        ) ||
        /max-age\s*=\s*0/i.test(
          line
        ) ||
        /expires\s*=\s*.*1970/i.test(
          line
        );

      if (deleted) {
        delete map[name];
      } else {
        map[name] =
          value;
      }
    }
  );

  cookie =
    cookieString(map);

  $persistentStore.write(
    cookie,
    COOKIE_KEY
  );

  const auth =
    findAuth(cookie);

  if (auth) {
    $persistentStore.write(
      auth,
      AUTH_KEY
    );
  }

  console.log(
    "APK.TW：保活收到 " +
      lines.length +
      " 筆 Set-Cookie"
  );
}


/* =========================
 * Notification
 * ========================= */

function notification(
  title,
  subtitle,
  body,
  force
) {
  console.log(
    title +
      " | " +
      subtitle +
      " | " +
      body
  );

  if (
    !NOTIFY &&
    !force
  ) {
    return;
  }

  $notification.post(
    title,
    subtitle,
    body,
    {
      url:
        HOME
    }
  );
}


/* =========================
 * 判斷登入狀態
 * ========================= */

function loginExpired(html) {
  const body =
    String(html || "");

  return (
    /您需要先登錄才能繼續本操作/i.test(
      body
    ) ||
    /請先登錄/i.test(
      body
    ) ||
    /尚未登錄/i.test(
      body
    )
  );
}


function pageLooksLoggedIn(html) {
  const body =
    String(html || "");

  /*
   * Discuz 登入狀態通常會有
   * logout / 退出連結。
   */
  return (
    /member\.php\?mod=logging[^"'<>]*action=logout/i.test(
      body
    ) ||
    />\s*退出\s*</i.test(
      body
    ) ||
    />\s*登出\s*</i.test(
      body
    )
  );
}


/* =========================
 * Run
 * ========================= */

function run() {
  /*
   * Cron 保活被使用者關閉。
   * 手動 status 不受影響。
   */
  if (
    MODE === "keepalive" &&
    !ENABLED
  ) {
    console.log(
      "APK.TW：登入保活已於模組設定中關閉"
    );

    $done();
    return;
  }


  /*
   * 沒 Cookie。
   */
  if (
    !cookie ||
    !hasAuth(cookie)
  ) {
    notification(
      "❌ APK.TW",
      "沒有登入 Cookie",
      "請先使用 Safari 登入 APK.TW，並開啟 forum.php。",
      MODE === "status"
    );

    $done();
    return;
  }


  $httpClient.get(
    {
      url:
        HOME,

      headers: {
        "User-Agent":
          userAgent,

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "zh-TW,zh-Hant;q=0.9,en;q=0.8",

        "Cookie":
          cookie
      },

      timeout: 15,

      "auto-cookie":
        false,

      "auto-redirect":
        true,

      "full-header-mode":
        true
    },

    function (
      error,
      response,
      data
    ) {
      if (error) {
        notification(
          "❌ APK.TW",
          "登入檢查失敗",
          String(error),
          MODE === "status"
        );

        $done();
        return;
      }


      if (
        response &&
        response.headers
      ) {
        mergeCookies(
          response.headers
        );
      }


      const body =
        String(data || "");


      /*
       * 明確要求登入。
       */
      if (
        loginExpired(body)
      ) {
        notification(
          "❌ APK.TW",
          "登入狀態已失效",
          "APK.TW 已要求重新登入。",
          true
        );

        $done();
        return;
      }


      /*
       * 明確找到登入狀態。
       */
      if (
        pageLooksLoggedIn(
          body
        )
      ) {
        notification(
          "✅ APK.TW",
          MODE === "status"
            ? "登入狀態正常"
            : "登入保活完成",
          "Cookie 有效，並已同步 APK.TW 最新 Set-Cookie。",
          MODE === "status"
        );

        $done();
        return;
      }


      /*
       * 有 auth、HTTP 正常，
       * 但 HTML 沒有明確登入標誌。
       *
       * 不宣稱 100% 已登入。
       */
      notification(
        "⚠️ APK.TW",
        "登入狀態無法完全確認",
        "auth Cookie 存在且網站可正常存取，但頁面沒有找到明確登入標誌。",
        MODE === "status"
      );

      $done();
    }
  );
}


run();
