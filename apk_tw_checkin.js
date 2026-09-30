/*
 * APK.TW Auto Check-in V2
 * Author: howsingsong
 */

const COOKIE_KEY = "APK_TW_COOKIE_V2";
const UA_KEY = "APK_TW_UA";
const FORMHASH_KEY = "APK_TW_FORMHASH";
const LAST_SUCCESS_KEY = "APK_TW_LAST_SUCCESS_V2";

const HOME =
  "https://apk.tw/forum.php";

const SIGN_PAGE =
  "https://apk.tw/plugin.php?id=dsu_amupper:list";

let cookie =
  $persistentStore.read(COOKIE_KEY) || "";

const storedUA =
  $persistentStore.read(UA_KEY);

const UA =
  storedUA ||
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";

const silentIfSigned =
  typeof $argument !== "undefined" &&
  /silent_if_signed=1/i.test($argument);

/* =========================
   Cookie
========================= */

function cookieObject(str) {
  const map = {};

  String(str || "")
    .split(/;\s*/)
    .forEach(part => {
      const p = part.indexOf("=");

      if (p <= 0) return;

      map[
        part.substring(0, p).trim()
      ] = part.substring(p + 1);
    });

  return map;
}

function cookieString(map) {
  return Object.keys(map)
    .map(k => `${k}=${map[k]}`)
    .join("; ");
}

function hasAuth(str) {
  return /(?:^|;\s*)[^=;]+_auth=[^;]+/i.test(
    str || ""
  );
}

function headerValues(headers, name) {
  const arr = [];

  if (!headers) return arr;

  if (Array.isArray(headers)) {
    headers.forEach(h => {
      if (
        h &&
        h.field &&
        h.field.toLowerCase() ===
          name.toLowerCase()
      ) {
        arr.push(String(h.value || ""));
      }
    });

    return arr;
  }

  Object.keys(headers).forEach(k => {
    if (
      k.toLowerCase() ===
      name.toLowerCase()
    ) {
      const v = headers[k];

      if (Array.isArray(v)) {
        v.forEach(x =>
          arr.push(String(x))
        );
      } else {
        arr.push(String(v || ""));
      }
    }
  });

  return arr;
}

function mergeCookies(headers) {
  const map = cookieObject(cookie);

  headerValues(
    headers,
    "set-cookie"
  ).forEach(line => {
    const first =
      line.split(";")[0];

    const p =
      first.indexOf("=");

    if (p <= 0) return;

    const name =
      first.substring(0, p).trim();

    const value =
      first.substring(p + 1);

    const deleted =
      /^deleted$/i.test(value) ||
      /max-age\s*=\s*0/i.test(line) ||
      /expires\s*=\s*.*1970/i.test(line);

    if (deleted) {
      delete map[name];
    } else {
      map[name] = value;
    }
  });

  cookie = cookieString(map);

  $persistentStore.write(
    cookie,
    COOKIE_KEY
  );
}

/* =========================
   HTTP
========================= */

function normalHeaders() {
  return {
    "User-Agent": UA,
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":
      "zh-TW,zh-Hant;q=0.9",
    "Referer": HOME,
    "Cookie": cookie
  };
}

function ajaxHeaders() {
  return {
    "User-Agent": UA,
    "Accept": "*/*",
    "Accept-Language":
      "zh-TW,zh-Hant;q=0.9",

    "Referer": HOME,

    "Sec-Fetch-Site":
      "same-origin",
    "Sec-Fetch-Mode":
      "cors",
    "Sec-Fetch-Dest":
      "empty",

    "X-Requested-With":
      "XMLHttpRequest",

    "Cookie": cookie
  };
}

function get(url, ajax = false) {
  return new Promise(
    (resolve, reject) => {
      $httpClient.get(
        {
          url,
          headers:
            ajax
              ? ajaxHeaders()
              : normalHeaders(),

          timeout: 15,

          "auto-cookie": false,
          "auto-redirect": true,
          "full-header-mode": true
        },

        (error, response, data) => {
          if (error) {
            reject(
              new Error(error)
            );
            return;
          }

          if (response) {
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
              String(data || "")
          });
        }
      );
    }
  );
}

function sleep(ms) {
  return new Promise(
    r => setTimeout(r, ms)
  );
}

/* =========================
   網頁分析
========================= */

function loginRequired(html) {
  return (
    /您需要先登錄才能繼續本操作/i.test(html) ||
    /請先登錄/i.test(html) ||
    /尚未登錄/i.test(html)
  );
}

