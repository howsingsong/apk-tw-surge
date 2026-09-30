/*
 * APK.TW Auto Check-in V3
 * Author: howsingsong
 *
 * 重點：
 * - 不再把 wb.gif 當成簽到成功
 * - 使用 V3 完整 Cookie
 * - 簽到前自動取得最新 formhash
 * - 自動吸收 Set-Cookie
 * - 送出 pper 後重新向網站確認
 * - 無法確認就絕不報「成功」
 */

const COOKIE_KEY =
  "APK_TW_COOKIE_V3";

const AUTH_KEY =
  "APK_TW_AUTH_V3";

const UA_KEY =
  "APK_TW_UA_V3";

const FORMHASH_KEY =
  "APK_TW_FORMHASH_V3";

const LAST_SUCCESS_KEY =
  "APK_TW_LAST_SUCCESS_V3";


const HOME =
  "https://apk.tw/forum.php";

const SIGN_PAGE =
  "https://apk.tw/plugin.php?id=dsu_amupper:list";


/* =========================
 * Arguments
 * ========================= */

const ARG =
  typeof $argument !== "undefined"
    ? String($argument)
    : "";

const MODE =
  /mode=retry/i.test(ARG)
    ? "retry"
    : "checkin";

const RETRY_ENABLED =
  !/enabled=(false|0|off|no)/i.test(
    ARG
  );

const NOTIFY_ENABLED =
  !/notify=(false|0|off|no)/i.test(
    ARG
  );

const SILENT_IF_SIGNED =
  /silent_if_signed=1/i.test(
    ARG
  );


/* =========================
 * 資料
 * ========================= */

let cookie =
  $persistentStore.read(
    COOKIE_KEY
  ) || "";

const storedUA =
  $persistentStore.read(
    UA_KEY
  );

const USER_AGENT =
  storedUA ||
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";


/* =========================
 * Cookie
 * ========================= */

function cookieObject(str) {
  const map = {};

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
        map[name] = value;
      }
    });

  return map;
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
 * Header
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
      if (!line) {
        return;
      }

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
}


/* =========================
 * HTTP Headers
 * ========================= */

function normalHeaders() {
  return {
    "User-Agent":
      USER_AGENT,

    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

    "Accept-Language":
      "zh-TW,zh-Hant;q=0.9,en;q=0.8",

    "Referer":
      HOME,

    "Cookie":
      cookie
  };
}


function ajaxHeaders() {
  return {
    "User-Agent":
      USER_AGENT,

    "Accept":
      "*/*",

    "Accept-Language":
      "zh-TW,zh-Hant;q=0.9,en;q=0.8",

    "Referer":
      HOME,

    "X-Requested-With":
      "XMLHttpRequest",

    "Sec-Fetch-Site":
      "same-origin",

    "Sec-Fetch-Mode":
      "cors",

    "Sec-Fetch-Dest":
      "empty",

    "Cookie":
      cookie
  };
}


/* =========================
 * HTTP
 * ========================= */

