/*
 * APK.TW 每日自動簽到
 * Author: howsingsong
 */

const COOKIE_KEY = "APK_TW_COOKIE";
const FORMHASH_KEY = "APK_TW_FORMHASH";
const LAST_SUCCESS_KEY = "APK_TW_LAST_SUCCESS";

const HOME_URL = "https://apk.tw/forum.php";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
  "Version/26.6 Safari/605.1.15";

const CONFIG = parseArgument(
  typeof $argument !== "undefined" ? $argument : ""
);

const NOTIFY =
  !CONFIG.notify ||
  !["0", "false", "off", "no"].includes(
    String(CONFIG.notify).toLowerCase()
  );

/*
 * ===============================
 * 共用函式
 * ===============================
 */

function parseArgument(str) {
  const result = {};

  if (!str) return result;

  str.split("&").forEach(function (item) {
    const pos = item.indexOf("=");

    if (pos === -1) return;

    const key = item.substring(0, pos).trim();
    const value = item.substring(pos + 1).trim();

    result[key] = value;
  });

  return result;
}

function notify(title, subtitle, body) {
  console.log(title + " | " + body);

  if (!NOTIFY) return;

  $notification.post(
    title,
    subtitle || "",
    body || "",
    {
      url: "https://apk.tw/forum.php"
    }
  );
}