function extractFormhash(html) {
  const patterns = [
    /name=["']formhash["'][^>]*value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]*name=["']formhash["']/i,
    /[?&](?:amp;)?formhash=([a-zA-Z0-9]+)/i,
    /formhash["']?\s*[:=]\s*["']([a-zA-Z0-9]+)["']/i
  ];

  for (const p of patterns) {
    const m =
      String(html || "").match(p);

    if (m && m[1]) {
      return m[1];
    }
  }

  return "";
}

/*
 * 重點：
 * 不判斷 wb.gif。
 */
function signedOnSignPage(html) {
  return (
    /您本日已經簽到/i.test(html) ||
    /您本日已經签到/i.test(html) ||
    /今日已簽/i.test(html) ||
    /今天已簽到/i.test(html)
  );
}

function signedOnHome(html) {
  const source =
    String(html || "");

  const pos =
    source.search(
      /id=["']my_amupper["']/i
    );

  if (pos < 0) {
    return false;
  }

  /*
   * 只檢查 my_amupper 附近的文字，
   * 不再把 wb.gif 視為成功。
   */
  const block =
    source.substring(
      Math.max(0, pos - 300),
      Math.min(
        source.length,
        pos + 1800
      )
    );

  return (
    /已簽到/i.test(block) ||
    /本日已經簽到/i.test(block)
  );
}

/* =========================
   查詢真正狀態
========================= */

async function checkStatus() {
  let formhash = "";

  const home =
    await get(HOME);

  if (
    loginRequired(home.body)
  ) {
    return {
      signed: false,
      expired: true,
      formhash: ""
    };
  }

  formhash =
    extractFormhash(home.body);

  if (
    signedOnHome(home.body)
  ) {
    return {
      signed: true,
      expired: false,
      formhash
    };
  }

  const sign =
    await get(SIGN_PAGE);

  if (
    loginRequired(sign.body)
  ) {
    return {
      signed: false,
      expired: true,
      formhash
    };
  }

  if (!formhash) {
    formhash =
      extractFormhash(sign.body);
  }

  return {
    signed:
      signedOnSignPage(
        sign.body
      ),

    expired: false,
    formhash
  };
}

/* =========================
   Notification
========================= */

function notify(
  title,
  subtitle,
  body
) {
  console.log(
    `${title} | ${subtitle} | ${body}`
  );

  $notification.post(
    title,
    subtitle,
    body,
    {
      url: SIGN_PAGE
    }
  );
}

/* =========================
   Main
========================= */

async function main() {
  console.log(
    "===== APK.TW V2 ====="
  );

  if (
    !cookie ||
    !hasAuth(cookie)
  ) {
    notify(
      "❌ APK.TW",
      "登入資料不存在",
      "請使用 Safari 登入 APK.TW 一次。"
    );

    return;
  }

  /*
   * 簽到前先向伺服器確認。
   */
  let state =
    await checkStatus();

  if (state.expired) {
    notify(
      "❌ APK.TW",
      "登入已失效",
      "請重新登入 APK.TW 一次。"
    );

    return;
  }

  if (state.signed) {
    console.log(
      "APK.TW：伺服器確認今日已簽到"
    );

    if (!silentIfSigned) {
      notify(
        "☑️ APK.TW",
        "今日已簽到",
        "已由 APK.TW 簽到頁確認。"
      );
    }

    return;
  }

  let formhash =
    state.formhash ||
    $persistentStore.read(
      FORMHASH_KEY
    );

  if (!formhash) {
    notify(
      "❌ APK.TW",
      "找不到 formhash",
      "請先用 Safari 開啟 APK.TW forum.php。"
    );

    return;
  }

  $persistentStore.write(
    formhash,
    FORMHASH_KEY
  );

  const ts =
    Math.floor(
      Date.now() / 1000
    );

  const url =
    "https://apk.tw/plugin.php" +
    "?id=dsu_amupper:pper" +
    "&ajax=1" +
    "&formhash=" +
    encodeURIComponent(formhash) +
    "&zjtesttimes=" +
    ts +
    "&inajax=1" +
    "&ajaxtarget=my_amupper";

  console.log(
    "APK.TW：送出真正 pper 簽到"
  );

  const result =
    await get(
      url,
      true
    );

  console.log(
    "HTTP：" +
      result.status
  );

  /*
   * wb.gif 只記錄，不算成功。
   */
  if (
    /dsu_amupper\/images\/wb\.gif/i.test(
      result.body
    )
  ) {
    console.log(
      "收到 wb.gif，但尚未判定成功"
    );
  }

  /*
   * APK.TW 官方曾提到資料寫入
   * 有時會有延遲，所以重新整理數次。
   */
  for (
    let i = 1;
    i <= 4;
    i++
  ) {
    await sleep(2500);

    console.log(
      `APK.TW：第 ${i} 次驗證`
    );

    state =
      await checkStatus();

    if (state.expired) {
      notify(
        "❌ APK.TW",
        "登入狀態失效",
        "簽到後重新驗證時登入失效。"
      );

      return;
    }

    if (state.signed) {
      const now =
        new Date();

      const date =
        `${now.getFullYear()}-` +
        `${String(now.getMonth() + 1).padStart(2, "0")}-` +
        `${String(now.getDate()).padStart(2, "0")}`;

      $persistentStore.write(
        date,
        LAST_SUCCESS_KEY
      );

      notify(
        "✅ APK.TW",
        "簽到成功",
        `已經過 APK.TW 伺服器第 ${i} 次狀態驗證。`
      );

      return;
    }
  }

  /*
   * 絕對不再報假成功。
   */
  notify(
    "⚠️ APK.TW",
    "簽到未確認",
    "pper 已執行，但伺服器仍未確認今日簽到；08:20 會再自動補簽。"
  );
}

main()
  .catch(e => {
    console.log(
      "APK.TW V2 Error：" +
        e
    );

    notify(
      "❌ APK.TW",
      "腳本錯誤",
      String(e)
    );
  })
  .finally(() => {
    $done();
  });