function httpGet(
  url,
  ajax
) {
  return new Promise(
    function (
      resolve,
      reject
    ) {
      $httpClient.get(
        {
          url: url,

          headers:
            ajax
              ? ajaxHeaders()
              : normalHeaders(),

          timeout: 15,

          /*
           * Cookie 完全由我們自己管理。
           */
          "auto-cookie":
            false,

          "auto-redirect":
            true,

          /*
           * 保留重複 Set-Cookie。
           */
          "full-header-mode":
            true
        },

        function (
          error,
          response,
          data
        ) {
          if (error) {
            reject(
              new Error(
                String(error)
              )
            );

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

          resolve({
            status:
              response
                ? response.status
                : 0,

            body:
              String(
                data || ""
              )
          });
        }
      );
    }
  );
}


function sleep(ms) {
  return new Promise(
    function (resolve) {
      setTimeout(
        resolve,
        ms
      );
    }
  );
}


/* =========================
 * 網頁分析
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
    ) ||
    /member\.php\?mod=logging[^"'<>]*action=login/i.test(
      body
    )
  );
}


function extractFormhash(html) {
  const body =
    String(html || "");

  const patterns = [
    /name=["']formhash["'][^>]*value=["']([^"']+)["']/i,

    /value=["']([^"']+)["'][^>]*name=["']formhash["']/i,

    /[?&](?:amp;)?formhash=([a-zA-Z0-9]+)/i,

    /formhash["']?\s*[:=]\s*["']([a-zA-Z0-9]+)["']/i
  ];

  for (
    let i = 0;
    i < patterns.length;
    i++
  ) {
    const match =
      body.match(
        patterns[i]
      );

    if (
      match &&
      match[1]
    ) {
      return match[1];
    }
  }

  return "";
}


/*
 * V3：
 * 絕對不使用 wb.gif 判斷。
 *
 * 只有 APK.TW 網頁明確寫出
 * 已簽到相關文字時才算成功。
 */
function isSigned(html) {
  const body =
    String(html || "");

  return (
    /您本日已經簽到/i.test(
      body
    ) ||
    /您本日已經签到/i.test(
      body
    ) ||
    /本日已簽到/i.test(
      body
    ) ||
    /今日已簽到/i.test(
      body
    ) ||
    /今天已簽到/i.test(
      body
    ) ||
    /今日已簽/i.test(
      body
    )
  );
}


/* =========================
 * 狀態查詢
 * ========================= */

async function checkStatus() {
  let formhash = "";

  /*
   * 先打首頁，
   * 同時讓網站更新 Cookie。
   */
  const home =
    await httpGet(
      HOME,
      false
    );

  if (
    loginExpired(
      home.body
    )
  ) {
    return {
      expired: true,
      signed: false,
      formhash: ""
    };
  }

  formhash =
    extractFormhash(
      home.body
    );

  if (
    isSigned(
      home.body
    )
  ) {
    return {
      expired: false,
      signed: true,
      formhash: formhash
    };
  }

  /*
   * 再開真正簽到頁。
   */
  const signPage =
    await httpGet(
      SIGN_PAGE,
      false
    );

  if (
    loginExpired(
      signPage.body
    )
  ) {
    return {
      expired: true,
      signed: false,
      formhash: formhash
    };
  }

  if (!formhash) {
    formhash =
      extractFormhash(
        signPage.body
      );
  }

  return {
    expired: false,
    signed:
      isSigned(
        signPage.body
      ),

    formhash:
      formhash
  };
}


/* =========================
 * Notification
 * ========================= */

function notify(
  title,
  subtitle,
  body
) {
  console.log(
    title +
      " | " +
      subtitle +
      " | " +
      body
  );

  if (
    !NOTIFY_ENABLED
  ) {
    return;
  }

  $notification.post(
    title,
    subtitle,
    body,
    {
      url:
        SIGN_PAGE
    }
  );
}


/* =========================
 * 日期
 * ========================= */

function today() {
  const d =
    new Date();

  return (
    d.getFullYear() +
    "-" +
    String(
      d.getMonth() + 1
    ).padStart(2, "0") +
    "-" +
    String(
      d.getDate()
    ).padStart(2, "0")
  );
}


/* =========================
 * Main
 * ========================= */

async function main() {
  console.log(
    "============================"
  );

  console.log(
    "APK.TW Auto Check-in V3"
  );

  console.log(
    "模式：" + MODE
  );

  console.log(
    "============================"
  );


  /*
   * 補簽關閉
   */
  if (
    MODE === "retry" &&
    !RETRY_ENABLED
  ) {
    console.log(
      "APK.TW：補簽功能已關閉"
    );

    return;
  }


  /*
   * Cookie
   */
  if (
    !cookie ||
    !hasAuth(cookie)
  ) {
    notify(
      "❌ APK.TW",
      "沒有有效登入資料",
      "請先使用 Safari 登入 APK.TW，讓 Surge 重新擷取 V3 Cookie。"
    );

    return;
  }


  /*
   * 先確認目前狀態
   */
  let state =
    await checkStatus();


  if (
    state.expired
  ) {
    notify(
      "❌ APK.TW",
      "登入狀態已失效",
      "APK.TW 要求重新登入，請重新登入一次。"
    );

    return;
  }


  /*
   * 已經簽過
   */
  if (
    state.signed
  ) {
    console.log(
      "APK.TW：網站確認今日已簽到"
    );

    $persistentStore.write(
      today(),
      LAST_SUCCESS_KEY
    );

    if (
      !SILENT_IF_SIGNED
    ) {
      notify(
        "☑️ APK.TW",
        "今日已簽到",
        "已由 APK.TW 網頁實際狀態確認。"
      );
    }

    return;
  }


  /*
   * formhash
   */
  let formhash =
    state.formhash;

  if (!formhash) {
    formhash =
      $persistentStore.read(
        FORMHASH_KEY
      ) || "";
  }


  if (!formhash) {
    notify(
      "❌ APK.TW",
      "找不到 formhash",
      "請先用 Safari 開啟 APK.TW forum.php，再重新執行。"
    );

    return;
  }


  $persistentStore.write(
    formhash,
    FORMHASH_KEY
  );


  /*
   * timestamp
   */
  const timestamp =
    Math.floor(
      Date.now() / 1000
    );


  /*
   * 與你真正成功封包相同的 URL。
   */
  const signURL =
    "https://apk.tw/plugin.php" +
    "?id=dsu_amupper:pper" +
    "&ajax=1" +
    "&formhash=" +
    encodeURIComponent(
      formhash
    ) +
    "&zjtesttimes=" +
    timestamp +
    "&inajax=1" +
    "&ajaxtarget=my_amupper";


  console.log(
    "APK.TW：送出 pper 簽到"
  );


  const response =
    await httpGet(
      signURL,
      true
    );


  console.log(
    "APK.TW：pper HTTP " +
      response.status
  );


  /*
   * wb.gif 只做 Debug。
   * 不再代表成功。
   */
  if (
    /dsu_amupper\/images\/wb\.gif/i.test(
      response.body
    )
  ) {
    console.log(
      "APK.TW：收到 wb.gif，但 V3 不把它當成成功"
    );
  }


  /*
   * 真正向伺服器重新驗證。
   *
   * 有些站點寫入後不會立即反映，
   * 所以最多確認四次。
   */
  for (
    let attempt = 1;
    attempt <= 4;
    attempt++
  ) {
    await sleep(
      2500
    );

    console.log(
      "APK.TW：第 " +
        attempt +
        " 次確認真正簽到狀態"
    );

    state =
      await checkStatus();


    if (
      state.expired
    ) {
      notify(
        "❌ APK.TW",
        "登入狀態失效",
        "簽到後重新確認時，APK.TW 要求重新登入。"
      );

      return;
    }


    if (
      state.signed
    ) {
      $persistentStore.write(
        today(),
        LAST_SUCCESS_KEY
      );

      notify(
        "✅ APK.TW",
        "簽到成功",
        "APK.TW 網頁已實際確認今日完成簽到。驗證次數：" +
          attempt
      );

      return;
    }
  }


  /*
   * 這裡最重要：
   *
   * 即使 HTTP 200
   * 即使有 wb.gif
   *
   * 網站沒有確認，就絕不說成功。
   */
  notify(
    "⚠️ APK.TW",
    "簽到尚未確認",
    MODE === "checkin"
      ? "pper 已送出，但網站仍未顯示今日簽到完成。稍後會由補簽功能再次嘗試。"
      : "補簽請求已送出，但網站仍未確認今日簽到。"
  );
}


/* =========================
 * Run
 * ========================= */

main()
  .catch(function (error) {
    console.log(
      "APK.TW V3 Error：" +
        error
    );

    notify(
      "❌ APK.TW",
      "腳本執行錯誤",
      String(error)
    );
  })
  .finally(function () {
    $done();
  });