function today() {
  const d = new Date();

  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function hasAuthCookie(cookie) {
  if (!cookie) return false;

  return /(?:^|;\s*)[^=;]*_auth=[^;]+/i.test(cookie);
}

function getHeaderValues(headers, target) {
  const result = [];

  if (!headers) return result;

  /*
   * full-header-mode=true 時
   * headers 是：
   *
   * [
   *   { field: "Set-Cookie", value: "..." }
   * ]
   */
  if (Array.isArray(headers)) {
    headers.forEach(function (item) {
      if (
        item &&
        item.field &&
        item.field.toLowerCase() === target.toLowerCase()
      ) {
        result.push(String(item.value || ""));
      }
    });

    return result;
  }

  const keys = Object.keys(headers);

  keys.forEach(function (key) {
    if (key.toLowerCase() === target.toLowerCase()) {
      const value = headers[key];

      if (Array.isArray(value)) {
        value.forEach(function (v) {
          result.push(String(v));
        });
      } else {
        result.push(String(value || ""));
      }
    }
  });

  return result;
}

function cookieToObject(cookie) {
  const result = {};

  if (!cookie) return result;

  cookie.split(/;\s*/).forEach(function (part) {
    const pos = part.indexOf("=");

    if (pos <= 0) return;

    const key = part.substring(0, pos).trim();
    const value = part.substring(pos + 1);

    if (key) {
      result[key] = value;
    }
  });

  return result;
}

function objectToCookie(obj) {
  return Object.keys(obj)
    .map(function (key) {
      return key + "=" + obj[key];
    })
    .join("; ");
}

/*
 * 把伺服器的新 Set-Cookie 合併回原 Cookie。
 *
 * APK.TW 在你的封包中確實會回傳多筆 Set-Cookie，
 * 所以這裡會同步更新，避免 Cookie 長期不更新。
 */
function mergeSetCookies(cookie, headers) {
  const map = cookieToObject(cookie);

  const values = getHeaderValues(headers, "set-cookie");

  values.forEach(function (line) {
    if (!line) return;

    const first = line.split(";")[0];

    const pos = first.indexOf("=");

    if (pos <= 0) return;

    const name = first.substring(0, pos).trim();
    const value = first.substring(pos + 1);

    const deleted =
      /expires\s*=\s*(?:thu,\s*01\s*jan\s*1970|.*1970)/i.test(line) ||
      /max-age\s*=\s*0/i.test(line) ||
      value.toLowerCase() === "deleted";

    if (deleted) {
      delete map[name];
    } else {
      map[name] = value;
    }
  });

  return objectToCookie(map);
}

function baseHeaders(cookie) {
  return {
    "User-Agent": USER_AGENT,
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh-Hant;q=0.9",
    "Referer": HOME_URL,
    "Cookie": cookie
  };
}

function ajaxHeaders(cookie) {
  return {
    "User-Agent": USER_AGENT,
    "Accept": "*/*",
    "Accept-Language": "zh-TW,zh-Hant;q=0.9",
    "Referer": HOME_URL,
    "X-Requested-With": "XMLHttpRequest",
    "Cookie": cookie
  };
}

function httpGet(url, headers) {
  return new Promise(function (resolve, reject) {
    $httpClient.get(
      {
        url: url,
        headers: headers,
        timeout: 15,

        /*
         * 自己管理 Cookie，避免與 Surge Script HTTP
         * Client 內部 Cookie Jar 混用。
         */
        "auto-cookie": false,

        /*
         * APK.TW 回傳很多 Set-Cookie。
         * 開啟此功能才能保留重複 Header。
         */
        "full-header-mode": true,

        "auto-redirect": true
      },
      function (error, response, data) {
        if (error) {
          reject(new Error(error));
          return;
        }

        resolve({
          status: response ? response.status : 0,
          headers: response ? response.headers : [],
          body: data || ""
        });
      }
    );
  });
}

/*
 * ===============================
 * formhash
 * ===============================
 */

function extractFormhash(html) {
  if (!html) return "";

  const patterns = [
    /name=["']formhash["'][^>]*value=["']([^"']+)["']/i,

    /value=["']([^"']+)["'][^>]*name=["']formhash["']/i,

    /[?&](?:amp;)?formhash=([a-zA-Z0-9]+)/i,

    /formhash["']?\s*[:=]\s*["']([a-zA-Z0-9]+)["']/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const m = html.match(patterns[i]);

    if (m && m[1]) {
      return m[1];
    }
  }

  return "";
}

/*
 * ===============================
 * 判斷是否已簽到
 * ===============================
 */

function isSignedHome(html) {
  if (!html) return false;

  if (
    /您本日已經簽到/i.test(html) ||
    /今日已簽到/i.test(html) ||
    /今天已簽到/i.test(html)
  ) {
    return true;
  }

  /*
   * APK.TW 首頁的簽到區塊：
   * id="my_amupper"
   *
   * 已簽到之後會切換成 wb.gif。
   */
  const index = html.search(/id=["']my_amupper["']/i);

  if (index !== -1) {
    const block = html.substring(
      Math.max(0, index - 500),
      Math.min(html.length, index + 2000)
    );

    if (
      /wb\.(?:gif|png)/i.test(block) ||
      /已簽到/i.test(block)
    ) {
      return true;
    }
  }

  return false;
}

function loginExpired(body) {
  if (!body) return false;

  return (
    /您需要先登錄才能繼續本操作/i.test(body) ||
    /您需要先登录才能继续本操作/i.test(body) ||
    /請先登錄/i.test(body) ||
    /请先登录/i.test(body) ||
    /尚未登錄/i.test(body) ||
    /尚未登录/i.test(body)
  );
}

function illegalRequest(body) {
  if (!body) return false;

  return (
    /非法操作/i.test(body) ||
    /請求來路不正確/i.test(body) ||
    /请求来路不正确/i.test(body) ||
    /安全驗證/i.test(body) ||
    /安全验证/i.test(body)
  );
}

/*
 * ===============================
 * 主程式
 * ===============================
 */

async function main() {
  console.log("========== APK.TW 自動簽到 ==========");

  let cookie = $persistentStore.read(COOKIE_KEY);

  /*
   * 1. Cookie
   */

  if (!cookie) {
    notify(
      "❌ APK.TW 自動簽到",
      "尚未取得登入資料",
      "請先使用 Safari 登入 APK.TW，並開啟一次 forum.php。"
    );

    return;
  }

  if (!hasAuthCookie(cookie)) {
    notify(
      "❌ APK.TW 自動簽到",
      "Cookie 無登入資訊",
      "沒有找到 APK.TW auth Cookie，請重新登入網站。"
    );

    return;
  }

  /*
   * 2. 開啟論壇首頁
   */

  console.log("正在取得 APK.TW 首頁...");

  let home = await httpGet(
    HOME_URL,
    baseHeaders(cookie)
  );

  console.log("首頁 HTTP：" + home.status);

  cookie = mergeSetCookies(
    cookie,
    home.headers
  );

  $persistentStore.write(
    cookie,
    COOKIE_KEY
  );

  /*
   * 3. 如果首頁已顯示已簽到
   */

  if (isSignedHome(home.body)) {
    $persistentStore.write(
      today(),
      LAST_SUCCESS_KEY
    );

    notify(
      "☑️ APK.TW 每日簽到",
      "今日已完成",
      "APK.TW 顯示今天已經簽到。"
    );

    return;
  }

  /*
   * 4. 取得最新 formhash
   */

  let formhash =
    extractFormhash(home.body);

  if (formhash) {
    $persistentStore.write(
      formhash,
      FORMHASH_KEY
    );

    console.log(
      "取得最新 formhash：" + formhash
    );
  } else {
    formhash =
      $persistentStore.read(
        FORMHASH_KEY
      );

    if (formhash) {
      console.log(
        "使用已儲存 formhash：" +
          formhash
      );
    }
  }

  if (!formhash) {
    notify(
      "❌ APK.TW 自動簽到",
      "無法取得 formhash",
      "請先開啟 APK.TW 首頁後再試一次。"
    );

    return;
  }

  /*
   * 5. 產生你封包裡看到的 zjtesttimes
   */

  const timestamp =
    Math.floor(Date.now() / 1000);

  /*
   * 6. 組出與你實際封包完全相同的簽到 URL
   */

  const signURL =
    "https://apk.tw/plugin.php" +
    "?id=dsu_amupper:pper" +
    "&ajax=1" +
    "&formhash=" +
    encodeURIComponent(formhash) +
    "&zjtesttimes=" +
    timestamp +
    "&inajax=1" +
    "&ajaxtarget=my_amupper";

  console.log(
    "正在送出 APK.TW 簽到..."
  );

  /*
   * 7. 送出簽到
   */

  const sign = await httpGet(
    signURL,
    ajaxHeaders(cookie)
  );

  console.log(
    "簽到 HTTP：" + sign.status
  );

  cookie = mergeSetCookies(
    cookie,
    sign.headers
  );

  $persistentStore.write(
    cookie,
    COOKIE_KEY
  );

  /*
   * 8. Cookie 已失效
   */

  if (loginExpired(sign.body)) {
    notify(
      "❌ APK.TW 自動簽到",
      "登入已失效",
      "APK.TW Cookie 已過期，請重新登入一次。"
    );

    return;
  }

  /*
   * 9. formhash / CSRF 問題
   */

  if (illegalRequest(sign.body)) {
    notify(
      "❌ APK.TW 自動簽到",
      "驗證失敗",
      "formhash 或登入狀態異常，請重新登入 APK.TW。"
    );

    return;
  }

  /*
   * 10. 你的實際封包成功回應：
   *
   * <img src="./source/plugin/dsu_amupper/images/wb.gif">
   */

  const serverSuccess =
    /source\/plugin\/dsu_amupper\/images\/wb\.gif/i.test(
      sign.body
    ) ||
    /dsu_amupper\/images\/wb\.gif/i.test(
      sign.body
    );

  /*
   * 11. 再抓一次首頁確認
   */

  let verified = false;

  try {
    const verify = await httpGet(
      HOME_URL,
      baseHeaders(cookie)
    );

    cookie = mergeSetCookies(
      cookie,
      verify.headers
    );

    $persistentStore.write(
      cookie,
      COOKIE_KEY
    );

    verified =
      isSignedHome(verify.body);
  } catch (e) {
    console.log(
      "二次驗證失敗：" + e
    );
  }

  /*
   * 12. 最終結果
   */

  if (serverSuccess || verified) {
    $persistentStore.write(
      today(),
      LAST_SUCCESS_KEY
    );

    notify(
      "✅ APK.TW 每日簽到",
      "簽到成功",
      verified
        ? "已完成簽到，並通過首頁狀態驗證。"
        : "APK.TW 已回傳簽到完成狀態。"
    );

    return;
  }

  /*
   * HTTP 非 200
   */

  if (sign.status < 200 || sign.status >= 300) {
    notify(
      "❌ APK.TW 自動簽到",
      "HTTP " + sign.status,
      "APK.TW 伺服器回傳異常狀態。"
    );

    return;
  }

  /*
   * 無法辨識
   */

  notify(
    "⚠️ APK.TW 自動簽到",
    "結果無法確認",
    "伺服器有回應，但沒有找到 wb.gif。請查看 Surge 腳本紀錄。"
  );
}

/*
 * ===============================
 * 執行
 * ===============================
 */

main()
  .catch(function (e) {
    console.log(
      "APK.TW 自動簽到錯誤：" +
        e
    );

    notify(
      "❌ APK.TW 自動簽到",
      "執行錯誤",
      String(e)
    );
  })
  .finally(function () {
    $done();
  });
