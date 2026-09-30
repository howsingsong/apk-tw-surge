/*
 * APK.TW Login Keep Alive V2
 * Author: howsingsong
 */

const COOKIE_KEY =
  "APK_TW_COOKIE_V2";

const UA_KEY =
  "APK_TW_UA";

let cookie =
  $persistentStore.read(
    COOKIE_KEY
  ) || "";

const ua =
  $persistentStore.read(
    UA_KEY
  ) ||
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1";

function hasAuth(str) {
  return /(?:^|;\s*)[^=;]+_auth=[^;]+/i.test(
    str || ""
  );
}

function cookieObject(str) {
  const result = {};

  String(str || "")
    .split(/;\s*/)
    .forEach(part => {
      const p =
        part.indexOf("=");

      if (p <= 0) return;

      result[
        part.substring(
          0,
          p
        ).trim()
      ] =
        part.substring(
          p + 1
        );
    });

  return result;
}

function headerValues(
  headers,
  name
) {
  const result = [];

  if (Array.isArray(headers)) {
    headers.forEach(h => {
      if (
        h &&
        h.field &&
        h.field.toLowerCase() ===
          name.toLowerCase()
      ) {
        result.push(
          String(
            h.value || ""
          )
        );
      }
    });
  }

  return result;
}

function merge(headers) {
  const map =
    cookieObject(cookie);

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
      first.substring(
        0,
        p
      ).trim();

    const value =
      first.substring(
        p + 1
      );

    if (
      /^deleted$/i.test(value) ||
      /max-age\s*=\s*0/i.test(line) ||
      /expires\s*=\s*.*1970/i.test(line)
    ) {
      delete map[name];
    } else {
      map[name] = value;
    }
  });

  cookie =
    Object.keys(map)
      .map(
        k =>
          `${k}=${map[k]}`
      )
      .join("; ");

  $persistentStore.write(
    cookie,
    COOKIE_KEY
  );
}

function run() {
  if (!hasAuth(cookie)) {
    console.log(
      "APK.TW：沒有有效 auth Cookie"
    );

    $done();
    return;
  }

  $httpClient.get(
    {
      url:
        "https://apk.tw/forum.php",

      headers: {
        "User-Agent": ua,
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "zh-TW,zh-Hant;q=0.9",

        "Cookie": cookie
      },

      timeout: 15,
      "auto-cookie": false,
      "auto-redirect": true,
      "full-header-mode": true
    },

    (
      error,
      response,
      data
    ) => {
      if (error) {
        console.log(
          "APK.TW 保活失敗：" +
            error
        );

        $done();
        return;
      }

      if (response) {
        merge(
          response.headers
        );
      }

      const body =
        String(data || "");

      if (
        /您需要先登錄才能繼續本操作/i.test(
          body
        )
      ) {
        console.log(
          "APK.TW：登入可能已失效"
        );
      } else {
        console.log(
          "APK.TW：登入保活完成"
        );
      }

      $done();
    }
  );
}

run();
